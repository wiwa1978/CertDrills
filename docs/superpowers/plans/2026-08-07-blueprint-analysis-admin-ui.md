# Blueprint Analysis Admin UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Resources-table action that starts AI blueprint analysis, polls its asynchronous run, and displays the read-only category proposal in a dialog.

**Architecture:** Keep the Resources table server-rendered and add one focused client component per row. Typed server helpers load existing runs, small Next.js route handlers proxy browser requests to the authenticated backend, and a separately tested polling controller manages terminal states, errors, cleanup, and timeout.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Radix Dialog, Vitest

---

## File Structure

- Modify `apps/admin/src/lib/api/certdrill.server.ts` — parse-run/proposal wire types and authenticated server helpers.
- Create `apps/admin/src/app/api/certdrill/blueprint-parse-runs/route.ts` — browser-safe start proxy.
- Create `apps/admin/src/app/api/certdrill/blueprint-parse-runs/[runId]/route.ts` — browser-safe detail proxy.
- Create `apps/admin/src/modules/certdrill/blueprint-analysis.ts` — eligibility, newest-run selection, hierarchy depth, and polling controller.
- Create `apps/admin/src/modules/certdrill/blueprint-analysis-client.ts` — browser fetch boundary.
- Create `apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx` — Analyze/View action, status, dialog, and proposal rendering.
- Modify `apps/admin/src/modules/certdrill/admin-page.tsx` — load runs and render the control in each resource row.
- Add focused tests under `apps/admin/tests/`.

### Task 1: Parse-run types and authenticated server helpers

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Modify: `apps/admin/tests/lib/certdrill-admin-api.test.ts`

- [ ] **Step 1: Write failing helper tests**

Add helper-call assertions for:

```ts
listCertDrillAdminBlueprintParseRunsServer("cert-1")
// GET /api/admin/certdrill/certifications/cert-1/blueprint-parse-runs

startCertDrillAdminBlueprintParseRunServer("cert-1", "resource-1")
// POST /api/admin/certdrill/certifications/cert-1/blueprint-parse-runs
// body: {"resourceId":"resource-1"}

getCertDrillAdminBlueprintParseRunServer("run-1")
// GET /api/admin/certdrill/blueprint-parse-runs/run-1
```

- [ ] **Step 2: Verify RED**

```bash
bun run --cwd apps/admin test -- tests/lib/certdrill-admin-api.test.ts
```

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Add wire types**

Add:

```ts
export type CertDrillBlueprintEvidence = {
  excerpt: string;
  location: string | null;
};

export type CertDrillBlueprintCategoryProposal = {
  code: string;
  name: string;
  parentCode: string | null;
  weightPct: number | null;
  sortOrder: number;
  evidence: CertDrillBlueprintEvidence[];
};

export type CertDrillBlueprintProposal = {
  confidence: "high" | "medium" | "low";
  warnings: string[];
  categories: CertDrillBlueprintCategoryProposal[];
};

export type CertDrillBlueprintParseRun = {
  id: string;
  certificationId: string;
  resourceId: string;
  status: "pending" | "running" | "completed" | "failed";
  provider: string;
  model: string;
  contentChecksum: string;
  proposalJson: CertDrillBlueprintProposal | null;
  confidence: "high" | "medium" | "low" | null;
  warningsJson: string[];
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};
```

Do not expose `rawOutput` to the UI model.

- [ ] **Step 4: Add server helpers**

```ts
export async function listCertDrillAdminBlueprintParseRunsServer(
  certificationId: string,
): Promise<CertDrillBlueprintParseRun[]> {
  return certdrillAdminRequest<CertDrillBlueprintParseRun[]>(
    `/certifications/${certificationId}/blueprint-parse-runs`,
  );
}

export async function startCertDrillAdminBlueprintParseRunServer(
  certificationId: string,
  resourceId: string,
): Promise<CertDrillBlueprintParseRun> {
  return certdrillAdminRequest<CertDrillBlueprintParseRun>(
    `/certifications/${certificationId}/blueprint-parse-runs`,
    jsonRequestInit("POST", { resourceId }),
  );
}

export async function getCertDrillAdminBlueprintParseRunServer(
  runId: string,
): Promise<CertDrillBlueprintParseRun> {
  return certdrillAdminRequest<CertDrillBlueprintParseRun>(
    `/blueprint-parse-runs/${runId}`,
  );
}
```

- [ ] **Step 5: Verify and commit**

```bash
bun run --cwd apps/admin test -- tests/lib/certdrill-admin-api.test.ts
bun run typecheck:admin
git add apps/admin/src/lib/api/certdrill.server.ts apps/admin/tests/lib/certdrill-admin-api.test.ts
git commit -m "feat: add blueprint parse admin helpers"
```

### Task 2: Browser-safe parse-run proxy routes

**Files:**
- Create: `apps/admin/src/app/api/certdrill/blueprint-parse-runs/route.ts`
- Create: `apps/admin/src/app/api/certdrill/blueprint-parse-runs/[runId]/route.ts`
- Create: `apps/admin/tests/routes/blueprint-parse-runs.test.ts`

- [ ] **Step 1: Write failing route tests**

Mock the Task 1 helpers and test:

```ts
await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ certificationId, resourceId }),
}));
```

Assert strict UUID validation, rejection of unknown keys, status `201`, and exact delegation. Test `GET` detail with a valid UUID and invalid run ID.

- [ ] **Step 2: Verify RED**

```bash
bun run --cwd apps/admin test -- tests/routes/blueprint-parse-runs.test.ts
```

- [ ] **Step 3: Implement the start proxy**

Use Zod:

```ts
const startSchema = z.object({
  certificationId: z.string().uuid(),
  resourceId: z.string().uuid(),
}).strict();
```

Return JSON:

```ts
{ success: true, data: run }
```

with status `201`. Return:

```ts
{ success: false, error: { message: "Invalid blueprint analysis request." } }
```

with status `400` for malformed input. For helper errors, return status `500` and a safe message derived from `error instanceof Error ? error.message : "Blueprint analysis request failed."`.

- [ ] **Step 4: Implement the detail proxy**

Read `runId` from `context.params`, validate UUID, call `getCertDrillAdminBlueprintParseRunServer`, and return the same success envelope with status `200`. Invalid IDs return `400`; helper errors return `500`.

- [ ] **Step 5: Verify and commit**

```bash
bun run --cwd apps/admin test -- tests/routes/blueprint-parse-runs.test.ts
bun run typecheck:admin
git add apps/admin/src/app/api/certdrill/blueprint-parse-runs apps/admin/tests/routes/blueprint-parse-runs.test.ts
git commit -m "feat: proxy blueprint parse requests"
```

### Task 3: Eligibility, hierarchy, and polling controller

**Files:**
- Create: `apps/admin/src/modules/certdrill/blueprint-analysis.ts`
- Create: `apps/admin/tests/modules/certdrill/blueprint-analysis.test.ts`

- [ ] **Step 1: Write failing pure-unit tests**

Cover:

- only ingested `outline_blueprint` resources with source type `exam-blueprint` or `study-guide` are eligible;
- deterministic disabled reasons;
- newest run per resource by `createdAt`;
- category hierarchy depth from `parentCode`;
- polling every 2 seconds;
- no overlapping detail requests;
- stop on completed/failed;
- stop and report transport error;
- manual retry;
- stop on close/dispose;
- five-minute timeout.

- [ ] **Step 2: Verify RED**

```bash
bun run --cwd apps/admin test -- tests/modules/certdrill/blueprint-analysis.test.ts
```

- [ ] **Step 3: Implement pure helpers**

```ts
export function blueprintAnalysisEligibility(
  resource: CertDrillAdminResource,
): { eligible: true } | { eligible: false; reason: string };

export function newestBlueprintRunByResource(
  runs: CertDrillBlueprintParseRun[],
): Map<string, CertDrillBlueprintParseRun>;

export function blueprintCategoryDepths(
  categories: CertDrillBlueprintCategoryProposal[],
): Map<string, number>;
```

Use exact disabled reasons:

- `Ingest this resource before analysis.`
- `Use outline blueprint content mode for analysis.`
- `Only study-guide and exam-blueprint resources can be analyzed.`

- [ ] **Step 4: Implement the polling controller**

```ts
export function createBlueprintRunPoller(deps: {
  fetchRun: (runId: string) => Promise<CertDrillBlueprintParseRun>;
  onRun: (run: CertDrillBlueprintParseRun) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  return {
    start(runId: string): void;
    retry(): Promise<void>;
    stop(): void;
  };
}
```

Defaults are 2,000 ms and 300,000 ms. Use recursive `setTimeout` after each request completes rather than `setInterval`, preventing overlap. `retry` performs one immediate request and resumes polling only for pending/running runs.

- [ ] **Step 5: Verify and commit**

```bash
bun run --cwd apps/admin test -- tests/modules/certdrill/blueprint-analysis.test.ts
bun run typecheck:admin
git add apps/admin/src/modules/certdrill/blueprint-analysis.ts apps/admin/tests/modules/certdrill/blueprint-analysis.test.ts
git commit -m "feat: manage blueprint analysis polling"
```

### Task 4: Analysis client boundary and dialog control

**Files:**
- Create: `apps/admin/src/modules/certdrill/blueprint-analysis-client.ts`
- Create: `apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx`
- Create: `apps/admin/tests/modules/certdrill/blueprint-analysis-control.test.ts`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write failing component-contract tests**

Test static completed-dialog markup by exporting a presentational `BlueprintAnalysisDetails` component and rendering it with `renderToStaticMarkup`. Assert status, confidence, warnings, hierarchy indentation marker, `Not provided`, evidence excerpts/locations, provider/model, timestamps, and no Save/Import action.

Add source-contract assertions for client behavior: `"use client"`, `createBlueprintRunPoller`, start/detail client functions, dialog `onOpenChange`, `aria-live="polite"`, Analyze again, Retry status check, and poller cleanup.

- [ ] **Step 2: Implement browser fetch helpers**

```ts
export async function startBlueprintAnalysis(
  certificationId: string,
  resourceId: string,
): Promise<CertDrillBlueprintParseRun>;

export async function getBlueprintAnalysisRun(
  runId: string,
): Promise<CertDrillBlueprintParseRun>;
```

Call the Task 2 routes with same-origin `fetch`, `credentials: "same-origin"`, and parse `{success,data,error}`. Throw `Error(error.message)` for non-success responses.

- [ ] **Step 3: Implement the client control**

Props:

```ts
{
  certificationId: string;
  resource: CertDrillAdminResource;
  initialRun?: CertDrillBlueprintParseRun;
}
```

Behavior:

- render disabled Analyze with the Task 3 reason when ineligible;
- render Analyze when eligible without a run;
- render View analysis when a run exists;
- open immediately after starting;
- initialize a poller once per open dialog for pending/running runs;
- update state through `onRun`;
- stop on terminal status, close, and unmount;
- show request errors separately from persisted failed-run errors;
- Retry status check calls `poller.retry()`;
- Analyze again starts a new run.

- [ ] **Step 4: Implement presentational details**

Use `DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl"`. Add:

```tsx
<div aria-live="polite">
  <Badge>{statusLabel(run.status)}</Badge>
</div>
```

For completed proposals, preserve category array order, calculate depths with `blueprintCategoryDepths`, indent names with `paddingLeft: depth * 16`, show `Top level` for null parents, and render evidence as a list.

- [ ] **Step 5: Verify and commit**

```bash
bun run --cwd apps/admin test -- tests/modules/certdrill/blueprint-analysis-control.test.ts tests/components/certdrill-admin-page-copy.test.ts
bun run typecheck:admin
git add apps/admin/src/modules/certdrill/blueprint-analysis-client.ts apps/admin/src/modules/certdrill/blueprint-analysis-control.tsx apps/admin/tests/modules/certdrill/blueprint-analysis-control.test.ts apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "feat: show blueprint analysis dialog"
```

### Task 5: Resources-page integration

**Files:**
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`
- Create: `apps/admin/tests/modules/certdrill/blueprint-analysis-page.test.ts`

- [ ] **Step 1: Write failing page integration tests**

Mock `listCertDrillAdminBlueprintParseRunsServer` and assert it is loaded only when a certification is selected. Render the page and verify each resource receives only its newest run, while resources without runs receive `undefined`.

- [ ] **Step 2: Load parse runs with existing detail data**

Add:

```ts
let blueprintParseRuns: CertDrillBlueprintParseRun[] = [];
```

and include `listCertDrillAdminBlueprintParseRunsServer(selectedCertificationId)` in the selected-certification `Promise.all`.

Build:

```ts
const newestBlueprintRuns = newestBlueprintRunByResource(blueprintParseRuns);
```

- [ ] **Step 3: Wire the Resources table**

Change:

```ts
function ResourceTable({
  certificationId,
  resources,
  newestBlueprintRuns,
}: {
  certificationId: string;
  resources: CertDrillAdminResource[];
  newestBlueprintRuns: Map<string, CertDrillBlueprintParseRun>;
})
```

Keep the Ingest/Refresh form unchanged and render:

```tsx
<BlueprintAnalysisControl
  certificationId={certificationId}
  resource={resource}
  initialRun={newestBlueprintRuns.get(resource.id)}
/>
```

in the Actions cell.

- [ ] **Step 4: Verify targeted integration**

```bash
bun run --cwd apps/admin test -- tests/modules/certdrill/blueprint-analysis-page.test.ts tests/components/certdrill-admin-page-copy.test.ts
bun run typecheck:admin
```

- [ ] **Step 5: Run full validation**

```bash
bun run db:check
bun run typecheck:all
bun run test:admin
bun run test:api
```

Expected: all commands pass.

- [ ] **Step 6: Commit**

```bash
git add apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts apps/admin/tests/modules/certdrill/blueprint-analysis-page.test.ts
git commit -m "feat: trigger blueprint analysis from resources"
```
