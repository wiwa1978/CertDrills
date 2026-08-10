# Centralized Admin Questions Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `/admin/questions`, a server-backed, paginated admin table for searching and managing questions across all certifications and categories, with inline answer and explanation expansion.

**Architecture:** Add a dedicated admin API question-index query that performs filtering, stable sorting, pagination, and page-option loading on the server. The admin route keeps filter state in the URL, renders server-fetched data, and delegates only URL interaction and row expansion to focused client components. Extract the existing question action menu so certification-specific and centralized tables share Edit, Publish, and Archive behavior.

**Tech Stack:** Bun, TypeScript, Hono, Drizzle ORM, PostgreSQL, Next.js 16 App Router, React 19, next-intl, Radix/shadcn UI, Vitest

---

## File structure

### API

- Create `apps/api/src/modules/certdrill/admin-question-index.ts`
  - Defines normalized index query/result types.
  - Builds Drizzle filters.
  - Counts matching questions, clamps pages, loads one 50-row page, and loads options for that page.
- Modify `apps/api/src/modules/certdrill/admin-service.ts`
  - Exposes `listQuestionIndex`.
- Modify `apps/api/src/modules/certdrill/routes.ts`
  - Normalizes `GET /questions` query parameters and delegates to `listQuestionIndex`.
- Create `apps/api/tests/modules/certdrill/admin-question-index.test.ts`
  - Covers normalization, filtering inputs, page clamping, stable output mapping, and option ordering.
- Modify `apps/api/tests/certdrill.admin.routes.test.ts`
  - Covers route query normalization and delegation.

### Admin API client and shared question controls

- Modify `apps/admin/src/lib/api/certdrill.server.ts`
  - Adds index query/result types and `listCertDrillAdminQuestionIndexServer`.
- Create `apps/admin/src/modules/certdrill/question-actions-menu.tsx`
  - Shared status-dependent Edit, Publish, and Archive dropdown.
- Modify `apps/admin/src/modules/certdrill/admin-page.tsx`
  - Replaces its inline action-menu markup with the shared component.
- Modify `apps/admin/src/modules/certdrill/admin-actions.ts`
  - Revalidates both certification-specific pages and `/admin/questions`.

### Centralized admin page

- Create `apps/admin/src/modules/certdrill/questions-index-query.ts`
  - Normalizes page search parameters and builds filter, sort, and pagination URLs.
- Create `apps/admin/src/modules/certdrill/questions-index-filter-bar.tsx`
  - Provides debounced search and immediate URL-backed filters.
- Create `apps/admin/src/modules/certdrill/questions-index-table.tsx`
  - Renders the table, inline answer expansion, shared actions, and pagination.
- Create `apps/admin/src/modules/certdrill/questions-index-page.tsx`
  - Server component that fetches and composes the centralized view.
- Create `apps/admin/src/app/[locale]/(backend)/(admin)/admin/questions/page.tsx`
  - App Router entry point.
- Create `apps/admin/tests/modules/certdrill/questions-index-query.test.ts`
  - Covers query normalization and URL-state helpers.
- Create `apps/admin/tests/components/certdrill-questions-index.test.ts`
  - Covers component wiring and required interaction safeguards using the repository's source-contract test style.

### Navigation and translations

- Modify `apps/admin/src/config/backend-navbar-admin.tsx`
  - Adds the Questions sidebar item.
- Modify `apps/admin/src/messages/en.json`
- Modify `apps/admin/src/messages/fr.json`
- Modify `apps/admin/src/messages/nl.json`
  - Adds `admin.nav.questions`.
- Modify `apps/admin/tests/config/certdrill-admin-nav.test.ts`
  - Covers the new route and translation key.

---

### Task 1: Build the API question-index query

**Files:**
- Create: `apps/api/src/modules/certdrill/admin-question-index.ts`
- Create: `apps/api/tests/modules/certdrill/admin-question-index.test.ts`

- [ ] **Step 1: Write failing normalization and page-result tests**

Create tests for the public query contract before writing the implementation:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  listAdminQuestionIndex,
  normalizeAdminQuestionIndexQuery,
} from "../../../src/modules/certdrill/admin-question-index";

const certificationId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";

describe("admin question index", () => {
  it("normalizes unsupported filters and invalid pages", () => {
    expect(normalizeAdminQuestionIndexQuery({
      search: "  network  ",
      certificationId,
      categoryId,
      status: "invalid",
      difficulty: "impossible",
      sort: "unknown",
      page: "-4",
    })).toEqual({
      search: "network",
      certificationId,
      categoryId,
      status: undefined,
      difficulty: undefined,
      sort: "stem-asc",
      page: 1,
    });
  });

  it("clamps an out-of-range page and preserves sorted option order", async () => {
    const repository = {
      count: vi.fn().mockResolvedValue(51),
      listRows: vi.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{
          id: "question-51",
          certificationId,
          certificationCode: "AZ-104",
          certificationName: "Azure Administrator",
          categoryId,
          categoryCode: "D1",
          categoryName: "Identity",
          stem: "Question 51",
          status: "published",
          difficulty: "medium",
        }]),
      listOptions: vi.fn().mockResolvedValue([
        { id: "option-b", questionId: "question-51", text: "B", isCorrect: false, explanation: "", sortOrder: 2 },
        { id: "option-a", questionId: "question-51", text: "A", isCorrect: true, explanation: "Correct", sortOrder: 1 },
      ]),
      listFilterOptions: vi.fn().mockResolvedValue({
        certifications: [{ id: certificationId, code: "AZ-104", name: "Azure Administrator" }],
        categories: [{ id: categoryId, certificationId, code: "D1", name: "Identity" }],
      }),
    };

    const result = await listAdminQuestionIndex(repository, { page: "99" });

    expect(repository.listRows).toHaveBeenNthCalledWith(1, expect.objectContaining({ page: 99, offset: 4900 }));
    expect(repository.listRows).toHaveBeenNthCalledWith(2, expect.objectContaining({ page: 2, offset: 50 }));
    expect(result.page).toBe(2);
    expect(result.pageCount).toBe(2);
    expect(result.total).toBe(51);
    expect(result.items[0]?.options.map((option) => option.id)).toEqual(["option-a", "option-b"]);
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/admin-question-index.test.ts
```

Expected: FAIL because `admin-question-index.ts` does not exist.

- [ ] **Step 3: Implement normalized types and orchestration**

Create `admin-question-index.ts` with explicit contracts and a repository seam:

```ts
import type { CertDrillDifficulty, CertDrillQuestionStatus } from "@platform/platform-db";

export const adminQuestionIndexPageSize = 50;

export type AdminQuestionIndexSort = "stem-asc" | "stem-desc";

export type AdminQuestionIndexQueryInput = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: string;
  difficulty?: string;
  sort?: string;
  page?: string;
};

export type AdminQuestionIndexQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: CertDrillQuestionStatus;
  difficulty?: CertDrillDifficulty;
  sort: AdminQuestionIndexSort;
  page: number;
};

export type AdminQuestionIndexRow = {
  id: string;
  certificationId: string;
  certificationCode: string;
  certificationName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  stem: string;
  status: CertDrillQuestionStatus;
  difficulty: CertDrillDifficulty;
};

export type AdminQuestionIndexOption = {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
  sortOrder: number;
};

export type AdminQuestionIndexRepository = {
  count(query: AdminQuestionIndexQuery): Promise<number>;
  listRows(query: AdminQuestionIndexQuery & { offset: number; limit: number }): Promise<AdminQuestionIndexRow[]>;
  listOptions(questionIds: string[]): Promise<AdminQuestionIndexOption[]>;
  listFilterOptions(): Promise<{
    certifications: Array<{ id: string; code: string; name: string }>;
    categories: Array<{ id: string; certificationId: string; code: string; name: string }>;
  }>;
};

function isUuid(value?: string) {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}

export function normalizeAdminQuestionIndexQuery(input: AdminQuestionIndexQueryInput): AdminQuestionIndexQuery {
  const parsedPage = Number(input.page);
  return {
    search: input.search?.trim() || undefined,
    certificationId: isUuid(input.certificationId) ? input.certificationId : undefined,
    categoryId: isUuid(input.categoryId) ? input.categoryId : undefined,
    status: input.status === "draft" || input.status === "published" || input.status === "archived"
      ? input.status
      : undefined,
    difficulty: input.difficulty === "easy" || input.difficulty === "medium" || input.difficulty === "hard"
      ? input.difficulty
      : undefined,
    sort: input.sort === "stem-desc" ? "stem-desc" : "stem-asc",
    page: Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
  };
}

export async function listAdminQuestionIndex(
  repository: AdminQuestionIndexRepository,
  input: AdminQuestionIndexQueryInput,
) {
  const normalizedQuery = normalizeAdminQuestionIndexQuery(input);
  const filterOptions = await repository.listFilterOptions();
  const selectedCategory = normalizedQuery.categoryId
    ? filterOptions.categories.find((category) => category.id === normalizedQuery.categoryId)
    : undefined;
  const requestedQuery = normalizedQuery.certificationId
    && selectedCategory
    && selectedCategory.certificationId !== normalizedQuery.certificationId
      ? { ...normalizedQuery, categoryId: undefined }
      : normalizedQuery;
  const total = await repository.count(requestedQuery);
  const pageCount = Math.max(1, Math.ceil(total / adminQuestionIndexPageSize));
  const requestedPage = requestedQuery.page;

  async function loadPage(page: number) {
    return repository.listRows({
      ...requestedQuery,
      page,
      offset: (page - 1) * adminQuestionIndexPageSize,
      limit: adminQuestionIndexPageSize,
    });
  }

  let page = requestedPage;
  let rows = await loadPage(page);
  if (rows.length === 0 && total > 0 && requestedPage > pageCount) {
    page = pageCount;
    rows = await loadPage(page);
  }

  const options = rows.length > 0
    ? await repository.listOptions(rows.map((row) => row.id))
    : [];
  const optionsByQuestion = new Map<string, AdminQuestionIndexOption[]>();
  for (const option of options.toSorted(
    (first, second) => first.sortOrder - second.sortOrder || first.id.localeCompare(second.id),
  )) {
    const current = optionsByQuestion.get(option.questionId) ?? [];
    current.push(option);
    optionsByQuestion.set(option.questionId, current);
  }

  return {
    items: rows.map((row) => ({ ...row, options: optionsByQuestion.get(row.id) ?? [] })),
    ...filterOptions,
    page,
    pageCount,
    pageSize: adminQuestionIndexPageSize,
    total,
  };
}
```

- [ ] **Step 4: Add the production Drizzle repository**

In the same file, add `createAdminQuestionIndexRepository(db)` using:

```ts
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillExamCategories,
  certdrillQuestions,
} from "@platform/platform-db";
```

```ts
function buildQuestionIndexWhere(query: AdminQuestionIndexQuery) {
  const conditions: SQL[] = [];
  if (query.certificationId) conditions.push(eq(certdrillQuestions.certificationId, query.certificationId));
  if (query.categoryId) conditions.push(eq(certdrillQuestions.categoryId, query.categoryId));
  if (query.status) conditions.push(eq(certdrillQuestions.status, query.status));
  if (query.difficulty) conditions.push(eq(certdrillQuestions.difficulty, query.difficulty));

  if (query.search) {
    const pattern = `%${query.search}%`;
    const searchCondition = or(
      sql`cast(${certdrillQuestions.id} as text) ilike ${pattern}`,
      ilike(certdrillQuestions.stem, pattern),
      ilike(certdrillCertifications.code, pattern),
      ilike(certdrillCertifications.name, pattern),
      ilike(certdrillExamCategories.code, pattern),
      ilike(certdrillExamCategories.name, pattern),
      ilike(certdrillQuestions.status, pattern),
      ilike(certdrillQuestions.difficulty, pattern),
      sql`exists (
        select 1
        from ${certdrillAnswerOptions}
        where ${certdrillAnswerOptions.questionId} = ${certdrillQuestions.id}
          and (
            ${certdrillAnswerOptions.text} ilike ${pattern}
            or ${certdrillAnswerOptions.explanation} ilike ${pattern}
          )
      )`,
    );
    if (searchCondition) conditions.push(searchCondition);
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

export function createAdminQuestionIndexRepository(db: any): AdminQuestionIndexRepository {
  return {
    async count(query) {
      const [row] = await db
        .select({ value: count() })
        .from(certdrillQuestions)
        .innerJoin(
          certdrillCertifications,
          eq(certdrillCertifications.id, certdrillQuestions.certificationId),
        )
        .innerJoin(
          certdrillExamCategories,
          eq(certdrillExamCategories.id, certdrillQuestions.categoryId),
        )
        .where(buildQuestionIndexWhere(query));
      return Number(row?.value ?? 0);
    },

    async listRows({ offset, limit, ...query }) {
      const stemOrder = query.sort === "stem-desc"
        ? desc(certdrillQuestions.stem)
        : asc(certdrillQuestions.stem);
      return db
        .select({
          id: certdrillQuestions.id,
          certificationId: certdrillQuestions.certificationId,
          certificationCode: certdrillCertifications.code,
          certificationName: certdrillCertifications.name,
          categoryId: certdrillQuestions.categoryId,
          categoryCode: certdrillExamCategories.code,
          categoryName: certdrillExamCategories.name,
          stem: certdrillQuestions.stem,
          status: certdrillQuestions.status,
          difficulty: certdrillQuestions.difficulty,
        })
        .from(certdrillQuestions)
        .innerJoin(
          certdrillCertifications,
          eq(certdrillCertifications.id, certdrillQuestions.certificationId),
        )
        .innerJoin(
          certdrillExamCategories,
          eq(certdrillExamCategories.id, certdrillQuestions.categoryId),
        )
        .where(buildQuestionIndexWhere(query))
        .orderBy(
          asc(certdrillCertifications.code),
          asc(certdrillExamCategories.code),
          stemOrder,
          asc(certdrillQuestions.id),
        )
        .limit(limit)
        .offset(offset);
    },

    async listOptions(questionIds) {
      if (questionIds.length === 0) return [];
      return db
        .select({
          id: certdrillAnswerOptions.id,
          questionId: certdrillAnswerOptions.questionId,
          text: certdrillAnswerOptions.text,
          isCorrect: certdrillAnswerOptions.isCorrect,
          explanation: certdrillAnswerOptions.explanation,
          sortOrder: certdrillAnswerOptions.sortOrder,
        })
        .from(certdrillAnswerOptions)
        .where(inArray(certdrillAnswerOptions.questionId, questionIds))
        .orderBy(
          asc(certdrillAnswerOptions.questionId),
          asc(certdrillAnswerOptions.sortOrder),
          asc(certdrillAnswerOptions.id),
        );
    },

    async listFilterOptions() {
      const [certifications, categories] = await Promise.all([
        db
          .select({
            id: certdrillCertifications.id,
            code: certdrillCertifications.code,
            name: certdrillCertifications.name,
          })
          .from(certdrillCertifications)
          .orderBy(asc(certdrillCertifications.code), asc(certdrillCertifications.name)),
        db
          .select({
            id: certdrillExamCategories.id,
            certificationId: certdrillExamCategories.certificationId,
            code: certdrillExamCategories.code,
            name: certdrillExamCategories.name,
          })
          .from(certdrillExamCategories)
          .orderBy(asc(certdrillExamCategories.code), asc(certdrillExamCategories.name)),
      ]);
      return { certifications, categories };
    },
  };
}
```

`listAdminQuestionIndex` validates category/certification compatibility before
calling `count` or `listRows`: when both IDs are present and the selected
category belongs to a different certification, omit `categoryId` from the
effective repository query.

- [ ] **Step 5: Run the focused test**

Run:

```bash
bun run --cwd apps/api test tests/modules/certdrill/admin-question-index.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the API query unit**

```bash
git add apps/api/src/modules/certdrill/admin-question-index.ts apps/api/tests/modules/certdrill/admin-question-index.test.ts
git commit -m "feat: add admin question index query"
```

---

### Task 2: Expose the question index through the admin service and route

**Files:**
- Modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/api/tests/certdrill.admin.routes.test.ts`

- [ ] **Step 1: Write the failing route delegation test**

Add `listQuestionIndex: vi.fn()` to the route-test service double and add:

```ts
it("normalizes and delegates centralized question index requests", async () => {
  service.listQuestionIndex.mockResolvedValueOnce({
    items: [],
    certifications: [],
    categories: [],
    page: 1,
    pageCount: 1,
    pageSize: 50,
    total: 0,
  });

  const response = await createApp().request(
    `/api/admin/certdrill/questions?search=%20network%20&certificationId=${certificationId}`
      + `&categoryId=${categoryId}&status=published&difficulty=hard&sort=stem-desc&page=2`,
  );

  expect(response.status).toBe(200);
  expect(service.listQuestionIndex).toHaveBeenCalledWith({
    search: "network",
    certificationId,
    categoryId,
    status: "published",
    difficulty: "hard",
    sort: "stem-desc",
    page: "2",
  });
});
```

Add a second test proving invalid values normalize rather than returning 400:

```ts
it("normalizes invalid centralized question index query values", async () => {
  service.listQuestionIndex.mockResolvedValueOnce({ items: [], page: 1, pageCount: 1, pageSize: 50, total: 0 });

  const response = await createApp().request(
    "/api/admin/certdrill/questions?certificationId=bad&status=bad&difficulty=bad&sort=bad&page=-1",
  );

  expect(response.status).toBe(200);
  expect(service.listQuestionIndex).toHaveBeenCalledWith(expect.objectContaining({
    certificationId: undefined,
    status: undefined,
    difficulty: undefined,
    sort: "stem-asc",
    page: "1",
  }));
});
```

- [ ] **Step 2: Run the route test and verify it fails**

Run:

```bash
bun run --cwd apps/api test tests/certdrill.admin.routes.test.ts
```

Expected: FAIL because the service and route do not expose `listQuestionIndex`.

- [ ] **Step 3: Wire the service**

In `admin-service.ts`, import:

```ts
import {
  createAdminQuestionIndexRepository,
  listAdminQuestionIndex,
  type AdminQuestionIndexQueryInput,
} from "./admin-question-index";
```

Create the repository once inside `createCertDrillAdminService`:

```ts
const questionIndexRepository = createAdminQuestionIndexRepository(deps.db);

async function listQuestionIndex(input: AdminQuestionIndexQueryInput) {
  return listAdminQuestionIndex(questionIndexRepository, input);
}
```

Add `listQuestionIndex` to the returned service object.

- [ ] **Step 4: Wire the route without shadowing question creation**

In `routes.ts`, import `normalizeAdminQuestionIndexQuery` and add the GET route
before the existing `POST /questions`:

```ts
router.get("/questions", (c) => {
  const normalized = normalizeAdminQuestionIndexQuery({
    search: c.req.query("search"),
    certificationId: c.req.query("certificationId"),
    categoryId: c.req.query("categoryId"),
    status: c.req.query("status"),
    difficulty: c.req.query("difficulty"),
    sort: c.req.query("sort"),
    page: c.req.query("page"),
  });

  return withAdminAction(c, () => deps.service.listQuestionIndex({
    ...normalized,
    page: String(normalized.page),
  }));
});
```

Keep `GET /certifications/:certificationId/questions` unchanged for the
existing certification detail/editor workflows.

- [ ] **Step 5: Run route and service tests**

Run:

```bash
bun run --cwd apps/api test tests/certdrill.admin.routes.test.ts tests/modules/certdrill/admin-question-index.test.ts tests/modules/certdrill/admin-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit the endpoint**

```bash
git add apps/api/src/modules/certdrill/admin-service.ts apps/api/src/modules/certdrill/routes.ts apps/api/tests/certdrill.admin.routes.test.ts
git commit -m "feat: expose centralized admin questions API"
```

---

### Task 3: Add the admin API client and shared question action menu

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Create: `apps/admin/src/modules/certdrill/question-actions-menu.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write failing source-contract assertions**

Extend `certdrill-admin-page-copy.test.ts`:

```ts
const questionActionsSource = readFileSync(
  new URL("../../src/modules/certdrill/question-actions-menu.tsx", import.meta.url),
  "utf8",
);

it("shares question row actions across admin question tables", () => {
  expect(source).toContain('import { QuestionActionsMenu } from "./question-actions-menu";');
  expect(source).toContain("<QuestionActionsMenu");
  expect(questionActionsSource).toContain('questionStatus === "draft"');
  expect(questionActionsSource).toContain('questionStatus !== "archived"');
  expect(questionActionsSource).toContain("stopPropagation");
  expect(actionsSource).toContain('revalidatePath("/[locale]/admin/questions", "page")');
  expect(actionsSource).toContain('revalidatePath("/admin/questions")');
});
```

- [ ] **Step 2: Run the focused admin test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because the shared menu does not exist.

- [ ] **Step 3: Add typed question-index API client contracts**

In `certdrill.server.ts`, add:

```ts
export type CertDrillAdminQuestionIndexQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: "draft" | "published" | "archived";
  difficulty?: CertDrillDifficulty;
  sort?: "stem-asc" | "stem-desc";
  page?: number;
};

export type CertDrillAdminQuestionIndexItem = {
  id: string;
  certificationId: string;
  certificationCode: string;
  certificationName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  stem: string;
  status: "draft" | "published" | "archived";
  difficulty: CertDrillDifficulty;
  options: Array<{
    id: string;
    questionId: string;
    text: string;
    isCorrect: boolean;
    explanation: string;
    sortOrder: number;
  }>;
};

export type CertDrillAdminQuestionIndexResult = {
  items: CertDrillAdminQuestionIndexItem[];
  certifications: Array<{ id: string; code: string; name: string }>;
  categories: Array<{ id: string; certificationId: string; code: string; name: string }>;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

export async function listCertDrillAdminQuestionIndexServer(
  query: CertDrillAdminQuestionIndexQuery,
): Promise<CertDrillAdminQuestionIndexResult> {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") searchParams.set(key, String(value));
  }
  return certdrillAdminRequest<CertDrillAdminQuestionIndexResult>(
    `/questions?${searchParams.toString()}`,
  );
}
```

- [ ] **Step 4: Extract the shared action menu**

Create `question-actions-menu.tsx` as a client component with:

```tsx
"use client";

import { MoreHorizontal } from "lucide-react";
import type { MouseEvent, ReactElement } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function QuestionActionsMenu({
  questionId,
  questionStatus,
  editLink,
  publishAction,
  archiveAction,
}: {
  questionId: string;
  questionStatus: "draft" | "published" | "archived";
  editLink: ReactElement;
  publishAction: (formData: FormData) => void | Promise<void>;
  archiveAction: (formData: FormData) => void | Promise<void>;
}) {
  function stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  return (
    <div onClick={stopPropagation}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Actions for ${questionId}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>{editLink}</DropdownMenuItem>
          {questionStatus !== "archived" ? <DropdownMenuSeparator /> : null}
          {questionStatus === "draft" ? (
            <DropdownMenuItem asChild>
              <button type="submit" form={`publish-question-${questionId}`}>Publish</button>
            </DropdownMenuItem>
          ) : null}
          {questionStatus !== "archived" ? (
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" form={`archive-question-${questionId}`}>Archive</button>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {questionStatus === "draft" ? (
        <form id={`publish-question-${questionId}`} action={publishAction}>
          <input type="hidden" name="questionId" value={questionId} />
        </form>
      ) : null}
      {questionStatus !== "archived" ? (
        <form id={`archive-question-${questionId}`} action={archiveAction}>
          <input type="hidden" name="questionId" value={questionId} />
        </form>
      ) : null}
    </div>
  );
}
```

Replace the existing inline dropdown/forms in `QuestionTable` with
`QuestionActionsMenu`, passing the existing localized Edit link.

- [ ] **Step 5: Revalidate the centralized page after mutations**

Extend `revalidateCertDrillAdminPage()`:

```ts
function revalidateCertDrillAdminPage() {
  revalidatePath("/[locale]/admin/certdrill", "page");
  revalidatePath("/admin/certdrill");
  revalidatePath("/[locale]/admin/questions", "page");
  revalidatePath("/admin/questions");
}
```

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts
bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the shared admin primitives**

```bash
git add apps/admin/src/lib/api/certdrill.server.ts apps/admin/src/modules/certdrill/question-actions-menu.tsx apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/src/modules/certdrill/admin-actions.ts apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "refactor: share admin question row actions"
```

---

### Task 4: Add centralized query-state helpers and filter bar

**Files:**
- Create: `apps/admin/src/modules/certdrill/questions-index-query.ts`
- Create: `apps/admin/src/modules/certdrill/questions-index-filter-bar.tsx`
- Create: `apps/admin/tests/modules/certdrill/questions-index-query.test.ts`

- [ ] **Step 1: Write failing query-state tests**

```ts
import { describe, expect, it } from "vitest";

import {
  buildQuestionsIndexQuery,
  normalizeQuestionsIndexSearchParams,
} from "../../../src/modules/certdrill/questions-index-query";

describe("questions index query state", () => {
  it("normalizes arrays, unsupported values, and invalid pages", () => {
    expect(normalizeQuestionsIndexSearchParams({
      search: ["network", "ignored"],
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "bad",
      difficulty: "hard",
      sort: "stem-desc",
      page: "-1",
    })).toEqual({
      search: "network",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: undefined,
      difficulty: "hard",
      sort: "stem-desc",
      page: 1,
    });
  });

  it("resets the page and incompatible category when certification changes", () => {
    expect(buildQuestionsIndexQuery({
      search: "network",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: 3,
    }, {
      certificationId: "cert-2",
      validCategoryIds: ["category-2"],
    })).toEqual({
      search: "network",
      certificationId: "cert-2",
      categoryId: undefined,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: undefined,
    });
  });
});
```

- [ ] **Step 2: Run the query-state test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/modules/certdrill/questions-index-query.test.ts
```

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement pure URL-state helpers**

Create:

```ts
export type QuestionsIndexSearchParam = string | string[] | undefined;

export type QuestionsIndexQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: "draft" | "published" | "archived";
  difficulty?: "easy" | "medium" | "hard";
  sort: "stem-asc" | "stem-desc";
  page: number;
};

export type QuestionsIndexUrlQuery = Omit<QuestionsIndexQuery, "page"> & {
  page?: number;
};

function first(value: QuestionsIndexSearchParam) {
  return Array.isArray(value) ? value[0] : value;
}

export function normalizeQuestionsIndexSearchParams(
  params: Record<string, QuestionsIndexSearchParam>,
): QuestionsIndexQuery {
  const status = first(params.status);
  const difficulty = first(params.difficulty);
  const page = Number(first(params.page));
  return {
    search: first(params.search)?.trim() || undefined,
    certificationId: first(params.certificationId)?.trim() || undefined,
    categoryId: first(params.categoryId)?.trim() || undefined,
    status: status === "draft" || status === "published" || status === "archived" ? status : undefined,
    difficulty: difficulty === "easy" || difficulty === "medium" || difficulty === "hard" ? difficulty : undefined,
    sort: first(params.sort) === "stem-desc" ? "stem-desc" : "stem-asc",
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

export function buildQuestionsIndexQuery(
  current: QuestionsIndexQuery,
  change: Partial<QuestionsIndexQuery> & { validCategoryIds?: string[] },
): QuestionsIndexUrlQuery {
  const { validCategoryIds, ...queryChange } = change;
  const certificationChanged = change.certificationId !== undefined
      && change.certificationId !== current.certificationId;
  const nextCategoryId = certificationChanged
      && current.categoryId
      && !validCategoryIds?.includes(current.categoryId)
        ? undefined
      : change.categoryId ?? current.categoryId;

  return {
      ...current,
      ...queryChange,
      categoryId: nextCategoryId,
      page: undefined,
  };
}

export function questionsIndexHref(
  query: Partial<QuestionsIndexUrlQuery>,
  pathname = "/admin/questions",
) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const search = params.toString();
  return search ? `${pathname}?${search}` : pathname;
}
```

Use an explicit return type for `buildQuestionsIndexQuery` so
`validCategoryIds` cannot leak into the returned object.

- [ ] **Step 4: Implement the URL-backed filter bar**

Create a client component that accepts normalized filters plus certification
and category options. Reuse the race-protected 250 ms debounce pattern from
`question-filter-bar.tsx`, but use centralized parameter names:

```tsx
<Input id="questions-index-search" value={search} />
<select id="questions-index-certification" value={filters.certificationId ?? ""} />
<select id="questions-index-category" value={filters.categoryId ?? ""} />
<select id="questions-index-status" value={filters.status ?? ""} />
<select id="questions-index-difficulty" value={filters.difficulty ?? ""} />
<Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button>
```

Requirements:

- Certification changes calculate valid category IDs for the selected
  certification and remove an incompatible category.
- Category options show all categories when no certification is selected and
  only matching categories otherwise.
- Every immediate filter change deletes `page`.
- Debounced search updates after 250 ms and deletes `page`.
- Clearing filters removes `search`, `certificationId`, `categoryId`, `status`,
  `difficulty`, `sort`, and `page`.
- `router.replace(..., { scroll: false })` preserves unrelated query parameters.

- [ ] **Step 5: Run the focused tests**

Run:

```bash
bun run --cwd apps/admin test tests/modules/certdrill/questions-index-query.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit query state and filters**

```bash
git add apps/admin/src/modules/certdrill/questions-index-query.ts apps/admin/src/modules/certdrill/questions-index-filter-bar.tsx apps/admin/tests/modules/certdrill/questions-index-query.test.ts
git commit -m "feat: add centralized question filters"
```

---

### Task 5: Build the expandable centralized table

**Files:**
- Create: `apps/admin/src/modules/certdrill/questions-index-table.tsx`
- Create: `apps/admin/tests/components/certdrill-questions-index.test.ts`

- [ ] **Step 1: Write failing component-contract tests**

Use the repository's existing source-contract style:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const tableSource = readFileSync(
  new URL("../../src/modules/certdrill/questions-index-table.tsx", import.meta.url),
  "utf8",
);

describe("centralized questions index", () => {
  it("renders cross-certification columns and inline answer expansion", () => {
    expect(tableSource).toContain('"use client"');
    expect(tableSource).toContain("Certification");
    expect(tableSource).toContain("Category");
    expect(tableSource).toContain("Question");
    expect(tableSource).toContain("Status");
    expect(tableSource).toContain("Difficulty");
    expect(tableSource).toContain("expandedQuestionId");
    expect(tableSource).toContain("option.isCorrect");
    expect(tableSource).toContain("Correct");
    expect(tableSource).toContain("option.explanation");
    expect(tableSource).not.toContain("citationUrls");
    expect(tableSource).not.toContain("mediaAssets");
  });

  it("isolates links and actions from row expansion", () => {
    expect(tableSource).toContain("event.stopPropagation()");
    expect(tableSource).toContain("<QuestionActionsMenu");
    expect(tableSource).toContain("questionEditorHref");
  });
});
```

- [ ] **Step 2: Run the component test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-questions-index.test.ts
```

Expected: FAIL because the table component does not exist.

- [ ] **Step 3: Implement the table shell and expansion state**

Create a client component with:

```tsx
"use client";

import { useState, type MouseEvent } from "react";

export function QuestionsIndexTable({
  result,
  sortHref,
  previousPageHref,
  nextPageHref,
  publishAction,
  archiveAction,
}: QuestionsIndexTableProps) {
  const [expandedQuestionId, setExpandedQuestionId] = useState<string>();

  function stopPropagation(event: MouseEvent) {
    event.stopPropagation();
  }

  function toggleQuestion(questionId: string) {
    setExpandedQuestionId((current) => current === questionId ? undefined : questionId);
  }

  // Render table and pagination below.
}
```

The table row must be keyboard accessible:

```tsx
<TableRow
  tabIndex={0}
  aria-expanded={expandedQuestionId === question.id}
  onClick={() => toggleQuestion(question.id)}
  onKeyDown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleQuestion(question.id);
    }
  }}
  className="cursor-pointer"
>
```

- [ ] **Step 4: Render columns, shared actions, and expanded answers**

Use certification and category code/name in their cells. Render the editor link:

```tsx
<LocalizedLink
  href={questionEditorHref(question.certificationId, question.id)}
  onClick={stopPropagation}
  className="hover:underline"
>
  {question.stem}
</LocalizedLink>
```

Render the shared action menu:

```tsx
<QuestionActionsMenu
  questionId={question.id}
  questionStatus={question.status}
  editLink={(
    <LocalizedLink href={questionEditorHref(question.certificationId, question.id)}>
      Edit
    </LocalizedLink>
  )}
  publishAction={publishAction}
  archiveAction={archiveAction}
/>
```

Immediately after an expanded question row, render:

```tsx
<TableRow>
  <TableCell colSpan={6} className="bg-muted/30 p-4">
    <div className="space-y-3">
      {question.options.map((option) => (
        <div
          key={option.id}
          className={option.isCorrect
            ? "rounded-md border border-green-500/40 bg-green-500/10 p-3"
            : "rounded-md border p-3"}
        >
          <div className="flex items-start gap-2">
            <Badge variant={option.isCorrect ? "default" : "outline"}>
              {option.isCorrect ? "Correct" : "Incorrect"}
            </Badge>
            <span>{option.text}</span>
          </div>
          {option.explanation ? (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="font-medium text-foreground">Explanation:</span>{" "}
              {option.explanation}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  </TableCell>
</TableRow>
```

If a question has no options, render `No answer options.` in the expanded row.

- [ ] **Step 5: Add sorting and pagination controls**

The Question table header carries sort state and contains a localized link:

```tsx
<TableHead aria-sort={result.sort === "stem-desc" ? "descending" : "ascending"}>
  <LocalizedLink href={sortHref}>
    Question {result.sort === "stem-desc" ? "↓" : "↑"}
  </LocalizedLink>
</TableHead>
```

Show `Showing X-Y of N questions`, `Page X of Y`, and Previous/Next buttons.
Disable boundary buttons rather than linking to invalid pages.

- [ ] **Step 6: Run focused tests and typecheck**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-questions-index.test.ts
bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit the expandable table**

```bash
git add apps/admin/src/modules/certdrill/questions-index-table.tsx apps/admin/tests/components/certdrill-questions-index.test.ts
git commit -m "feat: add expandable admin questions table"
```

---

### Task 6: Assemble the server page and route

**Files:**
- Create: `apps/admin/src/modules/certdrill/questions-index-page.tsx`
- Create: `apps/admin/src/app/[locale]/(backend)/(admin)/admin/questions/page.tsx`
- Modify: `apps/admin/tests/components/certdrill-questions-index.test.ts`

- [ ] **Step 1: Add failing route/page wiring assertions**

Extend the component test:

```ts
const pageSource = readFileSync(
  new URL("../../src/modules/certdrill/questions-index-page.tsx", import.meta.url),
  "utf8",
);
const routeSource = readFileSync(
  new URL("../../src/app/[locale]/(backend)/(admin)/admin/questions/page.tsx", import.meta.url),
  "utf8",
);

it("fetches and renders the centralized server-backed index", () => {
  expect(routeSource).toContain("normalizeQuestionsIndexSearchParams");
  expect(routeSource).toContain("<QuestionsIndexPage");
  expect(pageSource).toContain("listCertDrillAdminQuestionIndexServer");
  expect(pageSource).toContain("<QuestionsIndexFilterBar");
  expect(pageSource).toContain("<QuestionsIndexTable");
  expect(pageSource).toContain("No questions match the current filters.");
  expect(pageSource).not.toContain("Create question");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-questions-index.test.ts
```

Expected: FAIL because the page files do not exist.

- [ ] **Step 3: Implement the App Router entry point**

Create:

```tsx
import { Container } from "@/components/ui/container";
import { QuestionsIndexPage } from "@/modules/certdrill/questions-index-page";
import { normalizeQuestionsIndexSearchParams, type QuestionsIndexSearchParam } from "@/modules/certdrill/questions-index-query";

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, QuestionsIndexSearchParam>>;
}) {
  const filters = normalizeQuestionsIndexSearchParams(await searchParams);

  return (
    <Container className="py-6">
      <QuestionsIndexPage filters={filters} />
    </Container>
  );
}
```

- [ ] **Step 4: Implement the server composition component**

`QuestionsIndexPage` must:

1. Call `listCertDrillAdminQuestionIndexServer(filters)`.
2. Remove an incompatible category from the display filters if the API result
   does not include it for the selected certification.
3. Build the next stem sort URL with `page` omitted.
4. Build Previous/Next URLs preserving all filters.
5. Render heading copy, filter bar, empty state, or table.

Core structure:

```tsx
export async function QuestionsIndexPage({ filters }: { filters: QuestionsIndexQuery }) {
  const result = await listCertDrillAdminQuestionIndexServer(filters);
  const categoryIsCompatible = !filters.categoryId
    || result.categories.some((category) => (
      category.id === filters.categoryId
      && (!filters.certificationId || category.certificationId === filters.certificationId)
    ));
  const effectiveFilters = categoryIsCompatible
    ? filters
    : { ...filters, categoryId: undefined };
  const sort = filters.sort === "stem-desc" ? "stem-desc" : "stem-asc";
  const nextSort = sort === "stem-desc" ? "stem-asc" : "stem-desc";

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Centralized question management</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Questions</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search and manage questions across every certification and category.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Question bank</CardTitle>
          <CardDescription>
            Click a row to review answer options and explanations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <QuestionsIndexFilterBar
            filters={effectiveFilters}
            certifications={result.certifications}
            categories={result.categories}
          />
          {result.items.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              No questions match the current filters.
            </div>
          ) : (
            <QuestionsIndexTable
              result={{ ...result, sort }}
              sortHref={questionsIndexHref({ ...effectiveFilters, sort: nextSort, page: undefined })}
              previousPageHref={result.page > 1
                ? questionsIndexHref({ ...effectiveFilters, page: result.page - 1 })
                : undefined}
              nextPageHref={result.page < result.pageCount
                ? questionsIndexHref({ ...effectiveFilters, page: result.page + 1 })
                : undefined}
              publishAction={publishCertDrillQuestionAction}
              archiveAction={archiveCertDrillQuestionAction}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Run page tests and typecheck**

Run:

```bash
bun run --cwd apps/admin test tests/components/certdrill-questions-index.test.ts tests/modules/certdrill/questions-index-query.test.ts
bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the route**

```bash
git add apps/admin/src/modules/certdrill/questions-index-page.tsx apps/admin/src/app/[locale]/\\(backend\\)/\\(admin\\)/admin/questions/page.tsx apps/admin/tests/components/certdrill-questions-index.test.ts
git commit -m "feat: add centralized admin questions route"
```

---

### Task 7: Add sidebar navigation and translations

**Files:**
- Modify: `apps/admin/src/config/backend-navbar-admin.tsx`
- Modify: `apps/admin/src/messages/en.json`
- Modify: `apps/admin/src/messages/fr.json`
- Modify: `apps/admin/src/messages/nl.json`
- Modify: `apps/admin/tests/config/certdrill-admin-nav.test.ts`

- [ ] **Step 1: Write the failing navigation test**

Extend the test:

```ts
it("contains centralized Questions admin link", () => {
  expect(BackendNavAdminItems).toEqual(expect.arrayContaining([
    expect.objectContaining({ title: "admin.nav.questions", url: "/admin/questions" }),
  ]));
});
```

Also read all three message files and assert each contains:

```ts
expect(messages.admin.nav.questions).toBeTruthy();
```

- [ ] **Step 2: Run the navigation test and verify it fails**

Run:

```bash
bun run --cwd apps/admin test tests/config/certdrill-admin-nav.test.ts
```

Expected: FAIL because the sidebar item and translation keys are missing.

- [ ] **Step 3: Add the sidebar item**

Import `ListTodo` from `lucide-react` and add immediately after CertDrill:

```ts
{
  title: "admin.nav.questions",
  url: "/admin/questions",
  icon: ListTodo,
},
```

- [ ] **Step 4: Add translations**

Add:

```json
"questions": "Questions"
```

to `admin.nav` in `en.json` and `nl.json`, and:

```json
"questions": "Questions"
```

to `admin.nav` in `fr.json`.

- [ ] **Step 5: Run navigation and message parity tests**

Run:

```bash
bun run --cwd apps/admin test tests/config/certdrill-admin-nav.test.ts tests/messages-parity.test.ts tests/messages-copy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit navigation**

```bash
git add apps/admin/src/config/backend-navbar-admin.tsx apps/admin/src/messages/en.json apps/admin/src/messages/fr.json apps/admin/src/messages/nl.json apps/admin/tests/config/certdrill-admin-nav.test.ts
git commit -m "feat: add admin questions navigation"
```

---

### Task 8: Verify the complete feature

**Files:**
- Review: `docs/superpowers/specs/2026-08-03-admin-questions-centralized-index-design.md`
- Review all files changed in Tasks 1-7.

- [ ] **Step 1: Run focused API tests**

```bash
bun run --cwd apps/api test tests/modules/certdrill/admin-question-index.test.ts tests/modules/certdrill/admin-service.test.ts tests/certdrill.admin.routes.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused admin tests**

```bash
bun run --cwd apps/admin test tests/components/certdrill-admin-page-copy.test.ts tests/components/certdrill-questions-index.test.ts tests/modules/certdrill/questions-index-query.test.ts tests/config/certdrill-admin-nav.test.ts tests/messages-parity.test.ts tests/messages-copy.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typechecks**

```bash
bun run --cwd apps/api typecheck
bun run --cwd apps/admin typecheck
```

Expected: PASS.

- [ ] **Step 4: Run admin lint**

```bash
bun run --cwd apps/admin lint
```

Expected: PASS with no new errors.

- [ ] **Step 5: Review the final diff against the specification**

Run:

```bash
git --no-pager diff --check
git --no-pager diff --stat
git --no-pager status --short
```

Confirm:

- `/admin/questions` is linked in the sidebar.
- The API returns only one 50-row page plus answer options for that page.
- Search includes certifications, categories, questions, answers, and explanations.
- Certification changes clear incompatible categories.
- Sort/filter changes reset pagination.
- Row expansion is mouse- and keyboard-accessible.
- Correct answers and explanations are visible inline.
- Edit, Publish, and Archive rules match the existing table.
- Mutations revalidate both centralized and certification-specific routes.
- No Create question control, citations, or media metadata were added.

- [ ] **Step 6: Commit any final test-only corrections**

If verification required corrections, stage only the files changed for those
corrections, inspect the staged diff with `git --no-pager diff --cached`, and
commit them with:

```bash
git commit -m "test: cover centralized admin questions index"
```
