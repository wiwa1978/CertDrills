# CertDrill Visible MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CertDrill visible and usable in the running apps with demo seed data, user exam catalog/start/answer/results pages, and an admin CertDrill entry point.

**Architecture:** Build on the existing CertDrill API foundation. Keep UI code in `apps/web/src/modules/certdrill` and `apps/admin/src/modules/certdrill`, with thin route files under the app router. Seed demo content through an explicit script so a fresh database shows certifications and sample questions without manual SQL.

**Tech Stack:** Bun, TypeScript, Hono API, Drizzle/PostgreSQL, Next.js App Router, Tailwind/shadcn, Vitest.

---

## Scope

Included:

- Demo seed script for certifications, categories, published questions, and answer options.
- Web navigation and auth guard updates for `/exams`, `/exams/[certId]/start`, `/exams/[attemptId]`, `/exams/[attemptId]/results`, and `/profile/attempts`.
- User API client helpers for CertDrill.
- Minimal user pages using the reference dark CertDrill visual language.
- Client exam runner for practice and exam mode.
- Admin nav item and `/admin/certdrill` page showing module status and certifications.
- README updates for seeding and visible CertDrill routes.

Deferred:

- Admin CRUD editing flows.
- LLM generation UI/runtime.
- Blueprint parser UI.
- Billing/cart integration. Purchase buttons are visible but disabled/copy-only until core billing exists.

## File Structure

- Create: `apps/api/src/modules/certdrill/seed-demo.ts` — idempotent demo data seeder.
- Create: `apps/api/src/scripts/seed-certdrill-demo.ts` — script entrypoint.
- Modify: `apps/api/package.json` — add `seed:certdrill` script.
- Create: `apps/api/tests/modules/certdrill/seed-demo.test.ts` — verifies idempotent seed behavior with mocks.
- Create: `apps/web/src/lib/api/certdrill.server.ts` — server-side API helpers.
- Create: `apps/web/src/lib/api/certdrill.ts` — browser API helpers for answer/submit/create attempt.
- Create: `apps/web/src/modules/certdrill/components.tsx` — shared visual components.
- Create: `apps/web/src/modules/certdrill/catalog-page.tsx` — all exams/my exams catalog UI.
- Create: `apps/web/src/modules/certdrill/start-page.tsx` — exam mode selection UI.
- Create: `apps/web/src/modules/certdrill/exam-runner.tsx` — client question/answer flow.
- Create: `apps/web/src/modules/certdrill/results-page.tsx` — results/review UI.
- Create: `apps/web/src/modules/certdrill/attempt-history-page.tsx` — attempt history UI.
- Create: `apps/web/src/app/[locale]/(backend)/exams/page.tsx`.
- Create: `apps/web/src/app/[locale]/(backend)/exams/[certId]/start/page.tsx`.
- Create: `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/page.tsx`.
- Create: `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/results/page.tsx`.
- Create: `apps/web/src/app/[locale]/(backend)/profile/attempts/page.tsx`.
- Modify: `apps/web/src/config/backend-navbar-dashboard.ts` — add Exams nav.
- Modify: `apps/web/src/proxy.ts` — protect `/exams` and `/profile/attempts`.
- Create: `apps/web/tests/config/certdrill-navigation.test.ts`.
- Create: `apps/web/tests/lib/certdrill-api.test.ts`.
- Create: `apps/admin/src/lib/api/certdrill.server.ts` — admin server helper.
- Create: `apps/admin/src/modules/certdrill/admin-page.tsx` — admin landing page.
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/page.tsx`.
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx` — add CertDrill nav.
- Create: `apps/admin/tests/config/certdrill-admin-nav.test.ts`.
- Modify: `README.md` — document seed/run paths.

## Task 1: Demo Seeder

**Files:**
- Create: `apps/api/src/modules/certdrill/seed-demo.ts`
- Create: `apps/api/src/scripts/seed-certdrill-demo.ts`
- Modify: `apps/api/package.json`
- Test: `apps/api/tests/modules/certdrill/seed-demo.test.ts`

- [ ] **Step 1: Write failing seeder test**

Create `apps/api/tests/modules/certdrill/seed-demo.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

import { seedCertDrillDemoData } from "../../../src/modules/certdrill/seed-demo";

describe("CertDrill demo seeder", () => {
  it("creates demo certifications only when they do not already exist", async () => {
    const inserts: Array<{ table: string; values: unknown }> = [];
    const db = {
      query: {
        certdrillCertifications: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: "existing-az" })
            .mockResolvedValueOnce({ id: "cert-aws" }),
        },
      },
      insert: vi.fn((table: { _: { name: string } }) => ({
        values: vi.fn((values: unknown) => {
          inserts.push({ table: table._.name, values });
          return { returning: vi.fn().mockResolvedValue([{ id: "cert-aws" }]) };
        }),
      })),
    };

    const result = await seedCertDrillDemoData(db as never);

    expect(result.createdCertifications).toBe(1);
    expect(result.skippedCertifications).toBe(1);
    expect(inserts.some((entry) => entry.table === "certdrill_certifications")).toBe(true);
    expect(inserts.some((entry) => entry.table === "certdrill_questions")).toBe(true);
    expect(inserts.some((entry) => entry.table === "certdrill_answer_options")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test and verify red**

Run: `bun run --cwd apps/api test tests/modules/certdrill/seed-demo.test.ts`

Expected: FAIL because `seed-demo.ts` does not exist.

- [ ] **Step 3: Implement idempotent seeder**

Create `apps/api/src/modules/certdrill/seed-demo.ts` with an idempotent seeder for at least AWS SAA-C03 and AZ-104. Each created certification must include one top-level category and two published questions with two answer options each. Use the existing CertDrill schema tables and `findFirst` by code to skip existing certifications.

Implementation requirements:

- Export `seedCertDrillDemoData(db)`.
- Return `{ createdCertifications, skippedCertifications }`.
- Insert questions with `status: "published"`, `createdBy: "admin"`, `difficulty`, and empty media assets.
- Insert answer options with exactly one correct option, explanations, and citation URLs.

- [ ] **Step 4: Add script entrypoint**

Create `apps/api/src/scripts/seed-certdrill-demo.ts`:

```ts
import { createPlatformDb } from "@platform/platform-db";

import { env } from "../env";
import { seedCertDrillDemoData } from "../modules/certdrill/seed-demo";

const { db, client } = createPlatformDb({ connectionString: env.DATABASE_URL });

try {
  const result = await seedCertDrillDemoData(db);
  console.log(JSON.stringify({ success: true, result }, null, 2));
} finally {
  await client.end();
}
```

Modify `apps/api/package.json` scripts:

```json
"seed:certdrill": "tsx src/scripts/seed-certdrill-demo.ts"
```

- [ ] **Step 5: Verify seeder**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/seed-demo.test.ts
bun run --cwd apps/api typecheck
```

Expected: PASS.

## Task 2: Web CertDrill API Helpers And Navigation

**Files:**
- Create: `apps/web/src/lib/api/certdrill.server.ts`
- Create: `apps/web/src/lib/api/certdrill.ts`
- Modify: `apps/web/src/config/backend-navbar-dashboard.ts`
- Modify: `apps/web/src/proxy.ts`
- Test: `apps/web/tests/config/certdrill-navigation.test.ts`
- Test: `apps/web/tests/lib/certdrill-api.test.ts`

- [ ] **Step 1: Write failing nav test**

Create `apps/web/tests/config/certdrill-navigation.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BackendNavItems } from "../../src/config/backend-navbar-dashboard";

describe("CertDrill web navigation", () => {
  it("shows exams in authenticated navigation", () => {
    expect(BackendNavItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "dashboard.nav.exams", url: "/exams" }),
    ]));
  });
});
```

- [ ] **Step 2: Run nav test and verify red**

Run: `bun run --cwd apps/web test tests/config/certdrill-navigation.test.ts`

Expected: FAIL because nav does not include `/exams`.

- [ ] **Step 3: Add API helper tests**

Create `apps/web/tests/lib/certdrill-api.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/client", () => ({
  apiRequest: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
}));

describe("CertDrill browser API helpers", () => {
  it("posts answer payloads to the CertDrill API", async () => {
    const { answerCertDrillQuestion } = await import("../../src/lib/api/certdrill");
    const result = await answerCertDrillQuestion("attempt-1", { questionId: "q1", selectedOptionId: "o1" });
    expect(result).toEqual({ path: "/api/certdrill/exams/attempt-1/answers", init: expect.objectContaining({ method: "POST" }) });
  });
});
```

- [ ] **Step 4: Run API helper test and verify red**

Run: `bun run --cwd apps/web test tests/lib/certdrill-api.test.ts`

Expected: FAIL because helper file does not exist.

- [ ] **Step 5: Implement nav and proxy**

Modify `apps/web/src/config/backend-navbar-dashboard.ts`:

- Import `BookOpen` from `lucide-react`.
- Add `{ title: "dashboard.nav.exams", url: "/exams", icon: BookOpen }` after dashboard overview.
- Add `{ title: "dashboard.nav.attempts", url: "/profile/attempts", icon: BookOpen }` to `UserDropdownNavItems` before settings.

Modify `apps/web/src/proxy.ts`:

```ts
const AUTHENTICATED_ONLY = ["/dashboard", "/billing", "/settings", "/exams", "/profile/attempts"];
```

- [ ] **Step 6: Implement API helpers**

Create `apps/web/src/lib/api/certdrill.server.ts` with server helpers using `serverApiRequest` for:

- `getCertDrillCertificationsServer()` -> `/api/certdrill/certifications`
- `getMyCertDrillCertificationsServer()` -> `/api/certdrill/my-certifications`
- `getCertDrillCategoriesServer(certificationId)` -> `/api/certdrill/certifications/:id/categories`
- `getCertDrillReviewServer(attemptId)` -> `/api/certdrill/exams/:id/review`
- `getCertDrillAttemptsServer()` -> `/api/certdrill/users/me/attempts`

Create `apps/web/src/lib/api/certdrill.ts` with browser helpers using `apiRequest` for:

- `createCertDrillAttempt(input)`
- `answerCertDrillQuestion(attemptId, input)`
- `submitCertDrillAttempt(attemptId)`

- [ ] **Step 7: Verify helpers/nav**

Run:

```bash
bun run --cwd apps/web test tests/config/certdrill-navigation.test.ts tests/lib/certdrill-api.test.ts
bun run --cwd apps/web typecheck
```

Expected: PASS.

## Task 3: Web Catalog And Start Pages

**Files:**
- Create: `apps/web/src/modules/certdrill/components.tsx`
- Create: `apps/web/src/modules/certdrill/catalog-page.tsx`
- Create: `apps/web/src/modules/certdrill/start-page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/exams/page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/exams/[certId]/start/page.tsx`

- [ ] **Step 1: Implement visual components**

Create `apps/web/src/modules/certdrill/components.tsx` exporting:

- `CertDrillShell`
- `StampBox`
- `ActionButton`
- `CategoryTag`

Use the dark blueprint-grid visual language from `docs/certdrill/*.html`.

- [ ] **Step 2: Implement catalog module**

Create `apps/web/src/modules/certdrill/catalog-page.tsx`. It accepts `{ allCertifications, myCertifications }` and renders:

- Heading `Certification Exams`.
- Tabs/sections `All exams` and `My exams`.
- Cards for active certifications.
- Purchased cards show `View` linking to `/exams/[id]/start`.
- Not purchased cards show disabled `Purchase` with copy `Purchase flow coming soon`.
- Empty state when there are no certifications: `No certification exams have been published yet.`

- [ ] **Step 3: Implement start module**

Create `apps/web/src/modules/certdrill/start-page.tsx`. It accepts `{ certification, categories }` and renders:

- `Practice mode` and `Exam simulation` choices.
- `Category focus` and `Blueprint-weighted random` choices.
- Start button that calls `createCertDrillAttempt` then navigates to `/exams/[attemptId]`.

- [ ] **Step 4: Add route files**

Create `apps/web/src/app/[locale]/(backend)/exams/page.tsx` that calls server helpers and renders `CatalogPage`.

Create `apps/web/src/app/[locale]/(backend)/exams/[certId]/start/page.tsx` that finds the certification from the catalog, loads categories, and renders `StartPage`.

- [ ] **Step 5: Verify web typecheck**

Run: `bun run --cwd apps/web typecheck`

Expected: PASS.

## Task 4: Web Exam Runner, Results, And Attempts

**Files:**
- Create: `apps/web/src/modules/certdrill/exam-runner.tsx`
- Create: `apps/web/src/modules/certdrill/results-page.tsx`
- Create: `apps/web/src/modules/certdrill/attempt-history-page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/results/page.tsx`
- Create: `apps/web/src/app/[locale]/(backend)/profile/attempts/page.tsx`

- [ ] **Step 1: Implement exam runner**

Create `apps/web/src/modules/certdrill/exam-runner.tsx` as a client component. It accepts the attempt payload returned from `createCertDrillAttempt` and supports:

- Option selection.
- Practice mode `Check answer` button, feedback display, then next question.
- Exam mode immediate next question after answer.
- Submit on last question.
- Redirect to `/exams/[attemptId]/results` after submit.

- [ ] **Step 2: Add attempt route**

Create `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/page.tsx`. Because attempt creation returns the question payload client-side, this route should render an explanatory empty state if opened directly: `Start an exam from the certification page.` Include a link to `/exams`.

- [ ] **Step 3: Implement results page**

Create `apps/web/src/modules/certdrill/results-page.tsx` rendering score, pass/fail, category breakdown, and per-question review using `getCertDrillReviewServer` data.

Create `apps/web/src/app/[locale]/(backend)/exams/[attemptId]/results/page.tsx` to fetch review data and render results.

- [ ] **Step 4: Implement attempt history**

Create `apps/web/src/modules/certdrill/attempt-history-page.tsx` rendering attempt date, certification code/name, status, mode, and score. Completed attempts link to `/exams/[attemptId]/results`.

Create `apps/web/src/app/[locale]/(backend)/profile/attempts/page.tsx` to fetch attempts and render history.

- [ ] **Step 5: Verify web typecheck**

Run: `bun run --cwd apps/web typecheck`

Expected: PASS.

## Task 5: Admin CertDrill Entry Point

**Files:**
- Create: `apps/admin/src/lib/api/certdrill.server.ts`
- Create: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/page.tsx`
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx`
- Test: `apps/admin/tests/config/certdrill-admin-nav.test.ts`

- [ ] **Step 1: Write failing admin nav test**

Create `apps/admin/tests/config/certdrill-admin-nav.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { BackendNavAdminItems } from "../../src/config/backend-navbar-admin";

describe("CertDrill admin navigation", () => {
  it("contains CertDrill admin link", () => {
    expect(BackendNavAdminItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "admin.nav.certdrill", url: "/admin/certdrill" }),
    ]));
  });
});
```

- [ ] **Step 2: Run admin nav test and verify red**

Run: `bun run --cwd apps/admin test tests/config/certdrill-admin-nav.test.ts`

Expected: FAIL because nav item does not exist.

- [ ] **Step 3: Add admin nav item**

Modify `apps/admin/src/config/backend-navbar-admin.tsx`:

- Import `BookOpenCheck` from `lucide-react`.
- Add `{ title: "admin.nav.certdrill", url: "/admin/certdrill", icon: BookOpenCheck }` after overview.

- [ ] **Step 4: Add admin API helper and page**

Create `apps/admin/src/lib/api/certdrill.server.ts` with helper to call `/api/certdrill/certifications` for now. This is a temporary read-only admin overview until admin CRUD endpoints are implemented.

Create `apps/admin/src/modules/certdrill/admin-page.tsx` rendering:

- `CertDrill Admin`
- `Certification catalog`
- cards/table for certifications with code, vendor, published question count
- message that CRUD/generation workflows are next.

Create `apps/admin/src/app/[locale]/(backend)/(admin)/admin/certdrill/page.tsx` to render the admin page.

- [ ] **Step 5: Verify admin tests/typecheck**

Run:

```bash
bun run --cwd apps/admin test tests/config/certdrill-admin-nav.test.ts
bun run --cwd apps/admin typecheck
```

Expected: PASS.

## Task 6: Documentation And Verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README**

Add a `Seed Demo Certifications` section:

```md
## Seed Demo Certifications

After migrations, seed demo CertDrill data:

```bash
bun run --cwd apps/api seed:certdrill
```

This creates demo active certifications, blueprint categories, published questions, and answer options. It is idempotent by certification code.
```

Add visible route list:

- Web `/exams`
- Web `/profile/attempts`
- Admin `/admin/certdrill`

- [ ] **Step 2: Run final focused verification**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/seed-demo.test.ts tests/modules/certdrill/validation.test.ts tests/modules/certdrill/selection.test.ts tests/modules/certdrill/snapshot.test.ts tests/modules/certdrill/access.test.ts tests/modules/certdrill/service.test.ts tests/certdrill.routes.test.ts tests/env.test.ts
bun run --cwd apps/web test tests/config/certdrill-navigation.test.ts tests/lib/certdrill-api.test.ts
bun run --cwd apps/admin test tests/config/certdrill-admin-nav.test.ts
bun run typecheck:all
```

Expected: PASS, except pre-existing full API TOTP failures are not part of this focused check.

## Plan Self-Review

Spec coverage:

- User catalog all/my exams: Task 3.
- Purchase vs view state: Task 3, with purchase disabled until billing exists.
- Exam start/question-answer interface: Tasks 3 and 4.
- Results and attempt history: Task 4.
- Seed data: Task 1.
- Admin visibility: Task 5.
- CertDrill visual language: Tasks 3 and 4.

Deferred by design:

- Real purchase/cart checkout.
- Admin CRUD/generation workflows.
- Full question bank management UI.

No placeholder steps remain; each task has concrete files, commands, and expected outcomes.
