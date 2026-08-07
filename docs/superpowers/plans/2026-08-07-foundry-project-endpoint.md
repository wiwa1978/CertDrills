# Foundry Project Endpoint Derivation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manually configured Responses API URL with a URL derived from `AZURE_AI_FOUNDRY_PROJECT_ENDPOINT`.

**Architecture:** A focused helper beside the Foundry provider validates and normalizes the project endpoint, then appends the OpenAI-compatible Responses path. Bootstrap consumes only the project endpoint, API key, and model; the old Responses URL setting is removed.

**Tech Stack:** TypeScript 5.9, Zod, Vitest

---

## File Structure

- Modify `apps/api/src/modules/certdrill/blueprint-parser.ts` — exported project-endpoint URL builder.
- Modify `apps/api/tests/modules/certdrill/blueprint-parser.test.ts` — URL derivation tests.
- Modify `apps/api/src/env.ts` — project endpoint environment setting.
- Modify `apps/api/tests/env.test.ts` — environment contract tests.
- Modify `apps/api/src/bootstrap.ts` — derive and pass the Responses URL.
- Modify `apps/api/.env.example` — document the project endpoint.
- Modify `apps/api/tests/app.functional.test.ts` — bootstrap source/configuration contract.

### Task 1: Foundry Responses URL builder

**Files:**
- Modify: `apps/api/src/modules/certdrill/blueprint-parser.ts`
- Modify: `apps/api/tests/modules/certdrill/blueprint-parser.test.ts`

- [ ] **Step 1: Write failing URL-builder tests**

Add:

```ts
expect(buildFoundryResponsesUrl(
  "https://example.services.ai.azure.com/api/projects/certdrills",
)).toBe(
  "https://example.services.ai.azure.com/api/projects/certdrills/openai/v1/responses",
);

expect(buildFoundryResponsesUrl(
  "https://example.services.ai.azure.com/api/projects/certdrills///",
)).toBe(
  "https://example.services.ai.azure.com/api/projects/certdrills/openai/v1/responses",
);
```

Also assert that endpoints containing `?api-version=...` or `#fragment` throw `BlueprintParserError` with code `BLUEPRINT_PARSER_NOT_CONFIGURED`.

- [ ] **Step 2: Verify RED**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parser.test.ts
```

Expected: FAIL because `buildFoundryResponsesUrl` is not exported.

- [ ] **Step 3: Implement the builder**

```ts
export function buildFoundryResponsesUrl(projectEndpoint: string) {
  let url: URL;
  try {
    url = new URL(projectEndpoint);
  } catch (error) {
    throw new BlueprintParserError(
      "BLUEPRINT_PARSER_NOT_CONFIGURED",
      "Blueprint parser is not configured. projectEndpoint must be a valid URL.",
      { cause: error },
    );
  }

  if (url.search || url.hash) {
    throw new BlueprintParserError(
      "BLUEPRINT_PARSER_NOT_CONFIGURED",
      "Blueprint parser is not configured. projectEndpoint must not contain a query string or fragment.",
    );
  }

  const projectPath = url.pathname.replace(/\/+$/, "");
  url.pathname = `${projectPath}/openai/v1/responses`;
  return url.toString();
}
```

Keep `createFoundryBlueprintParser` accepting a complete `responsesUrl`; this preserves the provider boundary and makes it reusable.

- [ ] **Step 4: Verify and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parser.test.ts
bun run typecheck:api
git add apps/api/src/modules/certdrill/blueprint-parser.ts apps/api/tests/modules/certdrill/blueprint-parser.test.ts
git commit -m "feat: derive Foundry responses URL"
```

### Task 2: Environment and bootstrap migration

**Files:**
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/tests/env.test.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/.env.example`
- Modify: `apps/api/tests/app.functional.test.ts`

- [ ] **Step 1: Write failing environment tests**

Extend `loadEnv` so individual Foundry values can be stubbed. Assert:

```ts
expect(env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT).toBe(
  "https://example.services.ai.azure.com/api/projects/certdrills",
);
expect("AZURE_AI_FOUNDRY_RESPONSES_URL" in env).toBe(false);
```

Also assert an invalid project endpoint rejects environment loading.

- [ ] **Step 2: Replace the environment setting**

Change:

```ts
AZURE_AI_FOUNDRY_RESPONSES_URL: emptyToUndefined(z.string().url()),
```

to:

```ts
AZURE_AI_FOUNDRY_PROJECT_ENDPOINT: emptyToUndefined(z.string().url()),
```

- [ ] **Step 3: Update bootstrap**

Import `buildFoundryResponsesUrl`. Configure the provider only when project endpoint, API key, and model are present:

```ts
if (
  env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT
  && env.AZURE_AI_FOUNDRY_API_KEY
  && env.AZURE_AI_FOUNDRY_MODEL
) {
  return createFoundryBlueprintParser({
    responsesUrl: buildFoundryResponsesUrl(
      env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT,
    ),
    apiKey: env.AZURE_AI_FOUNDRY_API_KEY,
    model: env.AZURE_AI_FOUNDRY_MODEL,
    timeoutMs: env.AZURE_AI_FOUNDRY_TIMEOUT_MS,
  });
}
```

Keep the existing not-configured fallback unchanged.

- [ ] **Step 4: Update configuration documentation**

Replace the old example with:

```env
# AZURE_AI_FOUNDRY_PROJECT_ENDPOINT="https://<resource>.services.ai.azure.com/api/projects/<project>"
# AZURE_AI_FOUNDRY_API_KEY="replace-with-foundry-api-key"
# AZURE_AI_FOUNDRY_MODEL="deployment-name"
AZURE_AI_FOUNDRY_TIMEOUT_MS=60000
```

- [ ] **Step 5: Add a bootstrap contract assertion**

In `apps/api/tests/app.functional.test.ts`, read `bootstrap.ts` as source and assert it contains `buildFoundryResponsesUrl(env.AZURE_AI_FOUNDRY_PROJECT_ENDPOINT)` and does not contain `AZURE_AI_FOUNDRY_RESPONSES_URL`. Preserve the existing runtime test for the not-configured parser.

- [ ] **Step 6: Verify**

```bash
bun run --cwd apps/api test -- tests/env.test.ts tests/modules/certdrill/blueprint-parser.test.ts tests/app.functional.test.ts
bun run typecheck:api
bun run test:api
```

Expected: all tests and typechecking pass.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/env.ts apps/api/tests/env.test.ts apps/api/src/bootstrap.ts apps/api/.env.example apps/api/tests/app.functional.test.ts
git commit -m "fix: configure Foundry from project endpoint"
```
