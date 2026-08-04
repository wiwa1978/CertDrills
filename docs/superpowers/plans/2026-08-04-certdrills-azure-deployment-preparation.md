# CertDrills Azure Deployment Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retarget the inherited Azure Container Apps deployment stack to CertDrills, document the first deployment, and configure the GitHub production environment without deploying resources or storing production secrets.

**Architecture:** Preserve the existing API, web, and admin Container Apps architecture and external PostgreSQL integration. Replace boilerplate defaults with CertDrills values, cover those defaults with source-contract tests, and configure GitHub environment variables from the active Azure account and existing PostgreSQL server.

**Tech Stack:** GitHub Actions, Azure CLI, GitHub CLI, Azure Bicep, Azure Container Apps, Azure Container Registry, PostgreSQL Flexible Server, Docker, Bun, Vitest.

---

## File Map

- Create `apps/api/tests/deployment/certdrills-production-defaults.test.ts`
  - Protects project-specific workflow defaults, example Bicep parameters, and deployment documentation from reverting to boilerplate values.
- Modify `.github/workflows/deploy-production-infra.yml`
  - Retargets the manual infrastructure bootstrap workflow.
- Modify `.github/workflows/deploy-production.yml`
  - Retargets the production application deployment workflow.
- Modify `.github/workflows/test.yml`
  - Removes stale boilerplate database and display-name defaults from CI.
- Modify `infra/main.parameters.example.json`
  - Provides CertDrills-specific example deployment parameters.
- Modify `README.md`
  - Documents Azure topology, prerequisites, workflow usage, GitHub variables, and production secrets.

No Bicep resource definitions or Dockerfiles should change unless a validation command exposes a CertDrills-specific defect.

### Task 1: Add Deployment Default Regression Tests

**Files:**
- Create: `apps/api/tests/deployment/certdrills-production-defaults.test.ts`
- Test: `apps/api/tests/deployment/certdrills-production-defaults.test.ts`

- [ ] **Step 1: Write the failing workflow and parameter tests**

Create `apps/api/tests/deployment/certdrills-production-defaults.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = join(process.cwd(), "../..");

function readRepositoryFile(path: string) {
  return readFileSync(join(repositoryRoot, path), "utf8");
}

describe("CertDrills production deployment defaults", () => {
  it.each([
    ".github/workflows/deploy-production-infra.yml",
    ".github/workflows/deploy-production.yml",
  ])("%s uses CertDrills Azure defaults", (path) => {
    const source = readRepositoryFile(path);

    expect(source).toContain("RG-CertDrills");
    expect(source).toContain("APP_NAME: ${{ vars.APP_NAME || 'certdrills' }}");
    expect(source).toContain("NEXT_PUBLIC_APP_NAME: ${{ vars.NEXT_PUBLIC_APP_NAME || 'CertDrills' }}");
    expect(source).toContain("NEXT_PUBLIC_ADMIN_APP_NAME: ${{ vars.NEXT_PUBLIC_ADMIN_APP_NAME || 'CertDrills Admin' }}");
    expect(source).toContain("POSTGRES_DATABASE_NAME: ${{ vars.POSTGRES_DATABASE_NAME || 'certdrills' }}");
    expect(source).not.toContain("RG-Boilerplate-SingleTenant-Hono");
    expect(source).not.toContain("singletenant-hono");
    expect(source).not.toContain("boilerplate-singletenant-hono");
    expect(source).not.toContain("SingleTenant Hono");
  });

  it("uses CertDrills example Bicep parameters", () => {
    const parameters = JSON.parse(
      readRepositoryFile("infra/main.parameters.example.json"),
    ) as {
      parameters: Record<string, { value: unknown }>;
    };

    expect(parameters.parameters.resourceGroupName?.value).toBe("RG-CertDrills");
    expect(parameters.parameters.appName?.value).toBe("certdrills");
    expect(parameters.parameters.postgresDatabaseName?.value).toBe("certdrills");
  });

  it("uses CertDrills CI defaults", () => {
    const source = readRepositoryFile(".github/workflows/test.yml");

    expect(source).toContain("POSTGRES_DB: certdrills_test");
    expect(source).toContain("NEXT_PUBLIC_APP_NAME: CertDrills Test");
    expect(source).not.toContain("boilerplate_singletenant_hono_test");
    expect(source).not.toContain("SingleTenant Hono Test");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails for stale boilerplate defaults**

Run:

```bash
bun run --cwd apps/api test tests/deployment/certdrills-production-defaults.test.ts
```

Expected: FAIL because both workflows and `infra/main.parameters.example.json` still contain boilerplate defaults.

### Task 2: Retarget Workflows and Example Parameters

**Files:**
- Modify: `.github/workflows/deploy-production-infra.yml:23-37`
- Modify: `.github/workflows/deploy-production.yml:115-127`
- Modify: `.github/workflows/test.yml:15-38`
- Modify: `infra/main.parameters.example.json:7-29`
- Test: `apps/api/tests/deployment/certdrills-production-defaults.test.ts`

- [ ] **Step 1: Replace infrastructure workflow defaults**

In `.github/workflows/deploy-production-infra.yml`, keep the variable override behavior and replace only the fallback values:

```yaml
      AZURE_LOCATION: ${{ vars.AZURE_LOCATION || 'germanywestcentral' }}
      AZURE_RESOURCE_GROUP_NAME: ${{ vars.AZURE_RESOURCE_GROUP_NAME || 'RG-CertDrills' }}
      AZURE_ENVIRONMENT_NAME: ${{ vars.AZURE_ENVIRONMENT_NAME || 'production' }}
      APP_NAME: ${{ vars.APP_NAME || 'certdrills' }}
      NEXT_PUBLIC_APP_NAME: ${{ vars.NEXT_PUBLIC_APP_NAME || 'CertDrills' }}
      NEXT_PUBLIC_ADMIN_APP_NAME: ${{ vars.NEXT_PUBLIC_ADMIN_APP_NAME || 'CertDrills Admin' }}
      PUBLIC_WEB_URL: ${{ vars.PUBLIC_WEB_URL }}
      PUBLIC_API_URL: ${{ vars.PUBLIC_API_URL }}
      PUBLIC_ADMIN_URL: ${{ vars.PUBLIC_ADMIN_URL }}
      COOKIE_DOMAIN: ${{ vars.COOKIE_DOMAIN }}
      BETTER_AUTH_ALLOWED_ORIGINS: ${{ vars.BETTER_AUTH_ALLOWED_ORIGINS }}
      DODO_PAYMENTS_ENVIRONMENT: ${{ vars.DODO_PAYMENTS_ENVIRONMENT || 'live_mode' }}
      POSTGRES_SERVER_FQDN: ${{ vars.POSTGRES_SERVER_FQDN }}
      POSTGRES_ADMIN_LOGIN: ${{ vars.POSTGRES_ADMIN_LOGIN }}
      POSTGRES_DATABASE_NAME: ${{ vars.POSTGRES_DATABASE_NAME || 'certdrills' }}
```

- [ ] **Step 2: Replace application workflow defaults**

In `.github/workflows/deploy-production.yml`, apply the same CertDrills fallbacks:

```yaml
      AZURE_LOCATION: ${{ vars.AZURE_LOCATION || 'germanywestcentral' }}
      AZURE_RESOURCE_GROUP_NAME: ${{ vars.AZURE_RESOURCE_GROUP_NAME || 'RG-CertDrills' }}
      AZURE_ENVIRONMENT_NAME: ${{ vars.AZURE_ENVIRONMENT_NAME || 'production' }}
      APP_NAME: ${{ vars.APP_NAME || 'certdrills' }}
      NEXT_PUBLIC_APP_NAME: ${{ vars.NEXT_PUBLIC_APP_NAME || 'CertDrills' }}
      NEXT_PUBLIC_ADMIN_APP_NAME: ${{ vars.NEXT_PUBLIC_ADMIN_APP_NAME || 'CertDrills Admin' }}
      PUBLIC_WEB_URL: ${{ vars.PUBLIC_WEB_URL }}
      PUBLIC_API_URL: ${{ vars.PUBLIC_API_URL }}
      PUBLIC_ADMIN_URL: ${{ vars.PUBLIC_ADMIN_URL }}
      DODO_PAYMENTS_ENVIRONMENT: ${{ vars.DODO_PAYMENTS_ENVIRONMENT || 'live_mode' }}
      POSTGRES_SERVER_FQDN: ${{ vars.POSTGRES_SERVER_FQDN }}
      POSTGRES_ADMIN_LOGIN: ${{ vars.POSTGRES_ADMIN_LOGIN }}
      POSTGRES_DATABASE_NAME: ${{ vars.POSTGRES_DATABASE_NAME || 'certdrills' }}
```

- [ ] **Step 3: Replace CI workflow defaults**

In `.github/workflows/test.yml`, replace the CI database and display-name
defaults:

```yaml
          POSTGRES_DB: certdrills_test
```

Update the PostgreSQL health check, `DATABASE_URL`, and `TEST_DATABASE_URL` to
use `certdrills_test`, then set:

```yaml
      NEXT_PUBLIC_APP_NAME: CertDrills Test
```

- [ ] **Step 4: Replace example Bicep parameter values**

Update `infra/main.parameters.example.json` so these entries are:

```json
{
  "resourceGroupName": {
    "value": "RG-CertDrills"
  },
  "appName": {
    "value": "certdrills"
  },
  "postgresDatabaseName": {
    "value": "certdrills"
  }
}
```

Keep the existing JSON structure and all unrelated parameters unchanged.

- [ ] **Step 5: Run the deployment default test**

Run:

```bash
bun run --cwd apps/api test tests/deployment/certdrills-production-defaults.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the existing custom-domain workflow tests**

Run:

```bash
bun run --cwd apps/api test tests/deployment/custom-domain-workflows.test.ts
```

Expected: PASS, proving generated/custom URL behavior was preserved.

- [ ] **Step 7: Commit the workflow defaults**

```bash
git add \
  .github/workflows/deploy-production-infra.yml \
  .github/workflows/deploy-production.yml \
  .github/workflows/test.yml \
  infra/main.parameters.example.json \
  apps/api/tests/deployment/certdrills-production-defaults.test.ts
git commit -m "ci: retarget Azure deployment to CertDrills" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 604b49be-e651-415f-81ab-de8b4a757c92"
```

### Task 3: Document First Production Deployment

**Files:**
- Modify: `apps/api/tests/deployment/certdrills-production-defaults.test.ts`
- Modify: `README.md`
- Test: `apps/api/tests/deployment/certdrills-production-defaults.test.ts`

- [ ] **Step 1: Add a failing README deployment contract test**

Append this test to `apps/api/tests/deployment/certdrills-production-defaults.test.ts`:

```ts
  it("documents the CertDrills production deployment prerequisites", () => {
    const readme = readRepositoryFile("README.md");

    expect(readme).toContain("## Azure Production Deployment");
    expect(readme).toContain("RG-CertDrills");
    expect(readme).toContain("pgwimwymedia");
    expect(readme).toContain("certdrills");
    expect(readme).toContain("deploy-production-infra.yml");
    expect(readme).toContain("deploy-production.yml");
    expect(readme).toContain("AZURE_RESOURCE_GROUP_NAME");
    expect(readme).toContain("POSTGRES_ADMIN_PASSWORD");
    expect(readme).toContain("Generated Azure Container Apps URLs");
    expect(readme).toContain("The workflow does not create the PostgreSQL database");
  });
```

- [ ] **Step 2: Run the test and verify the README contract fails**

Run:

```bash
bun run --cwd apps/api test tests/deployment/certdrills-production-defaults.test.ts
```

Expected: FAIL because `README.md` does not yet contain the Azure production deployment section.

- [ ] **Step 3: Add the Azure deployment section to the README**

Append a section titled `## Azure Production Deployment` to `README.md` with these subsections and facts:

```markdown
## Azure Production Deployment

CertDrills deploys as three Azure Container Apps in `RG-CertDrills`:

| App | Port | Purpose |
| --- | ---: | --- |
| `certdrills-api` | 8877 | Hono API |
| `certdrills-web` | 3200 | Learner web app |
| `certdrills-admin` | 3201 | Administration app |

The Bicep stack also manages Azure Container Registry, Log Analytics, and the
Container Apps environment. PostgreSQL remains on `pgwimwymedia` in
`RG-Wim-Wymedia`.

### Prerequisites

1. Create the `certdrills` database on `pgwimwymedia`.
2. Create the GitHub `production` environment.
3. Configure the production variables and secrets listed below.
4. Keep `PUBLIC_WEB_URL`, `PUBLIC_API_URL`, and `PUBLIC_ADMIN_URL` unset for the
   first deployment. The workflows then use Generated Azure Container Apps URLs.

The workflow does not create the PostgreSQL database.

### Production variables

| Variable | Value |
| --- | --- |
| `AZURE_SUBSCRIPTION_ID` | Azure subscription containing `RG-CertDrills` |
| `AZURE_TENANT_ID` | Tenant for the Azure deployment identity |
| `AZURE_LOCATION` | `germanywestcentral` |
| `AZURE_RESOURCE_GROUP_NAME` | `RG-CertDrills` |
| `AZURE_ENVIRONMENT_NAME` | `production` |
| `APP_NAME` | `certdrills` |
| `NEXT_PUBLIC_APP_NAME` | `CertDrills` |
| `NEXT_PUBLIC_ADMIN_APP_NAME` | `CertDrills Admin` |
| `POSTGRES_SERVER_FQDN` | FQDN of `pgwimwymedia` |
| `POSTGRES_ADMIN_LOGIN` | PostgreSQL administrator login |
| `POSTGRES_DATABASE_NAME` | `certdrills` |
| `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME` | `RG-Wim-Wymedia` |

### Production secrets

Configure these GitHub environment secrets with production-specific values:

`ADMIN_ALLOWLIST`, `ADMIN_SECRET`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`,
`BETTER_AUTH_SECRET`, `BILLING_RECONCILIATION_SECRET`,
`DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `JOBS_SECRET_KEY`, `JWT_SECRET`,
`OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET`,
`POSTGRES_ADMIN_PASSWORD`, `RESEND_API_KEY`, and `RESEND_FROM_EMAIL`.

Do not reuse local development secrets for production.

### First deployment

Run `.github/workflows/deploy-production-infra.yml` manually. It validates
configuration, reconciles infrastructure, builds and pushes all images, runs
migrations, configures the Container Apps, enables the API liveness probe, and
reports the generated HTTPS URLs.

### Subsequent deployments

After CI succeeds on `main`, `.github/workflows/deploy-production.yml` deploys
only affected applications, runs migrations when required, waits for healthy
revisions, and checks API health. Its manual dispatch remains available for a
guarded deployment override.
```

Use the repository's existing README style and line wrapping while preserving
all listed information.

- [ ] **Step 4: Run the deployment documentation test**

Run:

```bash
bun run --cwd apps/api test tests/deployment/certdrills-production-defaults.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit the deployment documentation**

```bash
git add README.md apps/api/tests/deployment/certdrills-production-defaults.test.ts
git commit -m "docs: add CertDrills Azure deployment guide" \
  -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>" \
  -m "Copilot-Session: 604b49be-e651-415f-81ab-de8b4a757c92"
```

### Task 4: Configure the GitHub Production Environment

**Files:**
- No repository file changes.

- [ ] **Step 1: Verify the selected Azure resources**

Run:

```bash
az account show --query '{subscription:id,tenant:tenantId}' --output json
az group show \
  --name RG-CertDrills \
  --query '{name:name,location:location,state:properties.provisioningState}' \
  --output json
az postgres flexible-server show \
  --resource-group RG-Wim-Wymedia \
  --name pgwimwymedia \
  --query '{fqdn:fullyQualifiedDomainName,admin:administratorLogin,state:state}' \
  --output json
```

Expected: the resource group is in `germanywestcentral`, and the PostgreSQL
server reports `Ready`.

- [ ] **Step 2: Create the GitHub production environment**

Run:

```bash
gh api \
  --method PUT \
  repos/wiwa1978/CertDrills/environments/production \
  --input - <<< '{}'
```

Expected: GitHub returns the `production` environment.

- [ ] **Step 3: Resolve Azure and PostgreSQL values without printing secrets**

Run:

```bash
subscription_id="$(az account show --query id --output tsv)"
tenant_id="$(az account show --query tenantId --output tsv)"
postgres_fqdn="$(az postgres flexible-server show \
  --resource-group RG-Wim-Wymedia \
  --name pgwimwymedia \
  --query fullyQualifiedDomainName \
  --output tsv)"
postgres_admin_login="$(az postgres flexible-server show \
  --resource-group RG-Wim-Wymedia \
  --name pgwimwymedia \
  --query administratorLogin \
  --output tsv)"

test -n "${subscription_id}"
test -n "${tenant_id}"
test -n "${postgres_fqdn}"
test -n "${postgres_admin_login}"
```

Expected: all four assertions succeed.

- [ ] **Step 4: Set GitHub production variables**

Run:

```bash
gh variable set AZURE_SUBSCRIPTION_ID --env production --body "${subscription_id}" --repo wiwa1978/CertDrills
gh variable set AZURE_TENANT_ID --env production --body "${tenant_id}" --repo wiwa1978/CertDrills
gh variable set AZURE_LOCATION --env production --body "germanywestcentral" --repo wiwa1978/CertDrills
gh variable set AZURE_RESOURCE_GROUP_NAME --env production --body "RG-CertDrills" --repo wiwa1978/CertDrills
gh variable set AZURE_ENVIRONMENT_NAME --env production --body "production" --repo wiwa1978/CertDrills
gh variable set APP_NAME --env production --body "certdrills" --repo wiwa1978/CertDrills
gh variable set NEXT_PUBLIC_APP_NAME --env production --body "CertDrills" --repo wiwa1978/CertDrills
gh variable set NEXT_PUBLIC_ADMIN_APP_NAME --env production --body "CertDrills Admin" --repo wiwa1978/CertDrills
gh variable set POSTGRES_SERVER_FQDN --env production --body "${postgres_fqdn}" --repo wiwa1978/CertDrills
gh variable set POSTGRES_ADMIN_LOGIN --env production --body "${postgres_admin_login}" --repo wiwa1978/CertDrills
gh variable set POSTGRES_DATABASE_NAME --env production --body "certdrills" --repo wiwa1978/CertDrills
gh variable set POSTGRES_FIREWALL_RESOURCE_GROUP_NAME --env production --body "RG-Wim-Wymedia" --repo wiwa1978/CertDrills
```

Do not set public URL variables or any secrets.

- [ ] **Step 5: Verify the configured environment variables**

Run:

```bash
gh variable list --env production --repo wiwa1978/CertDrills
gh secret list --env production --repo wiwa1978/CertDrills
```

Expected: all twelve non-secret variables are listed. No production secrets are
added by this task.

### Task 5: Validate the Deployment Preparation

**Files:**
- No intended file changes.

- [ ] **Step 1: Run all deployment tests**

Run:

```bash
bun run --cwd apps/api test tests/deployment
```

Expected: all deployment tests pass.

- [ ] **Step 2: Parse the workflow YAML**

Run:

```bash
ruby -e 'require "yaml"; ARGV.each { |path| YAML.parse_file(path) }' \
  .github/workflows/deploy-production-infra.yml \
  .github/workflows/deploy-production.yml \
  .github/workflows/test.yml
```

Expected: exit code 0 with no output.

- [ ] **Step 3: Compile the Bicep template**

Run:

```bash
az bicep build \
  --file infra/main.bicep \
  --outfile /tmp/certdrills-main.json
rm /tmp/certdrills-main.json
```

Expected: exit code 0 and the temporary compiled template is removed.

- [ ] **Step 4: Validate all Dockerfiles**

Run:

```bash
docker build --check -f apps/api/Dockerfile .
docker build --check -f apps/web/Dockerfile .
docker build --check -f apps/admin/Dockerfile .
```

Expected: all three checks exit successfully.

- [ ] **Step 5: Run database schema and type checks**

Run:

```bash
bun run db:check
bun run typecheck:all
```

Expected: both commands pass.

- [ ] **Step 6: Check formatting and stale active defaults**

Run:

```bash
git diff --check
rg -n \
  'RG-Boilerplate-SingleTenant-Hono|singletenant-hono|boilerplate-singletenant-hono|SingleTenant Hono' \
  .github/workflows infra/main.parameters.example.json README.md
```

Expected: `git diff --check` exits 0. The `rg` command returns no matches in
active deployment files or the README.

- [ ] **Step 7: Confirm no deployment or secret changes occurred**

Run:

```bash
az resource list \
  --resource-group RG-CertDrills \
  --query '[].{name:name,type:type}' \
  --output table
gh secret list --env production --repo wiwa1978/CertDrills
```

Expected: no Azure deployment was initiated by this plan, and GitHub lists no
new production secrets.
