# Production Recovery Runbooks

Use this document for the Azure Container Apps production deployment. It covers the repository defaults `RG-Boilerplate-SingleTenant-Hono`, `singletenant-hono-api`, `singletenant-hono-web`, and `singletenant-hono-admin`; substitute the effective production values when overrides are configured.

These runbooks do **not** assert that backups, alert rules, environment approvals, provider replay windows, or disaster-recovery replicas exist. PostgreSQL is external to this repository's Bicep deployment. The named owners must configure and exercise those controls outside this repository before relying on them.

## Required operator record

Complete this table in the production operations system; do not replace placeholders here with secrets.

| Field | Required value |
| --- | --- |
| Incident commander | `<SET: person/team/on-call rotation>` |
| Application/Container Apps owner | `<SET: person/team/on-call rotation>` |
| PostgreSQL owner | `<SET: person/team/on-call rotation>` |
| Security and secret-rotation owner | `<SET: person/team/on-call rotation>` |
| Dodo owner | `<SET: person/team/on-call rotation>` |
| Inngest owner | `<SET: person/team/on-call rotation>` |
| Privacy Blob owner | `<SET: person/team/on-call rotation>` |
| Monitoring and alerting owner | `<SET: person/team/on-call rotation>` |
| Communications owner | `<SET: person/team/on-call rotation>` |
| Service RTO | `<SET: approved duration>` |
| Service RPO | `<SET: approved duration/data-loss tolerance>` |
| PostgreSQL backup retention | `<SET: externally configured and verified value>` |
| Last restore exercise | `<SET: timestamp, evidence link, result>` |
| Incident channel and status page | `<SET: links>` |

Before production launch, the owners must also record escalation contacts, Azure subscription/resource groups, PostgreSQL server and network access, provider account identifiers, and the location of credentials. Keep values in the approved operations/secret systems, not in this repository.

## Safe command setup

Run recovery commands from an authenticated operator workstation. Every value containing `<required: ...>` is a required substitution. The checks deliberately stop if a placeholder remains.

```bash
set -euo pipefail

export AZURE_SUBSCRIPTION_ID="<required: production subscription UUID>"
export AZURE_RESOURCE_GROUP_NAME="${AZURE_RESOURCE_GROUP_NAME:-RG-Boilerplate-SingleTenant-Hono}"
export AZURE_ENVIRONMENT_NAME="${AZURE_ENVIRONMENT_NAME:-production}"
export APP_NAME="${APP_NAME:-singletenant-hono}"
export API_URL="<required: production API origin, no trailing slash>"
export WEB_URL="<required: production web origin, no trailing slash>"
export ADMIN_URL="<required: production admin origin, no trailing slash>"

for name in AZURE_SUBSCRIPTION_ID API_URL WEB_URL ADMIN_URL; do
  value="${!name}"
  if [[ -z "${value}" || "${value}" == '<required:'* ]]; then
    printf 'Set %s before continuing.\n' "${name}" >&2
    exit 1
  fi
done

normalized_name="$(printf '%s' "${APP_NAME}" | tr '[:upper:]_' '[:lower:]-')"
export API_APP_NAME="${normalized_name}-api"
export WEB_APP_NAME="${normalized_name}-web"
export ADMIN_APP_NAME="${normalized_name}-admin"
export API_APP_NAME="${API_APP_NAME:0:32}"
export WEB_APP_NAME="${WEB_APP_NAME:0:32}"
export ADMIN_APP_NAME="${ADMIN_APP_NAME:0:32}"

az account set --subscription "${AZURE_SUBSCRIPTION_ID}"
az account show --query '{subscription:id,tenant:tenantId,user:user.name}' --output table
az group exists --name "${AZURE_RESOURCE_GROUP_NAME}"

az acr list \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --query "[?tags.app=='${APP_NAME}' && tags.environment=='${AZURE_ENVIRONMENT_NAME}'].[name,loginServer]" \
  --output table
```

**Safety check:** confirm the subscription, tenant, resource group, three app names, URLs, and exactly one tagged ACR before any mutating command. Record the incident start time and freeze unrelated production deployments. Never paste credentials into the incident record.

## Alert triage and containment

This repository routes application logs to Log Analytics but does not prove that alert rules, action groups, or paging integrations exist. The monitoring owner must configure them externally and map every alert to an owner and severity before launch.

1. Assign the incident commander and subsystem owner. Acknowledge the external alert, record detection time, symptoms, affected users, last known good time, and the applicable RTO/RPO.
2. Pause unrelated deployments. Do not cancel a migration that may still be changing schema until the PostgreSQL owner has identified its state.
3. Capture current state before changing it:

```bash
for app in "${API_APP_NAME}" "${WEB_APP_NAME}" "${ADMIN_APP_NAME}"; do
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
    --name "${app}" \
    --query '{name:name,provisioning:properties.provisioningState,latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,image:properties.template.containers[0].image}' \
    --output json
done

curl --fail-with-body --max-time 10 "${API_URL}/health"
curl --fail-with-body --max-time 10 "${API_URL}/ready"
```

`/health` is liveness only. A successful `/health` does not prove PostgreSQL or required module dependencies are available. `/ready` is the readiness decision point and returns non-success when PostgreSQL or a required check is unavailable.

4. Inspect platform and application logs without exposing secrets:

```bash
az containerapp logs show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${API_APP_NAME}" \
  --type system \
  --tail 100

az containerapp logs show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${API_APP_NAME}" \
  --type console \
  --tail 100
```

Classify the primary fault before recovery:

| Signal | First owner/action |
| --- | --- |
| `/health` fails or no ready revision | Container Apps owner; inspect revision, image pull, startup, probes, and platform events |
| `/health` succeeds but `/ready` fails | PostgreSQL/module owner; inspect dependency connectivity before restarting healthy containers |
| Web/admin fails but API is ready | Frontend owner; inspect the corresponding revision and baked public URLs |
| Migration job fails | PostgreSQL and application owners; use the failed-migration runbook below |
| `ImagePull`/registry authorization errors | Container Apps/ACR owner; verify managed identity and `AcrPull` |
| Dodo webhook failures or financial mismatch | Dodo owner; stop automated replay until event identity and idempotency are checked |
| Inngest sync/run failures or outbox backlog | Inngest owner; distinguish an unpublished outbox event from an accepted Inngest run |
| Privacy export failures | Privacy Blob owner; verify API readiness, storage authorization/secret, private container, and lifecycle behavior |

**Containment success:** the fault domain is identified, concurrent deploys are frozen, evidence is retained, and the chosen action has an owner and explicit data-loss assessment.

## Roll back an application image

Use image rollback for bad application code when the current database schema remains backward compatible. Database migrations are forward-only; changing an image does not undo a migration.

1. List revisions and immutable image references. Do not select a tag only because it is the previous timestamp; tie it to a known successful commit/deployment.

```bash
export TARGET_APP="${API_APP_NAME}" # or WEB_APP_NAME / ADMIN_APP_NAME

az containerapp revision list \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${TARGET_APP}" \
  --query '[].{revision:name,active:properties.active,health:properties.healthState,created:properties.createdTime,image:properties.template.containers[0].image}' \
  --output table

az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${TARGET_APP}" \
  --query '{currentImage:properties.template.containers[0].image,currentRevision:properties.latestRevisionName,readyRevision:properties.latestReadyRevisionName}' \
  --output json
```

2. Have the PostgreSQL owner confirm that the target image can run against every applied migration. If compatibility is unknown, forward-fix instead of rolling back.
3. Set and verify the exact existing ACR image. `TARGET_IMAGE` must include the registry, repository, and immutable deployment tag or digest.

```bash
export ACR_NAME="<required: exact tagged ACR name from setup>"
export TARGET_IMAGE="<required: login-server/repository:immutable-tag or @sha256:digest>"

if [[ "${ACR_NAME}" == '<required:'* || "${TARGET_IMAGE}" == '<required:'* ]]; then
  echo 'Set ACR_NAME and TARGET_IMAGE.' >&2
  exit 1
fi

image_in_repository="${TARGET_IMAGE#*/}"
az acr repository show --name "${ACR_NAME}" --image "${image_in_repository}" --output none

new_revision="$(az containerapp update \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${TARGET_APP}" \
  --image "${TARGET_IMAGE}" \
  --query properties.latestRevisionName \
  --output tsv)"

az containerapp revision show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${TARGET_APP}" \
  --revision "${new_revision}" \
  --query '{revision:name,running:properties.runningState,health:properties.healthState,image:properties.template.containers[0].image}' \
  --output json
```

4. Run the recovery verification checklist. For API rollback, both `/health` and `/ready` must pass. For web/admin rollback, the page and its API-dependent authenticated smoke path must pass.

**Rollback success:** `latestReadyRevisionName` is the new revision, its image exactly matches `TARGET_IMAGE`, the verification checklist passes, and error rate/backlog stops increasing. If not, preserve the failed revision evidence and proceed to dependency recovery or a forward fix.

## Redeploy a known commit

Prefer rerunning the existing `Azure App Deploy to Production` run for a commit whose `CI` run succeeded. This preserves the repository's CI-success and production-environment gates.

```bash
gh run list --workflow deploy-production.yml --branch main --limit 20
gh run view "<required: deploy run ID>" --json headSha,event,status,conclusion,url
gh run rerun "<required: deploy run ID>"
gh run watch "<required: deploy run ID>" --exit-status
```

Confirm the displayed `headSha` before rerunning and obtain the production environment approval. The manual bypass is break-glass only, deploys all three apps, and runs migrations:

```bash
gh workflow run deploy-production.yml \
  --ref main \
  --field confirm_ci_bypass=deploy-without-ci
```

Use the bypass only after the incident commander records why waiting for CI would violate the approved RTO, which commit is being deployed, which checks were performed independently, and who approved it. It does not remove the production environment approval gate.

**Redeploy success:** the workflow completes for the intended SHA, all intended Container Apps report that deployment's image as the latest ready revision, and the recovery verification checklist passes.

## PostgreSQL point-in-time restore and verification

### Prerequisites

The PostgreSQL owner must verify externally, before an incident:

- PITR/backup retention is enabled and meets the approved RPO;
- the restore operator has access without placing administrator credentials in application runtime;
- private networking/firewall/DNS permits verification of a restored server;
- distinct runtime and migration roles/URLs are available;
- a restore exercise has proven application-level checks, not only server creation.

Check the source configuration; do not infer protection from this repository:

```bash
export POSTGRES_RESOURCE_GROUP_NAME="<required: external PostgreSQL resource group>"
export POSTGRES_SERVER_NAME="<required: source Flexible Server name, not FQDN>"

az postgres flexible-server show \
  --resource-group "${POSTGRES_RESOURCE_GROUP_NAME}" \
  --name "${POSTGRES_SERVER_NAME}" \
  --query '{id:id,state:state,version:version,retentionDays:backup.backupRetentionDays,geoRedundant:backup.geoRedundantBackup,fqdn:fullyQualifiedDomainName}' \
  --output json
```

Stop if the configured retention cannot cover the requested restore time. An RPO target is not proof that a usable restore point exists.

### Restore to a new server

Never overwrite or immediately repoint production. Restore to a new, uniquely named server, initially isolated from application traffic.

```bash
export RESTORE_TIME_UTC="<required: ISO-8601 UTC time inside verified retention, for example 2026-08-10T12:34:00Z>"
export RESTORE_SERVER_NAME="<required: new globally unique Flexible Server name>"

source_server_id="$(az postgres flexible-server show \
  --resource-group "${POSTGRES_RESOURCE_GROUP_NAME}" \
  --name "${POSTGRES_SERVER_NAME}" \
  --query id --output tsv)"

az postgres flexible-server restore \
  --resource-group "${POSTGRES_RESOURCE_GROUP_NAME}" \
  --name "${RESTORE_SERVER_NAME}" \
  --source-server "${source_server_id}" \
  --restore-time "${RESTORE_TIME_UTC}"

az postgres flexible-server show \
  --resource-group "${POSTGRES_RESOURCE_GROUP_NAME}" \
  --name "${RESTORE_SERVER_NAME}" \
  --query '{state:state,fqdn:fullyQualifiedDomainName,version:version}' \
  --output json
```

Recreate/verify the approved network controls and the restored roles. Build two secret URLs without printing them: `RESTORE_RUNTIME_DATABASE_URL` from `POSTGRES_RUNTIME_LOGIN`/`POSTGRES_RUNTIME_PASSWORD`, and `RESTORE_MIGRATION_DATABASE_URL` from `POSTGRES_MIGRATION_LOGIN`/`POSTGRES_MIGRATION_PASSWORD`. Never give the API the migration or administrator URL.

### Verify before cutover

Run read-only checks from an approved network location. Do not echo either URL.

```bash
read -rsp 'Restored runtime database URL: ' RESTORE_RUNTIME_DATABASE_URL; echo
read -rsp 'Restored migration database URL: ' RESTORE_MIGRATION_DATABASE_URL; echo

psql "${RESTORE_RUNTIME_DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -c 'select current_database(), current_user, now();'

psql "${RESTORE_MIGRATION_DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -c 'select count(*) as applied_migrations from public.__drizzle_migrations;'

unset RESTORE_RUNTIME_DATABASE_URL RESTORE_MIGRATION_DATABASE_URL
```

Then verify, against the incident's expected restore time:

- the latest migration recorded in `public.__drizzle_migrations` is expected;
- required schemas/tables/indexes exist;
- approved business invariants and representative row counts match the expected point;
- a quarantined API revision using the **runtime** URL reaches `/ready` and completes approved read-only user/admin checks;
- Dodo webhook IDs, background event IDs, credit/entitlement balances, audit records, and privacy export metadata satisfy the documented application invariants;
- the measured data loss is within the approved RPO.

Do not use synthetic production writes unless the PostgreSQL and application owners approve a disposable record and cleanup procedure.

### Decide and cut over

The incident commander, PostgreSQL owner, and application owner must record: source of corruption, restore timestamp, measured data loss, schema compatibility, and approval. Establish an explicit write freeze before final comparison and cutover. Update `POSTGRES_SERVER_FQDN` and the separate `POSTGRES_RUNTIME_LOGIN`/`POSTGRES_RUNTIME_PASSWORD` and `POSTGRES_MIGRATION_LOGIN`/`POSTGRES_MIGRATION_PASSWORD` production values, then run the guarded production deployment. `POSTGRES_ADMIN_LOGIN`/`POSTGRES_ADMIN_PASSWORD` are infrastructure bootstrap credentials only. The API's `database-url` secret must be built from the runtime role; workflow-only `MIGRATION_DATABASE_URL` must be built from the migration role and never stored in the app.

Keep the old server isolated and unchanged for the approved evidence/rollback window. Do not delete it as part of incident response.

**Restore success:** the new server is `Ready`, role separation is proven, application readiness and invariants pass, measured loss is within RPO, and post-cutover writes/background processing remain healthy.

## Failed migration handling

The policy is **forward fix**. Never edit or delete an applied migration, mark a failed migration successful by hand, or put an administrator/migration URL into API runtime.

1. Freeze application deploys. If the previous app is still serving and schema-compatible, leave it serving.
2. Confirm the temporary GitHub Actions PostgreSQL firewall rule was removed; delete only the exact incident/run-specific rule if cleanup failed.
3. Retain the failed workflow logs and identify the migration and SQL statement.
4. Inspect the database with the migration role:

```bash
read -rsp 'Migration database URL: ' MIGRATION_DATABASE_URL; echo
psql "${MIGRATION_DATABASE_URL}" -X -v ON_ERROR_STOP=1 \
  -c 'select id, hash, created_at from public.__drizzle_migrations order by created_at desc limit 20;'
unset MIGRATION_DATABASE_URL
```

5. Determine whether the statement committed, rolled back, or partially changed objects. Do not assume transactional behavior for every PostgreSQL DDL operation.
6. Create a new idempotent corrective migration in a new commit, run repository migration checks and CI, then deploy through the normal CI-success and production gates. Re-running `bun run db:migrate` is safe only after the PostgreSQL owner has reconciled actual schema state with migration history.

Choose PITR instead of forward fix only when all are true:

- the failure caused corruption or an incompatible partial change that cannot be safely corrected inside the approved RTO;
- a verified restore point exists within RPO;
- replay/reconciliation of post-restore Dodo, Inngest, and user writes is planned;
- the incident commander, PostgreSQL owner, and application owner approve the measured data loss.

**Migration recovery success:** migration history and actual schema agree, the corrective migration passes on a production-like copy, the guarded deployment completes, `/ready` succeeds, and application invariants remain correct.

## Secret rotation

### Common two-phase procedure

1. Identify owner, consumers, expiry/exposure reason, and whether the provider supports overlapping credentials.
2. Create a replacement without revoking the active value. Store it only in the approved secret manager/GitHub production secret scope.
3. Reconcile the API secret and force a new revision/restart; changing a Container App secret alone does not prove running replicas consumed it.
4. Verify the replacement on the latest ready revision.
5. Revoke the old value, verify again, and record completion. If overlap is impossible, schedule a write freeze/maintenance window against the approved RTO.

Do not print values, place them in command history, logs, tickets, or Git. Use the existing Container App secret references; never add administrator credentials as runtime fallback.

| Credential | Owner and safe order | Success criteria |
| --- | --- | --- |
| Azure deployment identity | Security/Azure owner. Production uses GitHub OIDC (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`), not `AZURE_CLIENT_SECRET`. Replace/repair the federated credential or workload identity and least-privilege role assignments, update GitHub variables, test the guarded workflow, then revoke the old identity access. | OIDC login succeeds only from the intended repo/environment/ref; guarded deploy succeeds; old identity has no role/federated access. |
| PostgreSQL runtime and migration roles | PostgreSQL owner. Rotate `POSTGRES_RUNTIME_PASSWORD` and `POSTGRES_MIGRATION_PASSWORD` separately (with matching `POSTGRES_RUNTIME_LOGIN` and `POSTGRES_MIGRATION_LOGIN` variables), reconcile, verify, then revoke the old password. `POSTGRES_ADMIN_LOGIN`/`POSTGRES_ADMIN_PASSWORD` remain bootstrap-only. The API `database-url` secret is built only from runtime credentials; workflow-only `MIGRATION_DATABASE_URL` is built only from migration credentials. | `/ready` and an approved application smoke path pass with runtime role; `bun run db:migrate` uses the migration role; crossed/old credentials fail as expected. |
| Dodo API key | Dodo owner. Create replacement in the correct `test_mode`/`live_mode` account, update `DODO_PAYMENTS_API_KEY`, reconcile API, verify a non-mutating provider call or approved test transaction, then revoke old. Preserve the live-mode sentinel and environment/brand checks. | Correct Dodo environment/brand is observed, approved transaction/reconciliation succeeds, old key is rejected. |
| Dodo webhook secret | Dodo owner. If Dodo supports overlap, accept new while retaining old during propagation; otherwise use an approved short delivery pause. Update `DODO_PAYMENTS_WEBHOOK_SECRET`, reconcile, send a provider test event, then revoke old and replay only identified missed events. | Signed test event appears exactly once in the webhook monitor; invalid signatures fail; no unexplained failed/pending events. |
| Inngest event key | Inngest owner. Generate replacement, update `INNGEST_EVENT_KEY`, reconcile API, publish a disposable approved event, then revoke old. | Outbox event becomes `published` with an Inngest event ID; old key can no longer publish. |
| Inngest signing key | Inngest owner. Put the previous key in `INNGEST_SIGNING_KEY_FALLBACK`, set the new primary `INNGEST_SIGNING_KEY`, reconcile/restart, resync, wait through the provider propagation window, then remove fallback and revoke old. | Inngest function invocation signatures succeed with new key; old key fails after fallback removal. |
| Inngest API key (optional) | Inngest owner. If programmatic deployment sync is enabled, replace `INNGEST_API_KEY`, run an explicit sync, then revoke the old key. It is not an API runtime credential. Without this key, use **Resync App** in Inngest Cloud. | Sync succeeds and the dashboard shows the expected app/functions; when rotating a key, the old API key is rejected. |
| Privacy Blob connection string/key | Privacy Blob owner. Determine which storage account key is active. Regenerate only the inactive key, switch `privacy-export-storage-connection-string`, restart/verify API export, then regenerate the old key. Never regenerate both together. | A disposable authorized export is written/read through the application, blob remains private, expiry works, and old connection string fails. |

For the Blob key rollover, first discover exactly one storage account tagged for this app/environment and inspect key names without printing key values:

```bash
az storage account list \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --query "[?tags.app=='${APP_NAME}' && tags.environment=='${AZURE_ENVIRONMENT_NAME}' && tags.purpose=='privacy-exports'].[name,primaryEndpoints.blob]" \
  --output table

export PRIVACY_STORAGE_ACCOUNT="<required: exact account from the single match>"
az storage account keys list \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --account-name "${PRIVACY_STORAGE_ACCOUNT}" \
  --query '[].{keyName:keyName,creationTime:creationTime}' \
  --output table
```

Only after independently identifying the inactive key, renew it and obtain its connection string into a shell variable without echoing it:

```bash
export INACTIVE_KEY="<required: primary or secondary, proven inactive>"
az storage account keys renew \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --account-name "${PRIVACY_STORAGE_ACCOUNT}" \
  --key "${INACTIVE_KEY}" \
  --output none

new_blob_connection="$(az storage account show-connection-string \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${PRIVACY_STORAGE_ACCOUNT}" \
  --key "${INACTIVE_KEY}" \
  --query connectionString --output tsv)"

az containerapp secret set \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${API_APP_NAME}" \
  --secrets "privacy-export-storage-connection-string=${new_blob_connection}" \
  --output none
unset new_blob_connection

ready_revision="$(az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${API_APP_NAME}" \
  --query properties.latestReadyRevisionName --output tsv)"
az containerapp revision restart \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${API_APP_NAME}" \
  --revision "${ready_revision}"
```

Do not renew the formerly active key until application export verification succeeds on the replacement.

## Container Apps and ACR recovery

### Revision/startup failure

1. Capture the failing revision's system/console logs and current image.
2. Confirm image existence and API architecture/startup failure before restarting; repeated restarts do not repair a missing image, bad secret, or dependency outage.
3. If the previous image is schema-compatible, use the image rollback runbook. Otherwise forward-fix and redeploy.
4. If a secret was changed, confirm secret references by name only and create/restart a revision; do not retrieve secret values into logs.

### ACR pull failure

Container Apps must pull with managed identity and `AcrPull`, never ACR administrator credentials.

```bash
export ACR_NAME="<required: exact tagged ACR name>"
acr_id="$(az acr show --name "${ACR_NAME}" --query id --output tsv)"
acr_login_server="$(az acr show --name "${ACR_NAME}" --query loginServer --output tsv)"

check_app_acr_identity() {
  local app="$1"
  local identity_id principal_id

  identity_id="$(az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
    --name "${app}" \
    --query "properties.configuration.registries[?server=='${acr_login_server}'].identity | [0]" \
    --output tsv)"
  if [[ -z "${identity_id}" ]]; then
    printf '%s has no user-assigned registry identity for %s.\n' "${app}" "${acr_login_server}" >&2
    return 1
  fi

  principal_id="$(az identity show --ids "${identity_id}" --query principalId --output tsv)"
  az role assignment list \
    --assignee-object-id "${principal_id}" \
    --scope "${acr_id}" \
    --query "[?roleDefinitionName=='AcrPull'].{role:roleDefinitionName,scope:scope}" \
    --output table
}

check_app_acr_identity "${API_APP_NAME}"
check_app_acr_identity "${WEB_APP_NAME}"
check_app_acr_identity "${ADMIN_APP_NAME}"
```

Each check must print exactly one `AcrPull` assignment at the ACR scope. If an identity or assignment is missing, prefer rerunning the reviewed `Azure Production Infra` workflow, which declares one user-assigned registry identity per app. An authorized Azure owner may repair an exact missing assignment for one verified app:

```bash
export TARGET_APP="${API_APP_NAME}" # or WEB_APP_NAME / ADMIN_APP_NAME
identity_id="$(az containerapp show \
  --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
  --name "${TARGET_APP}" \
  --query "properties.configuration.registries[?server=='${acr_login_server}'].identity | [0]" \
  --output tsv)"
principal_id="$(az identity show --ids "${identity_id}" --query principalId --output tsv)"

az role assignment create \
  --assignee-object-id "${principal_id}" \
  --assignee-principal-type ServicePrincipal \
  --role AcrPull \
  --scope "${acr_id}"
```

Verify that the repaired app's registry entry names the intended user-assigned identity and that no registry username/password or ACR admin fallback was introduced.

### Missing or damaged ACR

The Bicep stack can recreate infrastructure, but this repository does not guarantee registry backup or replication. Before acting, determine whether the registry or only an image/tag is missing. If an immutable image exists, redeploy it. If it does not, rebuild from the exact reviewed commit through the guarded workflow into a new immutable tag; do not silently reuse a mutable tag. If ACR itself was deleted, rerun reviewed infrastructure only after confirming resource name, role assignments, retention implications, and image rebuild source.

**ACR recovery success:** the intended digest exists, each app identity has scoped `AcrPull`, no admin credential is configured, a new revision pulls the intended digest, and all recovery verification checks pass.

## Inngest resync and redrive

First distinguish:

- **Sync failure:** functions at `${API_URL}/api/inngest` are not registered/current in Inngest.
- **Outbox publication failure:** an application `background_event` is `failed`/`pending` and has not been accepted by Inngest.
- **Run failure:** Inngest accepted the event and a function run failed.

### Resync functions

Use **Resync App** for the production environment in Inngest Cloud when no `INNGEST_API_KEY` is configured. For programmatic resync, run:

```bash
export INNGEST_APP_ID="${INNGEST_APP_ID:-singletenant-hono-api}"
read -rsp 'Inngest API key: ' INNGEST_API_KEY; echo

curl --fail-with-body --retry 5 --retry-all-errors \
  --request POST \
  --header "Authorization: Bearer ${INNGEST_API_KEY}" \
  --header 'Content-Type: application/json' \
  --data "$(jq -cn --arg url "${API_URL}/api/inngest" '{url:$url}')" \
  "https://api.inngest.com/v2/apps/${INNGEST_APP_ID}/syncs"

unset INNGEST_API_KEY
```

Verify in Inngest that the app ID and serve URL are exact and expected functions are present, including platform billing reconciliation, payment webhook recovery, privacy export expiry/generation, email delivery, pending-event publishing, and operational cleanup as applicable to the deployed commit.

### Redrive safely

- If the event never reached Inngest, use the authenticated Admin Operations background-events view. Confirm event ID, name, payload, attempt count, error, and that the business side effect has not already completed. Redrive once and require the event to become `published` with an Inngest event ID.
- If Inngest accepted it, replay the failed run in the Inngest dashboard rather than creating a second application event. Confirm function idempotency/business state first.
- For Dodo/payment events, compare provider event/payment IDs and local webhook state before any replay. Escalate ambiguity to the Dodo and PostgreSQL owners.

The API endpoint used by the Admin Operations UI is `POST /admin/operations/background-events/:eventId/redrive` and requires both an authenticated admin session and `ADMIN_SECRET`. A break-glass command is:

```bash
export EVENT_ID="<required: verified background event UUID>"
read -rsp 'Authenticated admin Cookie header value: ' ADMIN_COOKIE; echo
read -rsp 'ADMIN_SECRET: ' ADMIN_SECRET; echo

jq -cn --arg secret "${ADMIN_SECRET}" '{secret:$secret}' | \
  curl --fail-with-body \
    --request POST \
    --header 'Content-Type: application/json' \
    --header "Cookie: ${ADMIN_COOKIE}" \
    --data-binary @- \
    "${API_URL}/admin/operations/background-events/${EVENT_ID}/redrive"

unset ADMIN_COOKIE ADMIN_SECRET
```

**Success:** exactly one intended event/run succeeds, the outbox and Inngest identifiers correlate, backlog decreases, and the business invariant is unchanged or moves once to the intended state.

## Recovery verification and closure

Run after every recovery action:

```bash
set -euo pipefail

health_code="$(curl --silent --show-error --output /tmp/api-health.json --write-out '%{http_code}' "${API_URL}/health")"
ready_code="$(curl --silent --show-error --output /tmp/api-ready.json --write-out '%{http_code}' "${API_URL}/ready")"
test "${health_code}" = 200
test "${ready_code}" = 200
jq -e '.success == true' /tmp/api-health.json >/dev/null
jq -e '.success == true' /tmp/api-ready.json >/dev/null
rm -f /tmp/api-health.json /tmp/api-ready.json

curl --fail --silent --show-error --location --output /dev/null "${WEB_URL}/"
curl --fail --silent --show-error --location --output /dev/null "${ADMIN_URL}/"

for app in "${API_APP_NAME}" "${WEB_APP_NAME}" "${ADMIN_APP_NAME}"; do
  az containerapp show \
    --resource-group "${AZURE_RESOURCE_GROUP_NAME}" \
    --name "${app}" \
    --query '{name:name,provisioning:properties.provisioningState,latest:properties.latestRevisionName,ready:properties.latestReadyRevisionName,image:properties.template.containers[0].image}' \
    --output json
done
```

Also require owner sign-off for:

- intended revision/image digest and `latestReadyRevisionName` equality;
- PostgreSQL runtime connectivity, migration history, role separation, and approved business invariants;
- one authorized web sign-in and one authorized admin read path;
- Dodo environment/brand, webhook backlog, and financial reconciliation with no duplicate fulfillment;
- Inngest function sync plus failed/pending event and run backlog;
- a disposable privacy export through the application, private Blob access, and expiry behavior if Blob was affected;
- recent console/system logs with no continuing incident error pattern;
- alert recovery and notification delivery from the externally configured monitoring system.

Observe for the owner-approved stabilization period. Close only when the incident commander records actual recovery time versus RTO, measured data loss versus RPO, commands/change IDs, evidence links, residual risks, and follow-up owner/due dates. Restore normal deployments and revoke temporary access/firewall rules last.
