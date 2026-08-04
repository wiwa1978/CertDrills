# CertDrills Azure Deployment Preparation Design

## Goal

Prepare CertDrills for its first Azure deployment by retargeting the inherited
Azure Container Apps deployment stack from the boilerplate project to
CertDrills and configuring the GitHub production environment.

## Current State

CertDrills already contains the deployment structure copied from
`Boilerplate-SingleTenant-Hono`:

- Dockerfiles for the API, web, and admin applications.
- Bicep templates for Azure Container Registry, Log Analytics, Azure Container
  Apps Environment, and three Container Apps.
- A manual infrastructure workflow.
- A production application workflow triggered after successful CI.

The application ports have already been adapted to CertDrills, but deployment
defaults still use the boilerplate resource group, app names, display names,
and database name. The GitHub repository has no configured production
variables or secrets.

Azure already contains an empty `RG-CertDrills` resource group in
`germanywestcentral`. PostgreSQL remains external on the existing
`pgwimwymedia` server in `RG-Wim-Wymedia`.

## Deployment Architecture

Keep the existing three-application Azure Container Apps architecture:

| Application | Container port | Exposure |
| --- | ---: | --- |
| API | 8877 | External HTTPS |
| Web | 3200 | External HTTPS |
| Admin | 3201 | External HTTPS |

The Bicep templates continue to manage:

- Azure Container Registry.
- Log Analytics workspace.
- Azure Container Apps Environment.
- API, web, and admin Container Apps.

The first deployment uses generated Azure Container Apps HTTPS FQDNs. Custom
domains are outside this preparation scope.

## Azure Defaults

Retarget deployment defaults to:

- Resource group: `RG-CertDrills`
- Location: `germanywestcentral`
- Environment: `production`
- App base name: `certdrills`
- Web display name: `CertDrills`
- Admin display name: `CertDrills Admin`
- PostgreSQL server: `pgwimwymedia`
- PostgreSQL firewall resource group: `RG-Wim-Wymedia`
- PostgreSQL database: `certdrills`

The user will create the `certdrills` database manually before the first
deployment. Workflows must not create or delete PostgreSQL databases.

## Repository Changes

Update:

- `.github/workflows/deploy-production-infra.yml`
- `.github/workflows/deploy-production.yml`
- `infra/main.parameters.example.json`
- `README.md`

The workflow logic remains aligned with the proven boilerplate implementation.
Only project-specific defaults and documentation change unless validation
reveals a CertDrills-specific defect.

The README becomes the source of truth for:

- Deployment topology.
- Initial infrastructure deployment.
- Subsequent application deployments.
- Required GitHub production variables.
- Required GitHub production secrets.
- Manual database prerequisite.
- Generated application URL behavior.

## GitHub Production Environment

Create the `production` environment for `wiwa1978/CertDrills` and configure
non-secret variables using the selected Azure account and PostgreSQL server.
At minimum, configure:

- `AZURE_SUBSCRIPTION_ID`
- `AZURE_TENANT_ID`
- `AZURE_LOCATION`
- `AZURE_RESOURCE_GROUP_NAME`
- `AZURE_ENVIRONMENT_NAME`
- `APP_NAME`
- `NEXT_PUBLIC_APP_NAME`
- `NEXT_PUBLIC_ADMIN_APP_NAME`
- `POSTGRES_SERVER_FQDN`
- `POSTGRES_ADMIN_LOGIN`
- `POSTGRES_DATABASE_NAME`
- `POSTGRES_FIREWALL_RESOURCE_GROUP_NAME`

Public URL variables remain unset for bootstrap so the infrastructure workflow
uses generated Container Apps FQDNs.

Production secrets must not be copied from local development files. Leave them
unset and document the exact names and purpose of every required secret,
including Azure credentials, PostgreSQL credentials, application signing
secrets, admin access, email, OAuth, and billing provider credentials.

## Workflow Behavior

### Infrastructure Workflow

The manual infrastructure workflow:

1. Validates required variables and secrets.
2. Authenticates to Azure and selects the configured subscription.
3. Reconciles the Bicep infrastructure in `RG-CertDrills`.
4. Builds and pushes API, web, and admin images.
5. Temporarily permits the runner IP through the PostgreSQL firewall.
6. Runs database migrations against the manually created `certdrills`
   database.
7. Removes the temporary firewall rule.
8. Configures Container App secrets and environment variables.
9. Enables and verifies the API liveness probe.
10. Reports the generated API, web, and admin URLs.

### Application Workflow

The production application workflow keeps its existing behavior:

1. Runs after successful CI on `main`, or through its guarded manual dispatch.
2. Determines which deployable areas changed.
3. Builds and pushes only affected application images.
4. Runs migrations when API or shared database code changed.
5. Updates the affected Container Apps.
6. Waits for healthy revisions and verifies API health.

## Error Handling

- Missing GitHub variables or secrets fail during workflow preflight.
- A missing or inaccessible `certdrills` database fails during migration
  before application rollout.
- Resource-name collisions outside the selected app/environment scope remain
  blocked by the inherited collision checks.
- Temporary PostgreSQL firewall access is removed by cleanup steps even when
  migrations fail.
- Container revision health checks prevent a failed revision from being
  reported as successfully deployed.

## Validation

Before completion:

- Parse both workflow YAML files.
- Compile `infra/main.bicep` with Azure Bicep.
- Validate Dockerfiles with the repository's existing Docker checks.
- Run relevant repository tests and type checks.
- Run `git diff --check`.
- Verify the GitHub `production` environment and non-secret variables.
- Search active deployment files and README documentation for stale
  boilerplate defaults.

No Azure resources are deployed and no GitHub production secrets are created
as part of preparation.
