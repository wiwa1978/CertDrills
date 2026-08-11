import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function readWorkflow(name: string) {
  return readFileSync(join(process.cwd(), "../../.github/workflows", name), "utf8");
}

function readInfrastructure(name: string) {
  return readFileSync(join(process.cwd(), "../../infra", name), "utf8");
}

function getDeployJobEnvironment(workflow: string) {
  const deployJobStart = workflow.indexOf("\n  deploy:\n");
  const stepsStart = workflow.indexOf("\n    steps:\n", deployJobStart);
  const environmentStart = workflow.lastIndexOf("\n    env:\n", stepsStart);

  expect(deployJobStart).toBeGreaterThan(-1);
  expect(environmentStart).toBeGreaterThan(-1);
  expect(environmentStart).toBeGreaterThan(deployJobStart);
  expect(stepsStart).toBeGreaterThan(environmentStart);
  return workflow.slice(environmentStart, stepsStart);
}

function getStep(workflow: string, name: string) {
  const marker = `      - name: ${name}\n`;
  const stepStart = workflow.indexOf(marker);
  const nextStepStart = workflow.indexOf("\n      - name:", stepStart + marker.length);

  expect(stepStart).toBeGreaterThan(-1);
  return workflow.slice(stepStart, nextStepStart === -1 ? undefined : nextStepStart);
}

const productionWorkflows = ["deploy-production.yml", "deploy-production-infra.yml"] as const;
const dodoBrandVariables = [
  "DODO_CREDITS_BRAND_ID",
  "DODO_SUBSCRIPTIONS_BRAND_ID",
  "DODO_TRANSACTIONS_BRAND_ID",
] as const;

const resolveDodoBrandsScript = join(process.cwd(), "../../.github/scripts/resolve-dodo-brands.sh");
const validateDodoEnvironmentScript = join(process.cwd(), "../../.github/scripts/validate-dodo-environment.sh");
const resolveCookieDomainScript = join(process.cwd(), "../../.github/scripts/resolve-cookie-domain.sh");

function runCookieDomainResolver(options: {
  generatedApiUrl?: string;
  cookieDomain?: string;
  publicWebUrl?: string;
  publicApiUrl?: string;
  publicAdminUrl?: string;
} = {}) {
  const directory = mkdtempSync(join(tmpdir(), "cookie-domain-resolver-"));
  const githubEnvironment = join(directory, "github-env");
  writeFileSync(githubEnvironment, "");

  const result = spawnSync("bash", [resolveCookieDomainScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      GITHUB_ENV: githubEnvironment,
      GENERATED_API_URL: options.generatedApiUrl ?? "https://certdrills-api.example.germanywestcentral.azurecontainerapps.io",
      COOKIE_DOMAIN: options.cookieDomain ?? "",
      PUBLIC_WEB_URL: options.publicWebUrl ?? "",
      PUBLIC_API_URL: options.publicApiUrl ?? "",
      PUBLIC_ADMIN_URL: options.publicAdminUrl ?? "",
    },
  });

  const output = {
    environment: readFileSync(githubEnvironment, "utf8"),
    result,
  };
  rmSync(directory, { force: true, recursive: true });
  return output;
}


function runDodoEnvironmentValidation(environment?: string, liveApproval?: string) {
  return spawnSync("bash", [validateDodoEnvironmentScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      DODO_PAYMENTS_ENVIRONMENT: environment ?? "",
      DODO_LIVE_MODE_APPROVED: liveApproval ?? "",
    },
  });
}

function runDodoBrandResolver(options: {
  activeBrand?: string;
  azureEnvironment?: unknown;
  azureExists?: boolean;
  brands?: Partial<Record<(typeof dodoBrandVariables)[number], string>>;
}) {
  const directory = mkdtempSync(join(tmpdir(), "dodo-brand-resolver-"));
  const binDirectory = join(directory, "bin");
  const githubEnvironment = join(directory, "github-env");
  const azLog = join(directory, "az.log");
  mkdirSync(binDirectory);
  writeFileSync(githubEnvironment, "");
  writeFileSync(azLog, "");
  writeFileSync(
    join(binDirectory, "az"),
    `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "\${MOCK_AZ_LOG}"
if [[ "$*" == *"--output none"* ]]; then
  [[ "\${MOCK_AZ_EXISTS}" == "true" ]]
else
  printf 'query-response=%s\\n' "\${MOCK_AZ_ENVIRONMENT}" >> "\${MOCK_AZ_LOG}"
  printf '%s' "\${MOCK_AZ_ENVIRONMENT}"
fi
`,
  );
  chmodSync(join(binDirectory, "az"), 0o755);

  const result = spawnSync("bash", [resolveDodoBrandsScript], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}:${process.env.PATH}`,
      APP_NAME: "test-app",
      AZURE_RESOURCE_GROUP_NAME: "test-resource-group",
      ACTIVE_DODO_BRAND_ENV: options.activeBrand ?? "DODO_CREDITS_BRAND_ID",
      GITHUB_ENV: githubEnvironment,
      MOCK_AZ_EXISTS: String(options.azureExists ?? true),
      MOCK_AZ_ENVIRONMENT: JSON.stringify(options.azureEnvironment === undefined ? [] : options.azureEnvironment),
      MOCK_AZ_LOG: azLog,
      DODO_CREDITS_BRAND_ID: options.brands?.DODO_CREDITS_BRAND_ID ?? "",
      DODO_SUBSCRIPTIONS_BRAND_ID: options.brands?.DODO_SUBSCRIPTIONS_BRAND_ID ?? "",
      DODO_TRANSACTIONS_BRAND_ID: options.brands?.DODO_TRANSACTIONS_BRAND_ID ?? "",
    },
  });

  const output = {
    azCalls: readFileSync(azLog, "utf8").trim().split("\n").filter(Boolean),
    environment: readFileSync(githubEnvironment, "utf8"),
    result,
  };
  rmSync(directory, { force: true, recursive: true });
  return output;
}

describe("production deployment custom domains", () => {
  it("derives a shared cookie domain for generated Container Apps URLs", () => {
    const { environment, result } = runCookieDomainResolver();

    expect(result.status).toBe(0);
    expect(environment).toBe("EFFECTIVE_COOKIE_DOMAIN=example.germanywestcentral.azurecontainerapps.io\n");
  });

  it("uses the configured cookie domain for custom public URLs", () => {
    const { environment, result } = runCookieDomainResolver({
      cookieDomain: ".certdrills.example.com",
      publicWebUrl: "https://app.certdrills.example.com",
      publicApiUrl: "https://api.certdrills.example.com",
      publicAdminUrl: "https://admin.certdrills.example.com",
    });

    expect(result.status).toBe(0);
    expect(environment).toBe("EFFECTIVE_COOKIE_DOMAIN=.certdrills.example.com\n");
  });

  it("rejects custom public URLs without a shared cookie domain", () => {
    const { result } = runCookieDomainResolver({
      publicWebUrl: "https://app.certdrills.example.com",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("COOKIE_DOMAIN is required");
  });

  it.each(["deploy-production.yml", "deploy-production-infra.yml"])(
    "%s supports custom public URLs for builds",
    (workflowName) => {
      const workflow = readWorkflow(workflowName);

      expect(workflow).toContain("PUBLIC_WEB_URL:");
      expect(workflow).toContain("PUBLIC_API_URL:");
      expect(workflow).toContain("PUBLIC_ADMIN_URL:");
      expect(workflow).toContain("public_web_url=");
      expect(workflow).toContain("public_api_url=");
      expect(workflow).toContain("public_admin_url=");
      expect(workflow).toContain("NEXT_PUBLIC_APP_URL=\"${{ steps.");
      expect(workflow).toContain("NEXT_PUBLIC_API_URL=\"${{ steps.");
    },
  );

  it("passes custom public URLs and cookie settings to the API runtime", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");

    expect(workflow).toContain("APP_URL=${{ steps.infra.outputs.public_web_url }}");
    expect(workflow).toContain("API_URL=${{ steps.infra.outputs.public_api_url }}");
    expect(workflow).toContain("ADMIN_APP_URL=${{ steps.infra.outputs.public_admin_url }}");
    expect(workflow).toContain("COOKIE_DOMAIN:");
    expect(workflow).toContain("BETTER_AUTH_ALLOWED_ORIGINS:");
    expect(workflow).toContain("COOKIE_DOMAIN=${EFFECTIVE_COOKIE_DOMAIN}");
    expect(workflow).toContain("BETTER_AUTH_ALLOWED_ORIGINS=${BETTER_AUTH_ALLOWED_ORIGINS}");
  });

  it("rebinds and checks custom public hostnames after infrastructure reconciliation", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");

    expect(workflow).toContain("az containerapp hostname bind");
    expect(workflow).toContain("--validation-method CNAME");
    expect(workflow).toContain('"${{ steps.infra.outputs.public_api_url }}/ready"');
    expect(workflow).toContain('"${{ steps.infra.outputs.public_web_url }}/ready"');
    expect(workflow).toContain('"${{ steps.infra.outputs.public_admin_url }}/ready"');
  });
});

describe("production infrastructure", () => {
  it("normalizes an optional PostgreSQL port before constructing DATABASE_URL", () => {
    const template = readInfrastructure("main.resources.bicep");

    expect(template).toContain("var postgresServerHost = split(postgresServerFqdn, ':')[0]");
    expect(template).toContain("@${postgresServerHost}:5432/");
    expect(template).not.toContain("@${postgresServerFqdn}:5432/");
  });
});

describe("CI environment", () => {
  it("configures the Dodo credentials and all mode-specific brands", () => {
    const workflow = readWorkflow("test.yml");

    expect(workflow).toContain("DODO_PAYMENTS_API_KEY: test-dodo-api-key");
    expect(workflow).toContain("DODO_PAYMENTS_WEBHOOK_SECRET: test-dodo-webhook-secret");
    expect(workflow).toContain("DODO_CREDITS_BRAND_ID: brnd_test_credits");
    expect(workflow).toContain("DODO_SUBSCRIPTIONS_BRAND_ID: brnd_test_subscriptions");
    expect(workflow).toContain("DODO_TRANSACTIONS_BRAND_ID: brnd_test_transactions");
    expect(workflow).not.toContain("DODO_TRANSACTION_BRAND_ID");
  });

  it("configures the local Blob emulator for API system tests", () => {
    const workflow = readWorkflow("test.yml");

    expect(workflow).toContain("AZURE_PRIVACY_EXPORT_STORAGE_CONNECTION_STRING: UseDevelopmentStorage=true");
    expect(workflow).toContain("AZURE_PRIVACY_EXPORT_STORAGE_CONTAINER: privacy-exports");
  });
});

describe("production Dodo brand configuration", () => {
  it.each(productionWorkflows)("%s requires the explicit Dodo environment variable", (workflowName) => {
    const workflow = readWorkflow(workflowName);
    const jobEnvironment = getDeployJobEnvironment(workflow);
    const validationStep = getStep(workflow, "Validate Dodo environment");

    expect(jobEnvironment).toContain("DODO_PAYMENTS_ENVIRONMENT: ${{ vars.DODO_PAYMENTS_ENVIRONMENT }}");
    expect(jobEnvironment).not.toContain("vars.DODO_PAYMENTS_ENVIRONMENT ||");
    expect(validationStep).toContain(".github/scripts/validate-dodo-environment.sh");
  });

  it.each(productionWorkflows)(
    "%s uses only mode-specific Dodo brand variables",
    (workflowName) => {
      const workflow = readWorkflow(workflowName);
      const jobEnvironment = getDeployJobEnvironment(workflow);

      expect(jobEnvironment).toContain("PAYMENT_PROVIDER: dodo");
      for (const name of dodoBrandVariables) {
        expect(jobEnvironment).toContain(`${name}: \${{ vars.${name} }}`);
      }
      expect(workflow).not.toContain("DODO_TRANSACTION_BRAND_ID");
    },
  );

  it("routine deploy validates only the compile-time active Dodo brand after install", () => {
    const workflow = readWorkflow("deploy-production.yml");
    const installStep = getStep(workflow, "Install dependencies");
    const validationStep = getStep(workflow, "Validate active Dodo brand");

    expect(workflow.indexOf(validationStep)).toBeGreaterThan(workflow.indexOf(installStep));
    expect(validationStep).toContain('import { applicationConfig } from "./apps/api/src/config/application.ts"');
    expect(validationStep).toContain(
      'import { DODO_BRAND_ENV_BY_BILLING_MODE } from "./apps/api/src/config/dodo-brands.ts"',
    );
    expect(validationStep).toContain("DODO_BRAND_ENV_BY_BILLING_MODE[applicationConfig.billing.mode]");
    expect(validationStep).toContain('if [[ "${PAYMENT_PROVIDER}" == "dodo" ]]');
    expect(validationStep).toContain(`brand_names=(${dodoBrandVariables.join(" ")})`);
    expect(validationStep).toContain('if [[ -n "${value}" && ! "${value}" =~ ^(brnd|bus)_[A-Za-z0-9]+$ ]]');
    expect(validationStep).toContain("Malformed Dodo brand setting: %s");
    expect(validationStep).toContain('[[ -z "${!active_brand_env}" ]]');
    expect(validationStep).toContain("Missing required production Dodo brand setting: %s");
  });

  it("infra resolves GitHub or existing Azure brand values before final Bicep deployment", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");
    const installStep = getStep(workflow, "Install dependencies");
    const resolveStep = getStep(workflow, "Resolve effective Dodo brands");
    const deployStep = getStep(workflow, "Deploy final Azure infrastructure");

    expect(workflow.indexOf(resolveStep)).toBeGreaterThan(workflow.indexOf(installStep));
    expect(workflow.indexOf(deployStep)).toBeGreaterThan(workflow.indexOf(resolveStep));
    expect(resolveStep).toContain('ACTIVE_DODO_BRAND_ENV="${active_brand_env}"');
    expect(resolveStep).toContain(".github/scripts/resolve-dodo-brands.sh");
  });

  it("infra validates the effective compile-time active Dodo brand before final Bicep deployment", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");
    const resolveStep = getStep(workflow, "Resolve effective Dodo brands");

    expect(resolveStep).toContain('import { applicationConfig } from "./apps/api/src/config/application.ts"');
    expect(resolveStep).toContain(
      'import { DODO_BRAND_ENV_BY_BILLING_MODE } from "./apps/api/src/config/dodo-brands.ts"',
    );
    expect(resolveStep).toContain("DODO_BRAND_ENV_BY_BILLING_MODE[applicationConfig.billing.mode]");
    expect(resolveStep).toContain('if [[ "${PAYMENT_PROVIDER}" == "dodo" ]]');
    expect(resolveStep).toContain("ACTIVE_DODO_BRAND_ENV");
  });

  it("routine deploy conditionally includes only non-empty brand variables in the image update", () => {
    const workflow = readWorkflow("deploy-production.yml");
    const deployStep = getStep(workflow, "Deploy API image");

    expect(deployStep).toContain('brand_env_args=(--set-env-vars "DODO_PAYMENTS_ENVIRONMENT=${DODO_PAYMENTS_ENVIRONMENT}"');
    expect(deployStep).toContain('"DODO_LIVE_MODE_APPROVED=${DODO_LIVE_MODE_APPROVED}"');
    expect(deployStep).toContain('"ADMIN_PORTAL_TOTP_REQUIRED=${ADMIN_PORTAL_TOTP_REQUIRED}"');
    expect(deployStep).toContain(`brand_names=(${dodoBrandVariables.join(" ")})`);
    expect(deployStep).toContain('if [[ -n "${!name}" ]]');
    expect(deployStep).toContain('brand_env_args+=("${name}=${!name}")');
    expect(deployStep).toContain('"${brand_env_args[@]}"');
  });

  it("infra restores all non-empty effective brand values after final Bicep deployment", () => {
    const workflow = readWorkflow("deploy-production-infra.yml");
    const deployStep = getStep(workflow, "Deploy final Azure infrastructure");
    const configureStep = getStep(workflow, "Configure API environment variables");

    expect(workflow.indexOf(configureStep)).toBeGreaterThan(workflow.indexOf(deployStep));
    expect(configureStep).toContain(`brand_names=(${dodoBrandVariables.join(" ")})`);
    expect(configureStep).toContain('effective_name="EFFECTIVE_${name}"');
    expect(configureStep).toContain('if [[ -n "${!effective_name}" ]]');
    expect(configureStep).toContain('env_args+=("${name}=${!effective_name}")');
    expect(configureStep).not.toContain('env_args+=("${name}=${!name}")');
    expect(configureStep).toContain('"DODO_PAYMENTS_ENVIRONMENT=${DODO_PAYMENTS_ENVIRONMENT}"');
    expect(configureStep).toContain('"ADMIN_PORTAL_TOTP_REQUIRED=${ADMIN_PORTAL_TOTP_REQUIRED}"');
  });

  it("keeps Dodo brand checks out of database and secret validation", () => {
    const routineValidation = getStep(
      readWorkflow("deploy-production.yml"),
      "Validate external PostgreSQL configuration",
    );
    const infraValidation = getStep(
      readWorkflow("deploy-production-infra.yml"),
      "Validate production configuration",
    );

    for (const name of dodoBrandVariables) {
      expect(routineValidation).not.toContain(name);
      expect(infraValidation).not.toContain(name);
    }
  });
});

describe("production Dodo environment validation", () => {
  it("accepts test mode while the committed catalog is test-only", () => {
    expect(runDodoEnvironmentValidation("test_mode").status).toBe(0);
  });

  it("rejects a missing explicit GitHub variable", () => {
    const result = runDodoEnvironmentValidation();

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Missing required GitHub variable: DODO_PAYMENTS_ENVIRONMENT");
  });

  it("rejects values outside the Dodo environment enum", () => {
    const result = runDodoEnvironmentValidation("production");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("must be exactly test_mode or live_mode");
  });

  it("rejects live mode until it is explicitly approved", () => {
    const result = runDodoEnvironmentValidation("live_mode");

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Live Dodo payments require DODO_LIVE_MODE_APPROVED=approved-live-payments");
    expect(runDodoEnvironmentValidation("live_mode", "approved-live-payments").status).toBe(0);
  });
});

describe("effective Dodo brand resolver", () => {
  it("prefers a nonempty GitHub variable over Azure", () => {
    const { environment, result } = runDodoBrandResolver({
      azureEnvironment: [{ name: "DODO_CREDITS_BRAND_ID", value: "brnd_Azure123" }],
      brands: { DODO_CREDITS_BRAND_ID: "brnd_GitHub123" },
    });

    expect(result.status).toBe(0);
    expect(environment).toContain("EFFECTIVE_DODO_CREDITS_BRAND_ID=brnd_GitHub123");
  });

  it("falls back to an existing Azure value and accepts a bus credits ID", () => {
    const { environment, result } = runDodoBrandResolver({
      azureEnvironment: [{ name: "DODO_CREDITS_BRAND_ID", value: "bus_Credits123" }],
    });

    expect(result.status).toBe(0);
    expect(environment).toContain("EFFECTIVE_DODO_CREDITS_BRAND_ID=bus_Credits123");
  });

  it("uses the last duplicate Azure environment entry", () => {
    const { environment, result } = runDodoBrandResolver({
      azureEnvironment: [
        { name: "DODO_SUBSCRIPTIONS_BRAND_ID", value: "brnd_Old123" },
        { name: "DODO_SUBSCRIPTIONS_BRAND_ID", value: "brnd_New456" },
      ],
      activeBrand: "DODO_SUBSCRIPTIONS_BRAND_ID",
    });

    expect(result.status).toBe(0);
    expect(environment).toContain("EFFECTIVE_DODO_SUBSCRIPTIONS_BRAND_ID=brnd_New456");
    expect(environment).not.toContain("brnd_Old123");
  });

  it("handles an absent app during first deployment", () => {
    const { azCalls, environment, result } = runDodoBrandResolver({
      activeBrand: "DODO_TRANSACTIONS_BRAND_ID",
      azureExists: false,
      brands: { DODO_TRANSACTIONS_BRAND_ID: "brnd_FirstDeploy123" },
    });

    expect(result.status).toBe(0);
    expect(azCalls).toHaveLength(1);
    expect(environment).toContain("EFFECTIVE_DODO_TRANSACTIONS_BRAND_ID=brnd_FirstDeploy123");
  });

  it("handles a null Azure environment response", () => {
    const { azCalls, environment, result } = runDodoBrandResolver({
      azureEnvironment: null,
      brands: { DODO_CREDITS_BRAND_ID: "bus_FromGitHub123" },
    });

    expect(result.status).toBe(0);
    expect(azCalls).toContain("query-response=null");
    expect(environment).toContain("EFFECTIVE_DODO_CREDITS_BRAND_ID=bus_FromGitHub123");
  });

  it.each([
    ["line feed", "brnd_Safe123\nINJECTED=value"],
    ["carriage return", "brnd_Safe123\rINJECTED=value"],
    ["whitespace", "brnd_Invalid value"],
  ])("rejects %s before emitting workflow commands", (_label, malformedValue) => {
    const { environment, result } = runDodoBrandResolver({
      brands: { DODO_CREDITS_BRAND_ID: malformedValue },
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("DODO_CREDITS_BRAND_ID");
    expect(environment).toBe("");
    expect(result.stdout).not.toContain("::add-mask::");
  });
});

describe("Inngest deployment synchronization", () => {
  it("does not require an API key during infrastructure bootstrap", () => {
    const validationStep = getStep(readWorkflow("deploy-production-infra.yml"), "Validate production configuration");
    expect(validationStep).not.toContain("INNGEST_API_KEY");
    expect(validationStep).toContain("INNGEST_EVENT_KEY");
    expect(validationStep).toContain("INNGEST_SIGNING_KEY");
  });

  it("warns and preserves deployment when programmatic sync is not configured", () => {
    const syncStep = getStep(readWorkflow("deploy-production.yml"), "Synchronize Inngest functions");
    expect(syncStep).toContain('if [[ -z "${INNGEST_API_KEY}" ]]');
    expect(syncStep).toContain("manually resync");
    expect(syncStep).toContain("exit 0");
    expect(syncStep).toContain("https://api.inngest.com/v2/apps/${INNGEST_APP_ID}/syncs");
  });
});
