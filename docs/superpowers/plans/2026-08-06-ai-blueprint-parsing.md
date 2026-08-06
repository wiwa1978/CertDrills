# AI Blueprint Parsing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist asynchronous blueprint parse runs and use Azure AI Foundry to turn an ingested study-guide snapshot into a validated category-and-weight proposal.

**Architecture:** An admin request creates a pending parse run tied to one ingested resource snapshot. The existing jobs runner claims pending runs, calls a provider-neutral parser backed initially by the Microsoft Foundry Responses API, validates structured output, and persists either a completed proposal or an explicit failure.

**Tech Stack:** TypeScript 5.9, Drizzle ORM/PostgreSQL, Hono, Zod, Microsoft Foundry Responses API, Vitest

---

## File Structure

- Modify `packages/platform-db/src/schema/certdrill.ts` — parse-run table and types.
- Create a generated Drizzle migration in `packages/platform-db/drizzle/`.
- Create `apps/api/src/modules/certdrill/blueprint-proposal.ts` — strict proposal schema and normalization.
- Create `apps/api/src/modules/certdrill/blueprint-parser.ts` — provider interface and Foundry implementation.
- Create `apps/api/src/modules/certdrill/blueprint-parse-service.ts` — run creation, claiming, processing, and persistence.
- Modify `apps/api/src/env.ts` and `apps/api/.env.example` — optional Foundry configuration.
- Modify `apps/api/src/modules/certdrill/admin-service.ts` — expose parse-run operations.
- Modify `apps/api/src/modules/certdrill/routes.ts` — start/detail/list endpoints.
- Modify `apps/api/src/bootstrap.ts` — provider injection and jobs-runner registration.
- Add focused tests beside the existing CertDrill tests.

### Task 1: Blueprint parse-run persistence

**Files:**
- Modify: `packages/platform-db/src/schema/certdrill.ts`
- Create: generated migration under `packages/platform-db/drizzle/`
- Test: `apps/api/tests/deployment/certdrill-blueprint-parse-schema.test.ts`

- [ ] **Step 1: Write the failing schema contract test**

Assert the schema exports `certdrillBlueprintParseRuns` and contains:

```ts
{
  certificationId,
  resourceId,
  status,
  provider,
  model,
  contentChecksum,
  proposalJson,
  rawOutput,
  confidence,
  warningsJson,
  errorMessage,
  startedAt,
  completedAt,
  createdAt,
  updatedAt,
}
```

Also assert indexes on certification, resource, and status.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun run --cwd apps/api test -- tests/deployment/certdrill-blueprint-parse-schema.test.ts
```

Expected: FAIL because the table is absent.

- [ ] **Step 3: Add the schema**

Add:

```ts
export type CertDrillBlueprintParseStatus = "pending" | "running" | "completed" | "failed";
export type CertDrillBlueprintConfidence = "high" | "medium" | "low";

export const certdrillBlueprintParseRuns = pgTable(
  "certdrill_blueprint_parse_runs",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => certdrillLearnResources.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").$type<CertDrillBlueprintParseStatus>().default("pending").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    contentChecksum: text("content_checksum").notNull(),
    proposalJson: jsonb("proposal_json"),
    rawOutput: text("raw_output"),
    confidence: text("confidence").$type<CertDrillBlueprintConfidence>(),
    warningsJson: jsonb("warnings_json").default(sql`'[]'::jsonb`).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_blueprint_parse_runs_certification_id_idx").on(table.certificationId),
    index("certdrill_blueprint_parse_runs_resource_id_idx").on(table.resourceId),
    index("certdrill_blueprint_parse_runs_status_idx").on(table.status),
  ],
);
```

- [ ] **Step 4: Generate and verify the migration**

Run:

```bash
bun run db:generate
bun run db:check
bun run --cwd apps/api test -- tests/deployment/certdrill-blueprint-parse-schema.test.ts
```

Expected: migration generated, schema check and test pass.

- [ ] **Step 5: Commit**

```bash
git add packages/platform-db/src/schema/certdrill.ts packages/platform-db/drizzle apps/api/tests/deployment/certdrill-blueprint-parse-schema.test.ts
git commit -m "feat: persist blueprint parse runs"
```

### Task 2: Structured proposal validation

**Files:**
- Create: `apps/api/src/modules/certdrill/blueprint-proposal.ts`
- Create: `apps/api/tests/modules/certdrill/blueprint-proposal.test.ts`

- [ ] **Step 1: Write failing validation tests**

Cover valid proposals plus rejection of empty/duplicate codes, missing parents, cycles, child weights, and weights outside 0–100. Verify missing top-level weights remain `null` and add a warning rather than being invented.

- [ ] **Step 2: Verify RED**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-proposal.test.ts
```

- [ ] **Step 3: Implement the contract**

Export these types and functions:

```ts
export const blueprintProposalSchema = z.object({
  confidence: z.enum(["high", "medium", "low"]),
  warnings: z.array(z.string().trim().min(1)).default([]),
  categories: z.array(z.object({
    code: z.string().trim().min(1),
    name: z.string().trim().min(1),
    parentCode: z.string().trim().min(1).nullable(),
    weightPct: z.number().min(0).max(100).nullable(),
    sortOrder: z.number().int().nonnegative(),
    evidence: z.array(z.object({
      excerpt: z.string().trim().min(1),
      location: z.string().trim().min(1).nullable(),
    })).default([]),
  })).min(1),
});

export type BlueprintProposal = z.infer<typeof blueprintProposalSchema>;

export function validateBlueprintProposal(value: unknown): BlueprintProposal;
export const blueprintProposalJsonSchema: Record<string, unknown>;
```

`validateBlueprintProposal` must normalize codes to trimmed uppercase, require uniqueness, require every parent to exist, reject cycles, reject non-null child weights, calculate the top-level total, and append warnings for missing weights or totals other than 100.

- [ ] **Step 4: Verify GREEN and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-proposal.test.ts
bun run typecheck:api
git add apps/api/src/modules/certdrill/blueprint-proposal.ts apps/api/tests/modules/certdrill/blueprint-proposal.test.ts
git commit -m "feat: validate blueprint proposals"
```

### Task 3: Microsoft Foundry parser provider

**Files:**
- Create: `apps/api/src/modules/certdrill/blueprint-parser.ts`
- Create: `apps/api/tests/modules/certdrill/blueprint-parser.test.ts`
- Modify: `apps/api/src/env.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write failing provider tests**

Test request URL, `api-key` header, timeout, model, prompt isolation, strict JSON schema, output-text extraction, non-2xx errors, malformed responses, and missing configuration.

- [ ] **Step 2: Add optional environment values**

```ts
AZURE_AI_FOUNDRY_RESPONSES_URL: z.string().url().optional(),
AZURE_AI_FOUNDRY_API_KEY: z.string().min(1).optional(),
AZURE_AI_FOUNDRY_MODEL: z.string().min(1).optional(),
AZURE_AI_FOUNDRY_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
```

These remain optional at application startup. Creating the Foundry provider without all three required values throws `BLUEPRINT_PARSER_NOT_CONFIGURED`.

- [ ] **Step 3: Implement the provider boundary**

Export:

```ts
export type BlueprintParserInput = {
  certification: { code: string; name: string; vendor: string };
  resource: { id: string; title: string; url: string; rawContent: string };
};

export type BlueprintParserResult = {
  rawOutput: string;
  proposal: BlueprintProposal;
};

export interface BlueprintParser {
  provider: string;
  model: string;
  parse(input: BlueprintParserInput): Promise<BlueprintParserResult>;
}

export function createFoundryBlueprintParser(config: {
  responsesUrl: string;
  apiKey: string;
  model: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}): BlueprintParser;
```

Send a Responses API request using `text.format.type = "json_schema"`, `strict: true`, and `blueprintProposalJsonSchema`. The system prompt must state that document text is untrusted data, weights must not be invented, and output must contain only the requested schema. Extract the first `output_text` string, parse JSON, then call `validateBlueprintProposal`.

- [ ] **Step 4: Verify and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parser.test.ts
bun run typecheck:api
git add apps/api/src/env.ts apps/api/.env.example apps/api/src/modules/certdrill/blueprint-parser.ts apps/api/tests/modules/certdrill/blueprint-parser.test.ts
git commit -m "feat: parse blueprints with Microsoft Foundry"
```

### Task 4: Parse-run service and worker

**Files:**
- Create: `apps/api/src/modules/certdrill/blueprint-parse-service.ts`
- Create: `apps/api/tests/modules/certdrill/blueprint-parse-service.test.ts`
- Modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/tests/modules/certdrill/admin-service.test.ts`

- [ ] **Step 1: Write failing lifecycle tests**

Cover: resource/certification ownership, missing snapshot, SHA-256 checksum, pending insertion, atomic pending-to-running claim, completed persistence, invalid/provider failure persistence, and independent retries creating new runs.

- [ ] **Step 2: Implement**

Export:

```ts
export function createBlueprintParseService(deps: {
  db: any;
  parser: BlueprintParser;
  now?: () => Date;
}) {
  return {
    start(input: { certificationId: string; resourceId: string }): Promise<BlueprintParseRun>;
    get(id: string): Promise<BlueprintParseRun | null>;
    list(certificationId: string): Promise<BlueprintParseRun[]>;
    processPending(limit?: number): Promise<{ checked: number; completed: number; failed: number }>;
  };
}
```

`start` requires a resource belonging to the certification and a non-empty successful snapshot. Hash `rawContent` with SHA-256 and insert `pending`.

`processPending` loads oldest pending rows, claims each with `UPDATE ... WHERE status = 'pending' RETURNING`, marks `startedAt`, loads certification/resource, calls the parser, and persists completed proposal/confidence/warnings/raw output. Failures persist `failed`, `errorMessage`, `rawOutput` when available, and `completedAt` without changing the resource.

Expose the four methods through `createCertDrillAdminService`.

- [ ] **Step 3: Verify and commit**

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/blueprint-parse-service.test.ts tests/modules/certdrill/admin-service.test.ts
bun run typecheck:api
git add apps/api/src/modules/certdrill/blueprint-parse-service.ts apps/api/src/modules/certdrill/admin-service.ts apps/api/tests/modules/certdrill/blueprint-parse-service.test.ts apps/api/tests/modules/certdrill/admin-service.test.ts
git commit -m "feat: process blueprint parse runs"
```

### Task 5: Admin API and scheduled processing

**Files:**
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/api/tests/certdrill.admin.routes.test.ts`
- Modify: `apps/api/src/bootstrap.ts`
- Modify: `apps/api/tests/modules/jobs/runner.test.ts`

- [ ] **Step 1: Write failing route and job tests**

Add:

- `POST /certifications/:certificationId/blueprint-parse-runs` with `{resourceId}`;
- `GET /certifications/:certificationId/blueprint-parse-runs`;
- `GET /blueprint-parse-runs/:id`;
- a registered `certdrill-blueprint-parser` job that calls `processPending(5)`.

- [ ] **Step 2: Implement routing and bootstrap**

Validate all IDs as UUIDs. Start returns the pending run; list/detail return persisted data. Register the job at a 30-second interval.

Create the Foundry parser from environment only in bootstrap. If configuration is absent, inject a parser whose `parse` throws `BLUEPRINT_PARSER_NOT_CONFIGURED`; this keeps unrelated API startup and tests working while parse runs fail explicitly.

- [ ] **Step 3: Full verification**

```bash
bun run db:check
bun run typecheck:all
bun run test:api
bun run test:admin
```

Expected: all commands pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/certdrill/routes.ts apps/api/tests/certdrill.admin.routes.test.ts apps/api/src/bootstrap.ts apps/api/tests/modules/jobs/runner.test.ts
git commit -m "feat: expose blueprint parse runs"
```

## Follow-up

The next plan adds Blueprint-tab analysis controls, proposal editing/diff display, and transactional category import. This backend slice deliberately does not write categories.
