# CertDrill — Certification Practice Exam Platform
## Coding-Agent Build Brief (v3)

> **Start here:** Clone the boilerplate at
> `https://github.com/wiwa1978/Boilerplate-SingleTenant-Hono` and build
> CertDrill on top of it. Do **not** re-scaffold auth, billing, email, the
> monorepo layout, or the database plumbing — they are already production-ready.
> Every section below says exactly what to reuse vs. what to add.
> In case you cannot clone the repo for some reason, the boilerplate is also mirrored at
> /home/wim/Code/Repositories/Repositories/Personal/Boilerplate-SingleTenant-Hono

---

## 1. What we're building

A SaaS platform for certification practice exams. Initial target certs:
**GH-900, AZ-104, AI-200, AWS SAA-C03**. The system must be
certification-agnostic: adding a new exam or a new vendor is purely a data
operation, never a code change.

**Two sides:**

- **Admin app** (`apps/admin`) — curate a library of source "learn resources"
  per certification, generate question banks from them via an async LLM
  pipeline, then review / edit / publish questions before they reach end users.
- **User app** (`apps/web`) — pick a certification, sit a practice exam,
  submit, get a score, and review every question with explanations for both
  correct and incorrect options, plus evidence links to source documents/URLs.

**Operating principle:** once an admin provides an exam blueprint URL, the
platform should support a **full handoff/autopilot run** where the backend does
the heavy lifting independently (parse blueprint → build category tree → gather
and ingest resources → generate draft questions), while the admin only reviews
and publishes.

**Two features that elevate this beyond a flat question bank:**

- **Blueprint-aware categories** — every certification has an official exam
  blueprint (domains / tasks / skills, each with a published weight %).
  Questions are linked to these categories so users can drill one section at a
  time, and the platform can build a full practice exam that mirrors the real
  exam's weighting.
- **Multiple test-taking modes** — instant-feedback practice mode and
  scored-at-the-end exam simulation mode, combined independently with either
  category-focus or full blueprint-weighted random question selection (details
  in Section 8).

**User-facing visual style:** the exam flow must match the reference HTML
artifact `saa_c03_domain1_drill.html` exactly — see Section 9 for pixel-level
implementation details extracted from that file.

---

## 2. Boilerplate — what's already built, what to add

The boilerplate at `https://github.com/wiwa1978/Boilerplate-SingleTenant-Hono`
is a Bun monorepo:

```
apps/
  api/        Hono API — port 8787  (Bun runtime, @hono/node-server)
  web/        Next.js 16 user app   — port 3100
  admin/      Next.js 16 admin app  — port 3101
packages/
  auth-core/        BetterAuth server runtime + middleware  ← DO NOT TOUCH
  auth-client/      BetterAuth browser helpers              ← DO NOT TOUCH
  auth-shared/      Roles, session types                    ← DO NOT TOUCH
  contracts/        Shared API wire types                   ← ADD CertDrill types here
  email-core/       Resend email abstraction                ← DO NOT TOUCH
  payments-core/    Dodo Payments abstraction               ← NOT needed for MVP
  platform-db/      Drizzle schema + migrations             ← ADD tables here
  frontend-shared/  API/query/session helpers               ← reuse in new pages
```

### What NOT to build
| Topic | Already provided |
|---|---|
| Monorepo scaffold | ✅ Bun workspaces, `concurrently` dev runner |
| Auth (login / register / sessions / roles) | ✅ BetterAuth; `admin` and `user` roles exist |
| User table | ✅ BetterAuth manages `user` table; reference by `user.id` (UUID) |
| Transactional email | ✅ `packages/email-core` + Resend |
| Billing / subscriptions | ✅ Dodo Payments wired; ignore for MVP |
| Azure Container Apps deployment | ✅ Bicep + GitHub Actions in `infra/` |
| DB connection + Drizzle config | ✅ `packages/platform-db` |

### What TO build
- CertDrill Drizzle tables in `packages/platform-db/src/schema/certdrill.ts`
- CertDrill API routes in `apps/api/src/routes/`
- Queue-provider abstraction + adapters for Inngest (default) and pg-boss (fallback)
- CertDrill shared types in `packages/contracts/src/certdrill.ts`
- Admin pages in `apps/admin/src/app/`
- User exam pages in `apps/web/src/app/`

### Tech stack additions

| What | How |
|---|---|
| LLM calls | Azure AI Foundry via `@azure-rest/ai-inference` — add to `apps/api/package.json` |
| Background jobs | Use a provider abstraction. **Default provider: Inngest** (best run visibility/debug UI). **Fallback provider: pg-boss** (Postgres-only runtime). Keep both adapters behind one interface so switching providers does not require API/UI rewrites. |
| Frontend | **Next.js 16 App Router** (already in place). Not React + Vite. |
| Components | shadcn/ui + Tailwind CSS v4 (already installed in both Next.js apps) |
| API docs | `@hono/zod-openapi` on all new routes → auto-visible at `/api/docs` |
| OAuth | GitHub + Google (pre-wired). Microsoft OAuth is not configured in the boilerplate. |

### Boilerplate-extension architecture (critical)

This project must be implemented as a **namespaced feature module** on top of
the boilerplate, not as scattered edits across core boilerplate files.

Goal: keep CertDrill easy to carry forward whenever the base/reference
boilerplate repository is updated.

Required structure:

```
apps/api/src/modules/certdrill/*
apps/admin/src/modules/certdrill/*
apps/web/src/modules/certdrill/*
packages/contracts/src/certdrill/*
packages/platform-db/src/schema/certdrill.ts
```

Rules:
- Put all CertDrill routes under a dedicated API namespace:
  `/api/certdrill/*` and `/api/admin/certdrill/*` (or equivalent router mount).
- Keep CertDrill UI pages/components in module folders (`modules/certdrill`)
  and import them into route files, instead of mixing logic into shared
  boilerplate dashboard pages.
- Use a single feature-flag switch (e.g. `FEATURE_CERTDRILL_ENABLED=true`) so
  the module can be enabled/disabled without touching core auth/billing/email.
- Avoid modifying boilerplate core packages unless absolutely required; when
  required, use small adapter seams (interfaces/factories) rather than direct
  feature-specific coupling.

Upgrade-safe integration pattern:
- Treat the boilerplate as upstream.
- Keep CertDrill as a layered module branch/folder set.
- On boilerplate updates, merge/rebase upstream first, then resolve only
  module mount points (router registration, nav links, feature flags).
- Do not fork or rewrite existing auth/billing/email flows; consume them
  through existing package APIs.

### New env vars (append to `apps/api/.env.example`)

```env
# Azure AI Foundry
AZURE_AI_FOUNDRY_ENDPOINT=https://<your-project>.services.ai.azure.com/models
AZURE_AI_FOUNDRY_KEY=<api-key>
# Default model slug — must match a model deployed in your Foundry project
AZURE_AI_FOUNDRY_DEFAULT_MODEL=gpt-4o

# Queue provider selection
QUEUE_PROVIDER=inngest               # inngest | pgboss

# Inngest (default provider)
INNGEST_EVENT_KEY=<event-key>
INNGEST_SIGNING_KEY=<signing-key>
INNGEST_BASE_URL=http://localhost:8787
```

---

## 3. LLM provider — Azure AI Foundry

All question generation uses **Azure AI Foundry** (Azure AI Model Inference
API). This gives a single endpoint that can serve GPT-4o, GPT-4.1, Phi-4,
Mistral, Llama, and any other model deployed in the same Foundry project —
making model selection a configuration choice, not a code change.

### SDK and client setup

```ts
// apps/api/src/lib/foundry.ts
import ModelClient, { isUnexpected } from "@azure-rest/ai-inference";
import { AzureKeyCredential } from "@azure/core-auth";

export function createFoundryClient() {
  return ModelClient(
    process.env.AZURE_AI_FOUNDRY_ENDPOINT!,
    new AzureKeyCredential(process.env.AZURE_AI_FOUNDRY_KEY!)
  );
}
```

### Model selection

The admin chooses a model slug when creating a generation job (see Section 6,
"Generate" tab). The slug is stored in `QuestionGenerationJob.model_used` and
passed at runtime to the Foundry client:

```ts
const response = await client.path("/chat/completions").post({
  body: {
    model: job.model_used,          // e.g. "gpt-4o", "phi-4", "mistral-large"
    messages: [...],
    response_format: { type: "json_object" },
    temperature: 0.7,
    max_tokens: 4000,
  },
});
if (isUnexpected(response)) throw new Error(response.body.error.message);
```

The available model list is **not stored in the database**. Maintain it as a
typed constant in the API:

```ts
// apps/api/src/lib/foundry-models.ts
export const FOUNDRY_MODELS = [
  { slug: "gpt-4o",          label: "GPT-4o",           tier: "premium" },
  { slug: "gpt-4.1",         label: "GPT-4.1",          tier: "premium" },
  { slug: "phi-4",           label: "Phi-4",            tier: "standard" },
  { slug: "mistral-large",   label: "Mistral Large",    tier: "standard" },
] as const;

export type FoundryModelSlug = typeof FOUNDRY_MODELS[number]["slug"];
```

Expose this list via `GET /admin/llm-models` so the admin UI can populate the
model selector without hardcoding.

### Response format

Use `response_format: { type: "json_object" }` and instruct the model to
return a JSON object with a `questions` array key. This is universally
supported across all Foundry-hosted models and avoids markdown fences. Parse
`JSON.parse(response.body.choices[0].message.content)` then extract
`.questions`.

### Queue orchestration strategy (Inngest-first, migration-safe)

Use a provider abstraction now so the product can start on Inngest for
observability and later move to pg-boss without changing business logic or UI.

```ts
// apps/api/src/jobs/provider.ts
export type QueueProviderName = "inngest" | "pgboss";

export interface EnqueueGenerationJobInput {
  jobId: string;
}

export interface EnqueueGenerationJobResult {
  provider: QueueProviderName;
  providerRunId: string;
  providerRunUrl?: string;
}

export interface JobQueueProvider {
  enqueueGenerationJob(input: EnqueueGenerationJobInput): Promise<EnqueueGenerationJobResult>;
  cancelGenerationJob?(providerRunId: string): Promise<void>;
}
```

Implementation plan:
- `InngestQueueProvider` (default): emits an Inngest event and stores
  `provider='inngest'`, `provider_run_id`, `provider_run_url`.
- `PgBossQueueProvider` (fallback): enqueues pg-boss and stores
  `provider='pgboss'`, `provider_run_id` (pg-boss id), no run URL.
- `QUEUE_PROVIDER` env var selects adapter at runtime.
- `runGenerationJob(jobId)` contains all generation logic and is shared by both
  adapters.

---

## 4. Admin workflow — end-to-end walkthrough

This section describes exactly what an admin does to go from zero to a
publishable question bank. Implement the UI in Section 6 to match this flow.

### Step 1 — Create a certification

Admin navigates to `/admin/certifications/new` and fills in:
- Code (`AWS-SAA-C03`)
- Full name (`AWS Certified Solutions Architect – Associate`)
- Vendor (`AWS`)
- Default question count (e.g. `55`)
- Pass threshold % (e.g. `72`)
- Short description (optional)

Save → certification created, redirect to certification detail page.

### Step 2 — Build the exam blueprint (category tree)

On the **Blueprint** tab of the certification detail page, the default path is:
**paste the official exam-blueprint URL and let the backend parse it** into a
draft category tree. Manual editing stays available as a fallback.

**Example for AWS SAA-C03:**
```
Domain 1 · Design Secure Architectures          (30%)
  Task 1.1 · Design secure access to AWS resources
  Task 1.2 · Design secure workloads and applications
  Task 1.3 · Determine appropriate data security controls
Domain 2 · Design Resilient Architectures       (26%)
  Task 2.1 · Design scalable and loosely coupled architectures
  ...
```

Flow:
1. Admin pastes blueprint URL (e.g. AWS exam guide page) and clicks
   **Parse blueprint**.
2. Backend fetches and parses the page, extracting a normalized tree:
   top-level domains + optional child tasks, plus any detected weights.
3. UI shows a preview diff (new domains/tasks, changed names, missing weights).
4. Admin confirms **Apply import**.
5. Backend upserts categories for that certification.

After import, the admin can fine-tune category names/order manually. The UI
always shows a running sibling-total per top-level group (e.g.
`30 + 26 + 24 + 20 = 100 ✓`). Saving with invalid totals returns HTTP 422 and
inline errors.

Weight is assigned at the **top-level domain** for most vendors. Sub-tasks
carry no `weight_pct` (null) and are used only for question targeting.

Import robustness rules:
- If weights are not found, import categories with `weight_pct = null` and flag
  \"weights missing\" in the preview.
- If parsing confidence is low (layout not recognized), return a non-fatal
  warning and allow manual editing.
- If a certification already has categories, import runs in **merge mode** by
  default (upsert by normalized `code`); include an optional \"replace all\"
  mode guarded by confirmation.

### Step 2A — Full handoff mode (autopilot)

On the same Blueprint tab, provide a **Start full handoff** action for admins
who want the system to run independently after blueprint upload.

Autopilot flow:
1. Admin provides blueprint URL and selects a handoff profile:
   - target question count per top-level domain (e.g. 40)
   - generation model strategy (single model or two-pass: fast draft + quality pass)
   - queue provider (default Inngest)
2. Backend parses/imports the blueprint tree.
3. Backend auto-discovers candidate resources per category (official docs first:
   Microsoft Learn, AWS docs/guides, GitHub docs where relevant).
4. Backend ingests discovered resources.
5. Backend creates and enqueues generation jobs per domain/task automatically.
6. Backend tracks progress until all jobs complete or fail.
7. Admin receives a consolidated draft-review queue (no auto-publish).

Autopilot guarantees:
- **No manual resource-by-resource setup required** for first pass.
- Heavy work is asynchronous and independent; admin can leave the page.
- Final publish remains human-gated (review and approve).

### Step 3 — Add learn resources

On the **Resources** tab, the admin adds the source materials the LLM will
use to generate questions.

For each resource the admin provides:
- **URL** — the page to scrape / read (e.g. a Microsoft Learn unit or the AWS
  SAA-C03 exam guide page)
- **Title** — human label
- **Source type** — one of `module | unit | study-guide | exam-blueprint | doc`
- **Content mode** — critically important:
  - `deep_content`: this URL contains real explanatory prose. The LLM will
    ground questions directly in its specific claims.
  - `outline_blueprint`: this URL is a task/skill list (like the AWS exam
    guide's "Knowledge of:" bullets). The LLM uses it as a brief, not as
    quotable fact.
- **Category** (optional) — pin the resource to a specific domain or task so
  generation jobs scoped to that category pick it up automatically.

Bulk add: the admin can paste a newline-separated list of URLs and assign the
same `content_mode` and `source_type` to all of them at once.

### Step 4 — Ingest resources

After adding resources, the admin clicks **Ingest** per resource (or "Ingest
all pending" in bulk). The API fetches the URL, strips HTML to plain text, and
stores it in `LearnResource.raw_content`. Status changes from `pending` →
`ingested` (or `failed` with an error message).

Ingestion is synchronous in MVP (the fetch and strip happen inline on the API
request). If a page is behind auth or too large (> 100 KB of text), the admin
sees a failure status and can paste the content manually via an "Edit content"
modal.

### Step 5 — Configure and submit a generation job

On the **Generate** tab, the admin fills out the generation form:

| Field | Options |
|---|---|
| **Category** | All categories (unscoped) or pick a specific domain/task |
| **Resources** | Multi-select from ingested resources for this certification (pre-filtered by category if one is chosen) |
| **Model** | Dropdown of available Foundry models from `GET /admin/llm-models` |
| **Question count** | Integer input (e.g. `10`) |

Submit → `POST /admin/generation-jobs` → job ID returned immediately → job
appears in the live job list below the form with status `pending`.

The admin can submit multiple jobs back-to-back (e.g. one per domain) without
waiting.

### Step 6 — Monitor generation

The **Generate** tab (and the `/admin/generation-jobs` page) polls job status
every 5 seconds. Each job row shows:
- Status badge: `PENDING` / `RUNNING` / `COMPLETED` / `FAILED`
- Model used
- Queue provider + run link (when available)
- Category scoped to
- Requested vs. generated count (e.g. `10 / 10`)
- Timestamps (created, started, completed)
- Error message if `FAILED`

### Step 7 — Review and edit generated questions (draft queue)

When a job completes, the admin clicks **Review drafts** on the job row. This
opens a dedicated review screen listing all `draft` questions produced by that
job.

For each draft question the admin can:
- **Approve as-is** → marks it `published`
- **Edit then approve** → opens the question editor inline or in a modal,
  then publishes on save
- **Reject** → deletes the question

The editor allows: edit stem, reorder / edit / delete options, toggle the
correct option, edit per-option explanations, attach per-option citation URLs,
reassign category and difficulty.

After reviewing all drafts, a "Publish all approved" button bulk-publishes
any question marked approved but not yet saved.

### Step 8 — Maintain the question bank

The **Questions** tab of the certification detail page shows all questions
across all statuses with filters for status / category / difficulty / search.
The admin can bulk-publish, bulk-archive, or open individual questions for
editing at any time.

---

## 5. Data model

Add all tables to `packages/platform-db/src/schema/certdrill.ts` using
Drizzle's `pgTable`. After editing the schema:

```bash
bun run db:generate -- --name add_certdrill_tables
bun run db:check
DATABASE_URL=<url> bun run db:migrate
```

```ts
// Pseudo-schema — implement as proper Drizzle pgTable definitions

Certification
  id                    uuid PK default gen_random_uuid()
  code                  text NOT NULL UNIQUE      -- e.g. "AWS-SAA-C03"
  name                  text NOT NULL             -- e.g. "AWS Solutions Architect Associate"
  vendor                text NOT NULL             -- e.g. "AWS"
  blueprint_source_url  text NULLABLE             -- last successful blueprint import source
  description           text NULLABLE
  question_count_default integer NOT NULL         -- e.g. 55
  pass_threshold_pct    integer NOT NULL          -- 0–100, e.g. 72
  is_active             boolean NOT NULL default true
  created_at            timestamp NOT NULL default now()

ExamCategory
  id                    uuid PK default gen_random_uuid()
  certification_id      uuid NOT NULL FK → Certification.id ON DELETE CASCADE
  parent_category_id    uuid NULLABLE FK → ExamCategory.id  -- self-referencing
  code                  text NOT NULL             -- e.g. "Domain 1", "Task 1.1"
  name                  text NOT NULL             -- e.g. "Design Secure Architectures"
  weight_pct            numeric(5,2) NULLABLE     -- null on sub-tasks; set on domains
  sort_order            integer NOT NULL default 0
  -- Siblings with the same parent and non-null weight_pct must sum to 100.
  -- Enforce in API on POST/PATCH; return HTTP 422 with current total if invalid.

LearnResource
  id                    uuid PK default gen_random_uuid()
  certification_id      uuid NOT NULL FK → Certification.id ON DELETE CASCADE
  category_id           uuid NULLABLE FK → ExamCategory.id
  url                   text NOT NULL
  title                 text NOT NULL
  source_type           text NOT NULL   -- 'module' | 'unit' | 'study-guide' | 'exam-blueprint' | 'doc'
  content_mode          text NOT NULL   -- 'deep_content' | 'outline_blueprint'
  raw_content           text NULLABLE   -- populated after ingestion
  ingested_at           timestamp NULLABLE
  status                text NOT NULL default 'pending'   -- 'pending' | 'ingested' | 'failed'
  ingest_error          text NULLABLE

QuestionGenerationJob
  id                    uuid PK default gen_random_uuid()
  certification_id      uuid NOT NULL FK → Certification.id
  handoff_run_id        uuid NULLABLE FK → HandoffRun.id   -- groups jobs created by one autopilot run
  category_id           uuid NULLABLE FK → ExamCategory.id   -- null = unscoped
  resource_ids          uuid[] NOT NULL    -- application-level FK; validate before insert
  requested_count       integer NOT NULL
  provider              text NOT NULL default 'inngest'   -- 'inngest' | 'pgboss'
  provider_run_id       text NULLABLE      -- provider-specific run identifier
  provider_run_url      text NULLABLE      -- Inngest run URL when available
  status                text NOT NULL default 'pending'   -- 'pending'|'running'|'completed'|'failed'
  model_used            text NULLABLE      -- Foundry model slug, e.g. "gpt-4o"
  generated_count       integer NULLABLE
  error_message         text NULLABLE
  created_at            timestamp NOT NULL default now()
  started_at            timestamp NULLABLE
  completed_at          timestamp NULLABLE

HandoffRun
  id                    uuid PK default gen_random_uuid()
  certification_id      uuid NOT NULL FK → Certification.id ON DELETE CASCADE
  blueprint_url         text NOT NULL
  requested_by_user_id  uuid NOT NULL    -- BetterAuth user.id (admin)
  status                text NOT NULL default 'pending'   -- 'pending'|'running'|'completed'|'failed'|'cancelled'
  model_strategy        text NOT NULL    -- 'single_model' | 'two_pass'
  model_primary         text NOT NULL    -- Foundry model slug for draft pass
  model_secondary       text NULLABLE    -- optional quality-pass model
  target_questions_per_domain integer NOT NULL
  provider              text NOT NULL default 'inngest'   -- queue provider for orchestration
  provider_run_id       text NULLABLE
  provider_run_url      text NULLABLE
  progress_json         jsonb NULLABLE   -- counters, per-domain states, warnings
  error_message         text NULLABLE
  created_at            timestamp NOT NULL default now()
  started_at            timestamp NULLABLE
  completed_at          timestamp NULLABLE

Question
  id                    uuid PK default gen_random_uuid()
  certification_id      uuid NOT NULL FK → Certification.id
  category_id           uuid NOT NULL FK → ExamCategory.id   -- always required
  source_resource_id    uuid NULLABLE FK → LearnResource.id
  generation_job_id     uuid NULLABLE FK → QuestionGenerationJob.id   -- traceability
  stem                  text NOT NULL
  media_assets          jsonb NOT NULL default '[]'   -- optional images for the question stem
                                                   -- [{url,mime_type,alt_text,caption,sort_order}]
                                                   -- mime_type allowed: image/jpeg | image/png
  difficulty            text NOT NULL    -- 'easy' | 'medium' | 'hard'
  status                text NOT NULL default 'draft'   -- 'draft' | 'published' | 'archived'
  created_by            text NOT NULL    -- 'ai' | 'admin'
  created_at            timestamp NOT NULL default now()
  updated_at            timestamp NOT NULL default now()

AnswerOption
  id                    uuid PK default gen_random_uuid()
  question_id           uuid NOT NULL FK → Question.id ON DELETE CASCADE
  text                  text NOT NULL
  media_assets          jsonb NOT NULL default '[]'   -- optional images for this option
                                                   -- [{url,mime_type,alt_text,caption,sort_order}]
                                                   -- mime_type allowed: image/jpeg | image/png
  is_correct            boolean NOT NULL
  explanation           text NOT NULL   -- why this option is correct OR incorrect
  citation_urls         text[] NOT NULL default '{}'  -- evidence links for this option rationale
  sort_order            integer NOT NULL default 0
  -- Validation in API on create/update:
  -- 1) exactly one is_correct=true
  -- 2) every option must have a non-empty explanation
  -- 3) every option must have at least one citation URL
  -- 4) media_assets URLs must be jpg/png only (mime or extension check)

ExamAttempt
  id                    uuid PK default gen_random_uuid()
  user_id               uuid NOT NULL    -- references BetterAuth user.id (no DB FK)
  certification_id      uuid NOT NULL FK → Certification.id
  feedback_mode         text NOT NULL    -- 'practice' | 'exam'
  selection_mode        text NOT NULL    -- 'category_focus' | 'weighted_random'
  category_ids          uuid[] NULLABLE  -- set when selection_mode = 'category_focus'
  question_ids          uuid[] NOT NULL  -- ordered snapshot at attempt start (application-level FK)
  started_at            timestamp NOT NULL default now()
  completed_at          timestamp NULLABLE
  score_pct             numeric(5,2) NULLABLE   -- null until completed
  status                text NOT NULL default 'in_progress'   -- 'in_progress'|'completed'|'abandoned'

ExamAttemptAnswer
  id                    uuid PK default gen_random_uuid()
  exam_attempt_id       uuid NOT NULL FK → ExamAttempt.id ON DELETE CASCADE
  question_id           uuid NOT NULL    -- must be in ExamAttempt.question_ids — validate in API
  selected_option_id    uuid NOT NULL FK → AnswerOption.id
  is_correct            boolean NOT NULL
  answered_at           timestamp NOT NULL default now()
```

> **Array FK note:** `resource_ids`, `category_ids`, and `question_ids` are
> Postgres UUID arrays. The DB does not enforce referential integrity on arrays;
> validate all referenced IDs exist in the API before inserting.

---

## 6. API routes

Use `@hono/zod-openapi` for every route. Apply the existing `adminMiddleware`
from `packages/auth-core` to all `/admin/*` routes.

### Admin routes (`role = admin`)

```
# Certifications
POST   /admin/certifications
GET    /admin/certifications
GET    /admin/certifications/:id
PATCH  /admin/certifications/:id
DELETE /admin/certifications/:id

# Categories
POST   /admin/categories
  body: { certification_id, parent_category_id?, code, name, weight_pct?, sort_order? }
  → validates sibling weight sum, returns 422 if invalid
GET    /admin/categories?certification_id=
GET    /admin/categories/:id
PATCH  /admin/categories/:id
  → re-validates sibling weight sum on any change to weight_pct
DELETE /admin/categories/:id

# Blueprint URL parsing/import
POST   /admin/certifications/:id/blueprint/parse
  body: { blueprint_url: string }
  → fetches page, parses a normalized tree, returns preview only (no DB writes):
    { parsed: { domains:[...] }, warnings: string[], confidence: "high"|"medium"|"low" }
POST   /admin/certifications/:id/blueprint/import
  body: {
    blueprint_url: string,
    mode?: "merge" | "replace",
    parsed_tree?: object    # optional: pass back the preview payload to import exactly what user confirmed
  }
  → upserts categories for this certification from parsed tree
  → updates certification.blueprint_source_url
  → response: { created, updated, deleted, warnings[] }

# Full handoff (autopilot)
POST   /admin/certifications/:id/handoff/start
  body: {
    blueprint_url: string,
    mode?: "merge" | "replace",
    target_questions_per_domain: number,
    model_strategy: "single_model" | "two_pass",
    model_primary: string,
    model_secondary?: string,
    provider?: "inngest" | "pgboss"
  }
  → creates HandoffRun row and starts async orchestration
  → response: { handoff_run_id, status, provider, provider_run_id, provider_run_url? }
GET    /admin/handoff-runs?certification_id=&status=
GET    /admin/handoff-runs/:id
POST   /admin/handoff-runs/:id/cancel
  → best-effort cancellation (provider + pending jobs), status='cancelled'

# Learn resources
POST   /admin/learn-resources
  body: single { certification_id, category_id?, url, title, source_type, content_mode }
     OR array of the same shape for bulk add
GET    /admin/learn-resources?certification_id=&category_id=&status=
PATCH  /admin/learn-resources/:id
DELETE /admin/learn-resources/:id
POST   /admin/learn-resources/:id/ingest
  → fetches URL, strips to plain text, stores raw_content, sets status='ingested'
  → on failure: status='failed', ingest_error=<message>
PATCH  /admin/learn-resources/:id/content
  body: { raw_content: string }
  → manual content override (for pages behind auth or too large to fetch)

# Generation jobs
POST   /admin/generation-jobs
  body: { certification_id, category_id?, resource_ids[], model_slug, count }
  → validates resource_ids exist and are ingested; returns 422 if any are pending/failed
  → inserts QuestionGenerationJob (status=pending, model_used=model_slug)
  → enqueues via selected JobQueueProvider, returns { job_id, provider, provider_run_id, provider_run_url? } immediately
GET    /admin/generation-jobs?certification_id=&status=
GET    /admin/generation-jobs/:id
GET    /admin/generation-jobs/:id/questions
  → returns all Question rows with generation_job_id = :id (for draft review)

# Questions
GET    /admin/questions?certification_id=&category_id=&status=&difficulty=&search=
GET    /admin/questions/:id
PATCH  /admin/questions/:id
    body: { stem?, media_assets?, difficulty?, category_id?, status?, options? }
    options shape: [{ id?, text, media_assets?, is_correct, explanation, citation_urls, sort_order }]
  → replacing the options array: delete all existing AnswerOptions for this question,
    insert the new set in a transaction; validate exactly one is_correct=true,
      every option has explanation, every option has at least one citation URL,
      and all media assets are jpg/png
DELETE /admin/questions/:id
POST   /admin/questions/:id/publish
    → sets status='published'; validates all options have explanation + citation URLs,
      and media assets pass jpg/png checks
POST   /admin/questions/bulk-publish
  body: { question_ids: uuid[] }
  → publishes all listed draft questions; skips any that fail validation (report in response)
POST   /admin/questions/bulk-archive
  body: { question_ids: uuid[] }

# LLM model list (drives the model selector in the Generate tab)
GET    /admin/llm-models
  → returns FOUNDRY_MODELS constant as JSON; no DB query

# Admin analytics
GET    /admin/analytics/overview?from=&to=
  → returns KPI cards + dashboard series:
  {
    certifications_total,
    exams_attempted_total,          # completed attempts
    unique_users_attempted_total,
    published_questions_total,
    draft_questions_total,
    pass_rate_pct_overall,
    fail_rate_pct_overall,
    avg_score_pct_overall,
    attempts_time_series: [{ date, attempts_completed, unique_users, avg_score_pct }],
    pass_fail_time_series: [{ date, pass_count, fail_count }],
    certification_summary: [{
      certification_id, code, name,
      attempts_completed, unique_users,
      avg_score_pct, pass_rate_pct, fail_rate_pct,
      question_pool_published, question_pool_draft
    }]
  }
GET    /admin/analytics/certifications/:id?from=&to=
  → returns certification-level detail:
  {
    certification: { id, code, name, pass_threshold_pct },
    kpis: { attempts_completed, unique_users, avg_score_pct, pass_rate_pct, fail_rate_pct },
    score_distribution: [{ bucket: "0-9"|"10-19"|...|"90-100", count }],
    category_performance: [{ category_id, code, name, avg_score_pct, attempts_count }],
    difficulty_performance: [{ difficulty: "easy"|"medium"|"hard", correct_rate_pct, answered_count }],
    trend: [{ date, attempts_completed, avg_score_pct, pass_rate_pct }]
  }

# Optional media upload helper (if not using pre-hosted image URLs)
POST   /admin/media/upload
  body: multipart/form-data file
  → stores image and returns { url, mime_type, width, height }
  → accepts image/jpeg and image/png only
```

### User routes (`role = user`, authenticated)

```
GET    /certifications
  → only is_active=true; includes question count of published questions per cert

GET    /certifications/:id/categories
  → full tree with weight_pct; include published question count per category node

POST   /exams
  body: {
    certification_id: uuid,
    feedback_mode: 'practice' | 'exam',
    selection_mode: 'category_focus' | 'weighted_random',
    category_ids?: uuid[],     -- required when selection_mode='category_focus'
    question_count?: integer   -- used for weighted_random; ignored for category_focus
  }
  → runs selection algorithm (Section 8), inserts ExamAttempt, returns:
  {
    attempt_id: uuid,
    feedback_mode,
    questions: [{
      id, stem, category: { id, code, name },
      media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
      options: [{ id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }] }]
      -- is_correct/explanations intentionally omitted
    }],
    warnings?: string[]   -- backfill warnings from the selection algorithm
  }

POST   /exams/:id/answers
  body: { question_id: uuid, selected_option_id: uuid }
  Validations:
    - attempt exists and belongs to the authenticated user
    - attempt.status = 'in_progress'
    - question_id is in attempt.question_ids
    - selected_option_id belongs to question_id
  → inserts ExamAttemptAnswer (or updates if already answered — allow changing answer)
  → if feedback_mode='practice': returns {
      is_correct: bool,
      selected_option_feedback: {
        id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
        explanation, citation_urls: string[]
      },
      correct_option: {
        id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
        explanation, citation_urls: string[]
      }
    }
  → if feedback_mode='exam':     returns { received: true }

POST   /exams/:id/submit
  Validates: attempt in_progress; all question_ids have at least one recorded answer.
  Computes score_pct = (correct answers / total questions) × 100.
  Sets status='completed', completed_at=now(), score_pct.
  Returns:
  {
    score_pct: number,
    passed: boolean,       -- score_pct >= certification.pass_threshold_pct
    category_breakdown: [{
      category_id, code, name, correct: int, total: int, score_pct: number
    }],
    questions: [{
      question_id, stem, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
      your_option: {
        id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
        explanation, citation_urls: string[]
      },
      correct_option: {
        id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
        explanation, citation_urls: string[]
      },
      options_review: [{
        id, text, media_assets: [{ url, mime_type, alt_text, caption, sort_order }],
        is_correct, is_selected,
        explanation, citation_urls: string[]
      }],
      is_correct: boolean,
      category: { id, code, name }
    }]
  }

GET    /exams/:id/review
  → re-fetch a completed attempt's full review (same response shape as /submit)
  → returns 403 if attempt does not belong to authenticated user

GET    /users/me/attempts
  → [{
      id, certification: { id, code, name },
      feedback_mode, selection_mode,
      started_at, completed_at, score_pct, status
    }]
  → ordered by started_at DESC
```

---

## 7. Async question-generation pipeline

### A) Full-handoff orchestration (blueprint URL → draft bank)

This is the default \"heavy-lift\" mode. One action from the admin triggers the
entire backend pipeline asynchronously.

```
Admin UI
  → POST /admin/certifications/:id/handoff/start
      → create HandoffRun(status=pending)
      → queue provider starts orchestration run

Orchestrator
  1) parse/import blueprint
  2) auto-discover resources per domain/task
  3) ingest resources
  4) create QuestionGenerationJob rows per domain/task
  5) enqueue generation jobs
  6) aggregate results + warnings into HandoffRun.progress_json
  7) set HandoffRun completed/failed
```

Orchestrator behavior requirements:
- Idempotency: repeated start calls with same certification + blueprint URL
  within a short window should return the existing running handoff instead of
  duplicating work.
- Retry policy: transient fetch/LLM/network errors retry with backoff.
- Partial success: failures in one domain do not block other domains; failed
  domains are surfaced in `HandoffRun.progress_json`.
- Safety gate: never publish automatically. Output is always `draft` questions.

### B) Direct generation job path (manual)

Admins can still create individual generation jobs manually (existing Generate
tab behavior).

### Architecture overview

```
Admin UI
  → POST /admin/generation-jobs
      → insert QuestionGenerationJob (status=pending)
      → queueProvider.enqueueGenerationJob({ jobId })
      → persist provider/provider_run_id/provider_run_url
      → return { job_id, provider, provider_run_id, provider_run_url? } immediately

Queue provider worker
  → picks job off queue
  → loads job + resources + category + certification from DB
  → calls Azure AI Foundry API
  → parses JSON response
  → inserts Question + AnswerOption rows in a transaction (status=draft)
  → marks job completed / failed
```

### Provider adapters

#### A) Inngest adapter (default)

- Add `inngest` to `apps/api/package.json`.
- Define event name: `certdrill/generation.requested`.
- In `POST /admin/generation-jobs`, call:
  `inngest.send({ name: "certdrill/generation.requested", data: { jobId } })`.
- Implement an Inngest function triggered by that event, and inside it call
  `runGenerationJob(jobId)`.
- Capture and store Inngest run metadata in
  `QuestionGenerationJob.provider_run_id` and `provider_run_url`.
- In admin jobs table, expose a direct **Open run** link using
  `provider_run_url` when available.

#### B) pg-boss adapter (fallback)

- Add `pg-boss` to `apps/api/package.json`.
- Register pg-boss worker at API startup and route all job payloads to the same
  `runGenerationJob(jobId)` function.
- Store `provider='pgboss'`, `provider_run_id=<pgboss job id>`,
  `provider_run_url=null`.
- Keep UI behavior identical; only the deep observability link is unavailable.

#### C) Runtime selection

```ts
// apps/api/src/jobs/provider-factory.ts
export function createJobQueueProvider(): JobQueueProvider {
  return process.env.QUEUE_PROVIDER === "pgboss"
    ? new PgBossQueueProvider()
    : new InngestQueueProvider();
}
```

### Worker implementation (`apps/api/src/workers/generate-questions.ts`)

```
1. Load QuestionGenerationJob by jobId; return early if not found or not pending.
2. Set status='running', started_at=now(), model_used=job.model_used.
3. Load all LearnResource rows with id in job.resource_ids.
4. Load ExamCategory (if job.category_id is set) and Certification.
5. For each resource (or once if treating all as a combined corpus):
   a. Build the prompt (Section 7 prompt template).
   b. Call Azure AI Foundry with model=job.model_used, response_format=json_object.
   c. Parse response: JSON.parse(content).questions → array of raw question objects.
      d. Validate each: exactly one is_correct=true; every option has explanation;
         every option has at least one valid citation URL; any media asset is jpg/png.
      Skip invalid items and log a warning (do not fail the whole job for one bad question).
      e. Insert Question rows (status=draft, created_by='ai', generation_job_id=job.id,
      category_id=job.category_id ?? first matching category).
   f. Insert Question/AnswerOption media_assets plus AnswerOption rows in the same transaction.
6. Set status='completed', generated_count=total inserted, completed_at=now().
7. On any unrecoverable error: set status='failed', error_message=err.message.
```

### Prompt template

Send as a `user` message. The system message sets the persona. Use
`response_format: { type: "json_object" }` and instruct the model to wrap
the array in `{ "questions": [...] }` so the response is valid JSON.

**System message:**
```
You are an expert certification exam writer producing high-quality, exam-realistic
multiple-choice questions for professional IT certifications. You always respond
with valid JSON only — no prose, no markdown fences, no code blocks.
```

**User message:**
```
Certification: {certification.name} ({certification.code})
Category: {category.name} ({category.code}){IF category.weight_pct IS NOT NULL}
Blueprint weight: {category.weight_pct}%{END IF}

Source material mode: {resource.content_mode}

Instructions based on content mode:
{IF content_mode == "deep_content"}
The source below is explanatory teaching material. Ground every question tightly
in its specific claims — exact figures, exact step or phase ordering, which
subsection a capability belongs to, and any distinctions the source explicitly
draws between similar-sounding items. Prefer precise details over generic concept
checks. A candidate who read the source carefully should be at an advantage over
one who only knows the topic broadly.
{END IF}
{IF content_mode == "outline_blueprint"}
The source below is an exam-blueprint task/skill list, not explanatory prose. Do
NOT treat it as quotable fact or ground questions in its wording. Use each named
skill, service, or concept as a brief, and write a scenario-based question that
tests accurate, real-world knowledge of how it actually behaves — the kind of
applied "which combination of services solves this" question a real certification
exam asks. Draw on your knowledge of the technology, not on the source text.
{END IF}

Source content:
"""
{resource.raw_content}
"""

Write {requested_count} multiple-choice questions. Return a JSON object in this
exact shape — no other keys, no extra text:

{
  "questions": [
    {
      "stem": "<realistic scenario-based question, not a bare definition lookup>",
      "media_assets": [
        {
          "url": "<https://.../diagram.png>",
          "mime_type": "image/png" | "image/jpeg",
          "alt_text": "<short accessibility text>",
          "caption": "<optional caption>",
          "sort_order": 0
        }
      ],
      "difficulty": "easy" | "medium" | "hard",
      "category_id": "{category.id}",
      "options": [
        {
          "text": "<answer option text>",
          "media_assets": [
            {
              "url": "<https://.../option-image.jpg>",
              "mime_type": "image/png" | "image/jpeg",
              "alt_text": "<short accessibility text>",
              "caption": "<optional caption>",
              "sort_order": 0
            }
          ],
          "is_correct": true | false,
          "explanation": "<1–3 sentence explanation WHY this option is correct OR incorrect>",
          "citation_urls": ["<https://...>", "<https://... optional second link>"]
        }
      ]
    }
  ]
}

Rules:
- Each question has 4 or 5 options, exactly one with is_correct=true.
- Distractors must be plausible near-misses, not obvious filler.
- Every option must include an explanation (including incorrect options).
- Every option must include at least one citation URL that supports the rationale.
- Questions and options may include zero or more image assets (PNG/JPG only)
  when visual context is important (architecture diagram, screenshot, topology).
- Citation URLs should prefer the ingested source/resource pages for this job;
  if needed, use authoritative vendor documentation URLs.
- difficulty reflects how many candidates with solid (but not expert) knowledge
  would answer correctly: easy ≥ 80%, medium 50–79%, hard < 50%.
```

---

## 8. Question-selection algorithm (server-side, in `POST /exams`)

### Category-focus mode

1. Expand each selected `category_id` to include all descendant sub-tasks at
   any depth (recursive query or tree traversal).
2. Draw all published questions from those subtrees (no count cap — the user
   gets every available question in the chosen categories).
3. Shuffle the set (Fisher-Yates).
4. Return `question_count` from the request as informational only; do not
   cap. If the admin specified a count, use it as the target and draw
   uniformly from the subtree — or omit `question_count` entirely for
   category-focus and let the UI decide.

### Weighted-random mode

For target count **N** with top-level categories each having weight `w_i` (%):

```
1. raw_i = round(N × w_i / 100)  for each top-level category i
2. Largest-remainder fix: Σraw_i may ≠ N due to rounding. Distribute the
   remaining slots one-at-a-time to categories with the largest fractional
   part of (N × w_i / 100) until Σ = N exactly.
3. For each category i, draw raw_i published questions uniformly at random
   from its full subtree (the domain itself + all its tasks).
4. Backfill: if category i has fewer published questions than raw_i,
   take all available. Record shortfall_i = raw_i − available_i.
   Redistribute each shortfall slot proportionally to other categories
   that have surplus, largest-surplus first. Repeat until shortfall = 0
   or no surplus remains.
5. If total available questions < N after redistribution, return what's
   available and include a warning in the response.
6. Shuffle the combined set (Fisher-Yates).
```

Surface any backfill or shortage as `warnings: string[]` in the `POST /exams`
response. The user app displays these as an inline info banner on the exam
start confirmation screen.

---

## 9. Admin UI (`apps/admin`)

All pages are Next.js App Router. Apply the design tokens from Section 10 (the
same tokens as the user app, but at data-grid density rather than spacious
single-question layout). Use the stamp-box header on every admin screen.

### Page map

```
/admin                              Dashboard
/admin/certifications               Certification list
/admin/certifications/new           Create certification form
/admin/certifications/[id]          Certification detail — 4 tabs
/admin/certifications/[id]/questions/[qid]   Question editor
/admin/analytics                    Analytics dashboard (KPIs + charts)
/admin/handoff-runs                 Full-handoff runs list
/admin/handoff-runs/[id]            Full-handoff run detail (orchestration timeline + outputs)
/admin/generation-jobs              All jobs list
/admin/generation-jobs/[id]         Job detail + draft review queue
```

---

### `/admin` — Dashboard

**Stamp:** `DOC · CERTDRILL ADMIN` / `REV · —` / `SRC · INTERNAL`

**Stats row** (8 KPI cards using `--card` background):
- Active certifications
- Published questions in pool
- Draft questions awaiting review
- Completed exam attempts
- Unique users who attempted at least one exam
- Overall average score %
- Overall pass rate %
- Overall fail rate %

**Recent jobs table** — last 10 jobs across all certifications, live-polling
every 5 s (`React Query refetchInterval: 5000`):

| Status | Certification | Category | Model | Provider | Requested | Generated | Started | Actions |
|---|---|---|---|---|---|---|---|---|
| `RUNNING` badge | AWS SAA-C03 | Domain 1 | gpt-4o | inngest | 10 | — | 2 min ago | Open run |
| `COMPLETED` badge | AZ-104 | All | phi-4 | inngest | 20 | 20 | 5 min ago | Open run · Review drafts |
| `FAILED` badge | GH-900 | Task 1.1 | gpt-4o | pgboss | 5 | 0 | 10 min ago | See error |

Status badges: `PENDING` = muted, `RUNNING` = amber pulse, `COMPLETED` = green,
`FAILED` = red.

**Analytics widgets/charts block** (same dashboard page, under recent jobs):
- Date range filter: `Last 7 days` / `Last 30 days` / `Last 90 days` / custom.
- **Line chart:** attempts completed over time.
- **Line chart:** average score % over time.
- **Stacked bar chart:** pass vs fail counts over time.
- **Bar chart:** attempts per certification.
- **Bar chart:** average score per certification.
- **Donut chart:** overall pass/fail split.
- **Table:** certification performance summary:
  `certification | attempts | unique users | avg score | pass rate | fail rate | published pool`.
- Drill-through action on each certification row: `View analytics` →
  `/admin/analytics?certification_id=<id>`.

---

### `/admin/certifications` — Certification list

Table of all certifications:

| Code | Name | Vendor | Active | Published Qs | Pass % | Actions |
|---|---|---|---|---|---|---|
| AWS-SAA-C03 | AWS Solutions Architect... | AWS | ✓ | 142 | 72% | Edit · View |

"New certification" button → `/admin/certifications/new`.

---

### `/admin/analytics` — Analytics dashboard

Primary purpose: product-health and learning-outcome visibility for admins.

Top controls:
- Date range picker (presets + custom)
- Certification filter (`All` by default)
- Refresh button

KPI widgets:
- Total completed attempts
- Unique users attempted
- Average score %
- Pass rate %
- Fail rate %
- Published question pool size
- Draft question count
- Active certifications count

Charts:
- Attempts trend (line)
- Average score trend (line)
- Pass/fail trend (stacked bars)
- Score distribution histogram (0–100 buckets)
- Attempts by certification (bar)
- Average score by certification (bar)
- Pass/fail ratio (donut)
- Category performance heatmap for selected certification

Tabular drilldowns:
- Certification summary table with sortable columns.
- Per-category performance table:
  `category | attempts | avg score | pass rate | fail rate`.
- Per-difficulty table:
  `difficulty | answered | correct rate`.

Data source:
- `GET /admin/analytics/overview` for global widgets/charts.
- `GET /admin/analytics/certifications/:id` for certification deep-dive.

---

### `/admin/certifications/new` — Create form

Fields:
- Code (text, required, unique) — shows live uniqueness check
- Full name (text, required)
- Vendor (text, required)
- Default question count (integer, required)
- Pass threshold % (integer 0–100, required)
- Description (textarea, optional)
- Active (toggle, default on)

Save → redirect to `/admin/certifications/[id]` Blueprint tab.

---

### `/admin/certifications/[id]` — Certification detail (4 tabs)

Stamp: `DOC · {cert.code}` / `REV · —` / `SRC · {cert.vendor}`

**Tab 1 — Blueprint**

Top section: **Import from blueprint URL** panel (default flow).

Fields/actions:
- Blueprint URL input
- `Parse blueprint` button → calls
  `POST /admin/certifications/:id/blueprint/parse`
- Preview panel with:
  - parsed domain/task tree
  - detected weights
  - warnings (missing weights, low confidence, unknown sections)
  - confidence badge (`high` / `medium` / `low`)
- Import mode switch: `Merge (safe default)` / `Replace all`
- `Apply import` button → calls
  `POST /admin/certifications/:id/blueprint/import`
- **Start full handoff** section:
  - Target questions/domain input
  - Model strategy select: `single_model` / `two_pass`
  - Primary model select
  - Secondary model select (shown only for `two_pass`)
  - Provider select (`inngest` default, `pgboss` optional fallback)
  - `Start full handoff` button → calls
    `POST /admin/certifications/:id/handoff/start`
  - On success: redirect to `/admin/handoff-runs/[id]`

Below the import panel: tree view of all `ExamCategory` rows for this
certification (editable manually at any time).

- Each top-level domain shows as an expandable row with its code, name, and
  weight_pct input field.
- Child tasks are indented below their parent.
- A running total line appears per domain group:
  `Domains: 30 + 26 + 24 + 20 = 100 ✓` (green) or `= 105 ✗` (red).

Actions per row:
- **Add child task** — inline form appears below the domain row
- **Edit** — row expands to inline form (code, name, weight_pct, sort_order)
- **Delete** — confirm modal; blocked if the category has questions

"Add top-level domain" button at the bottom of the tree.

Saving a category POSTs/PATCHes the API; inline error shown if the API returns
422 (sibling sum invalid).

**Tab 2 — Resources**

Table of `LearnResource` rows for this certification, with filters for
`category` and `status`.

| Title | Category | Mode | Type | Status | Actions |
|---|---|---|---|---|---|
| AWS SAA Exam Guide | Domain 1 | outline_blueprint | exam-blueprint | ingested | Edit · Ingest · Delete |
| IAM Deep Dive | Task 1.1 | deep_content | unit | pending | Edit · Ingest · Delete |

Status chips: `PENDING` (muted), `INGESTED` (green), `FAILED` (red with
tooltip showing `ingest_error`).

**Add resource form** (collapsible, shown above the table):
- URL (text input)
- Title (text input)
- Source type (select: module / unit / study-guide / exam-blueprint / doc)
- Content mode (radio: `deep_content` / `outline_blueprint`)
  - Include a short description under each radio:
    - `deep_content`: "Source contains explanatory prose — questions will be
      grounded in its specific claims."
    - `outline_blueprint`: "Source is a task/skill list — the LLM uses it as
      a brief and draws on real service knowledge."
- Category (optional select — tree of domains/tasks)

**Bulk add** toggle: textarea for newline-separated URLs, with shared
`source_type` and `content_mode` selectors. Submits as array to
`POST /admin/learn-resources`.

**Ingest all pending** button: calls `POST /admin/learn-resources/:id/ingest`
sequentially for all `status=pending` resources. Progress shown inline.

"Edit content" link on any row → modal with a textarea showing `raw_content`
for manual editing (maps to `PATCH /admin/learn-resources/:id/content`).

**Tab 3 — Generate**

Generation form:

```
┌─────────────────────────────────────────────────────┐
│  Category      [All categories ▼]                   │
│  Resources     [Multi-select of ingested resources] │
│                (pre-filtered when category selected) │
│  Model         [gpt-4o — GPT-4o (premium) ▼]       │
│  Count         [10]                                  │
│                            [Submit generation job]  │
└─────────────────────────────────────────────────────┘
```

- Model dropdown populated from `GET /admin/llm-models`. Show tier label
  next to each model name (premium / standard).
- Resources multi-select shows only `status=ingested` resources. Shows
  resource title + content_mode badge.
- Validation: at least 1 resource must be selected; count must be ≥ 1.
- Submit → POST → job appears immediately in the jobs list below.

**Jobs list** (same as dashboard table, filtered to this certification,
polling every 5 s):

Clicking **Review drafts** on a completed job → `/admin/generation-jobs/[id]`.

**Tab 4 — Questions**

Full question bank table for this certification.

Filters (persistent in URL query params):
- Status: All / Draft / Published / Archived
- Category: tree select
- Difficulty: All / Easy / Medium / Hard
- Search: text search on stem

| # | Stem (truncated) | Category | Difficulty | Status | Created by | Actions |
|---|---|---|---|---|---|---|
| 1 | An SCP attached to an OU... | Task 1.1 | Hard | Published | AI | Edit · Archive |
| 2 | A Lambda role must decrypt... | Task 1.3 | Medium | Draft | AI | Edit · Publish · Delete |

**Bulk actions** (checkbox select rows):
- Bulk publish (only draft questions)
- Bulk archive (published or draft)

Clicking a row or Edit → `/admin/certifications/[id]/questions/[qid]`.

---

### `/admin/certifications/[id]/questions/[qid]` — Question editor

Two-column layout: editor on the left, live preview on the right.

**Editor (left panel):**

- Stem textarea (full width, auto-expand)
- Question media attachments (0..N images): add/remove/reorder JPG/PNG with alt text + caption
- Category select (tree, scoped to this certification)
- Difficulty select (Easy / Medium / Hard)
- Status badge + Publish / Archive button

**Answer options:**
Each option is a card with:
- Drag handle (reorder)
- Letter badge (A / B / C / D / E — auto-assigned by sort_order)
- Text textarea
- Option media attachments (0..N images): add/remove/reorder JPG/PNG with alt text + caption
- "Mark as correct" radio (only one can be selected)
- Explanation textarea (required for every option)
- Citation URLs input (chips or multiline; at least one URL required per option)
- Delete button (minimum 2 options must remain)

"Add option" button adds a blank option card at the bottom (max 5).

**Save** button: calls `PATCH /admin/questions/:id` with the full updated
options array. Shows inline success / error toast.

**Publish** button: calls `POST /admin/questions/:id/publish`. Validates
all options explanation + citation URL presence before calling; shows inline error if
missing.

**Live preview (right panel):**

Renders the question exactly as the user exam screen will show it (see Section
10 for the exact component to reuse). Updates in real time as the admin types.
Shows the correct answer highlighted (admin-only feature — the user screen does
not reveal correct answers until after submission).

---

### `/admin/generation-jobs` — All jobs list

Full job history across all certifications with filters for status and
certification. Same table as the dashboard but paginated (25 per page).

---

### `/admin/generation-jobs/[id]` — Job detail + draft review

**Top section:** job metadata (status, model, category, resources used,
requested vs. generated count, timestamps, error message if failed).

**Draft review section** (only shown when status=completed):

Each draft question is rendered as a card with:
- Question stem + options (read-only preview, same styling as user exam)
- Question/option images rendered inline where present
- Correct answer highlighted
- Per-option explanation and evidence links visible in review mode
- Difficulty badge
- Category tag
- Three action buttons: **Approve** · **Edit & Approve** · **Reject**

Approve → immediately PUTSes `POST /admin/questions/:id/publish`.
Edit & Approve → expands inline editor (same fields as the question editor
page), saves and publishes in one action.
Reject → `DELETE /admin/questions/:id` with confirm prompt.

**"Approve all remaining"** button at top → bulk-publishes all draft questions
from this job that haven't been individually rejected.

Progress indicator: `8 / 10 reviewed · 7 approved · 1 rejected`.

---

## 10. User app (`apps/web`)

The exam-taking flow must visually match the reference file
`saa_c03_domain1_drill.html`. Extract the CSS variables and component
structure from that file and implement them as a proper Next.js + Tailwind
theme. The specific classes, colors, and interaction patterns below are taken
directly from the reference HTML — do not deviate.

---

### Design tokens (from reference HTML)

Wire these as both CSS variables in `globals.css` and as Tailwind theme
extensions in `tailwind.config.ts`. Apply to **both** `apps/web` and
`apps/admin`.

```css
:root {
  /* Backgrounds */
  --background:         #0f1720;   /* page bg (--ink in reference) */
  --card:               #16212f;   /* panel bg (--panel) */
  --card-raised:        #1c293a;   /* option button bg (--panel-raised) */

  /* Borders */
  --border:             #2a3b57;   /* (--hairline) */

  /* Accent */
  --primary:            #e8a33d;   /* amber (--accent) */
  --primary-foreground: #0f1720;
  --primary-dim:        rgba(232, 163, 61, 0.16);   /* selected option bg */

  /* Semantic states */
  --success:            #4cae7d;   /* correct answer (--correct) */
  --success-dim:        rgba(76, 174, 125, 0.14);
  --destructive:        #d9614f;   /* incorrect answer (--incorrect) */
  --destructive-dim:    rgba(217, 97, 79, 0.14);

  /* Text */
  --foreground:         #e8ecf1;   /* (--paper) */
  --muted-foreground:   #7e8ca3;   /* (--muted) */

  /* Blueprint grid */
  --grid-line:          rgba(94, 200, 216, 0.07);

  /* Corners */
  --radius:             0.25rem;   /* 4px — sharp, technical */
}
```

**Background texture** (apply to `.quiz-app` wrapper and admin page wrappers):
```css
background:
  linear-gradient(var(--grid-line) 1px, transparent 1px) 0 0 / 28px 28px,
  linear-gradient(90deg, var(--grid-line) 1px, transparent 1px) 0 0 / 28px 28px,
  var(--background);
```

**Fonts** (Google Fonts, add to `<head>`):
```
Space Grotesk — weights 500, 600, 700 — display/headers only
Inter — weights 400, 500, 600 — body
JetBrains Mono — weights 400, 500, 600 — labels, counters, badges, tags
```

---

### Shared components (build once, use in both apps)

**`<StampBox>` component** — engineering title-block stamp:
```
inline-flex, border: 1px solid var(--border), bg: var(--card), font: JetBrains Mono 11px
Each cell: padding 6px 12px, border-right: 1px solid var(--border), last cell no right border
Cell content: muted text label + amber <b> value
```

Show on every exam screen and every admin page header.

Example: `DOC SAA-C03-DOMAIN1 · REV 1.0 · SRC AWS Certification Docs`

**`<TickRuler count={N} current={i}>` component:**
```
display: flex, gap: 4px
Each tick: flex: 1, height: 4px, border-radius: 1px
  i < current  → background: var(--primary)   (done)
  i = current  → background: var(--foreground) (active)
  i > current  → background: var(--border)     (upcoming)
```

**`<OptionButton letter="A" state="default|selected|correct|incorrect|locked">`:**
```
Full-width button, display: flex, align-items: flex-start, gap: 12px
Padding: 12px 14px, bg: var(--card-raised), border: 1px solid var(--border), border-radius: 3px
Font: Inter 14px, cursor: pointer, transition: border-color 0.15s, background 0.15s

States:
  hover (not locked):  border-color: var(--primary)
  selected:            border-color: var(--primary),  bg: var(--primary-dim)
  correct:             border-color: var(--success),  bg: var(--success-dim)
  incorrect:           border-color: var(--destructive), bg: var(--destructive-dim)
  locked:              cursor: default

Letter badge (inside button, left-aligned):
  JetBrains Mono 12px 600, border-radius: 50%, width: 22px, height: 22px
  Default: border: 1px solid var(--border), color: var(--muted-foreground)
  selected: border/color → var(--primary)
  correct:  border/bg → var(--success), color: var(--background)
  incorrect: border/bg → var(--destructive), color: var(--background)
```

**`<ExplainBox correct={bool} text={string} citations={string[]}>`:**
```
Shown below options after answer locked in practice mode
Padding: 14px 16px, border-radius: 3px, font-size: 13.5px, line-height: 1.6
correct:   bg var(--success-dim),     border: 1px solid var(--success)
incorrect: bg var(--destructive-dim), border: 1px solid var(--destructive)
Tag line above text: JetBrains Mono 11px 600, letter-spacing 0.04em
  correct → "CORRECT" in var(--success)
  incorrect → "INCORRECT" in var(--destructive)
Bottom area: "Evidence" links list rendered as clickable URLs
```

**`<ActionButton>`:**
```
bg: var(--primary), color: var(--background)
Font: Space Grotesk 600 14px, padding: 10px 22px, border-radius: 3px
:disabled → opacity 0.35, cursor: not-allowed
:hover:not(:disabled) → opacity 0.88
```

**`<CategoryTag text="TASK 1.1 · SECURE ACCESS">`:**
```
JetBrains Mono 11px, color: var(--primary), letter-spacing: 0.03em, margin-bottom: 14px
```

**`<QuestionCounter current={1} total={10}>`:**
```
JetBrains Mono 12px, color: var(--muted-foreground), letter-spacing: 0.02em
"QUESTION <b>1</b> / 10"  — <b> in var(--foreground)
```

---

### User app pages

#### `/exams` — Certification picker

Cards per active certification (using `--card` background, `--border` border,
`--radius` corners). Each card shows:
- Vendor + code (JetBrains Mono, amber)
- Full name (Space Grotesk)
- Published question count + domain count
- "Start exam" button

#### `/exams/[certId]/start` — Mode selector

Stamp: `DOC · {cert.code}` / `REV · —` / `SRC · {cert.vendor}`

Two independent toggle groups:

**Feedback mode** (radio, required):
```
○ Practice mode
  See correctness and explanation immediately after each answer.
○ Exam simulation
  No feedback until you submit. Mirrors real exam conditions.
```

**Selection mode** (radio, required):
```
○ Category focus
  Choose specific domains or tasks to drill.
  [Multi-select category tree — shown only when this option is selected]
○ Blueprint-weighted random
  The system builds a full practice exam mirroring the real blueprint weighting.
  Question count: [input, default = certification.question_count_default]
```

If `weighted_random` is chosen and total published questions < requested count,
show a warning after fetching `GET /certifications/:id/categories` (which
includes per-category published counts).

**Start exam** button → `POST /exams` → redirect to `/exams/[attemptId]`.

If the API returns `warnings[]`, show them as an inline info banner on the
start screen before allowing the user to proceed.

#### `/exams/[attemptId]` — Exam-taking screen

Layout matches the reference HTML exactly:

```
[StampBox: DOC · {cert.code} / REV · {attempt number} / SRC · {vendor}]
[Space Grotesk h1: "{cert.name}"]
[subtitle: feedback mode + selection mode in muted text]

[QuestionCounter: "QUESTION 3 / 20"]
[TickRuler: count=20, current=2]

[quiz-card — bg: var(--card), border: 1px solid var(--border), border-radius: 4px, padding: 26px]
  [CategoryTag: "TASK 1.2 · SECURE WORKLOADS"]
  [stem paragraph: 16.5px, line-height 1.55]
  [options list — gap: 10px]
    [OptionButton A] ...
    [OptionButton B] ...
    [OptionButton C] ...
    [OptionButton D] ...
  [ExplainBox — hidden until answer locked (practice mode only)]
  [action-row — flex, justify: flex-end]
    [ActionButton: "Check answer" disabled until option selected]

[score-footer: "RUNNING SCORE" (muted) ... "3 / 20" (amber bold)]
  → shown in practice mode; hidden in exam mode
```

**Interaction flow — Practice mode:**
1. User selects an option → option gets `selected` state, "Check answer" enables.
2. User clicks "Check answer" → options lock, correct gets `correct` state,
   wrong selection gets `incorrect` state. Show:
   - one `ExplainBox` for the selected option (why it was correct/incorrect + evidence links)
   - one `ExplainBox` for the correct option (why it is correct + evidence links)
3. Button text changes to "Next question" (or "See results" on last question).
4. User clicks Next → render next question. TickRuler advances.

**Interaction flow — Exam mode:**
1. User selects an option → option gets `selected` state.
2. Button text is "Next question" immediately (no "Check answer" step).
3. User clicks Next → answer recorded, render next question. No feedback shown.
4. On last question, button text is "Submit exam".

**Question navigator panel** (collapsible sidebar or drawer):
- Grid of question numbers. Each cell shows: unanswered / answered / flagged.
- "Flag for review" toggle per question (local state only, no API call).
- Clicking a cell navigates to that question number.

**Navigation guard:** if user tries to navigate away mid-exam (browser back,
close tab), show a confirmation prompt.

#### `/exams/[attemptId]/results` — Results screen

```
[StampBox]
[Space Grotesk h1: "Exam Results"]

[Results card — centered]
  [score: Space Grotesk 48px 700, amber]
    "7 / 10"  ← big-score style from reference HTML
  [pct + verdict: muted 14px]
    "(70%) — Passed" or "(58%) — Did not pass"
  [pass threshold note: "Pass threshold: 72%"]

[Category breakdown table]
  | Domain | Score | Bar |
  | Domain 1 · Secure Architectures | 4/5 (80%) | ████░ |
  | Domain 2 · Resilient Architectures | 3/5 (60%) | ███░░ |

[Full question review — collapsible, "Review all answers" toggle]
  For each question:
    [CategoryTag]
    [stem]
    Question images: [thumbnail/image block, click to expand]
    Your answer: [option text] ✓ or ✗
    Your option images (if any): [thumbnail/image block]
    Why your answer was correct/incorrect: [explanation]
    Evidence links: [doc URL 1] [doc URL 2]
    Correct answer: [option text]
    Correct option images (if any): [thumbnail/image block]
    Why this is correct: [explanation]
    Evidence links: [doc URL 1] [doc URL 2]
    Optional expand: show all options with per-option rationale + links

[Action buttons]
  [Retry same settings]  [Back to certifications]
```

Retry button → `POST /exams` with same `feedback_mode`, `selection_mode`, and
`category_ids` (or `question_count`) as the original attempt — new random draw,
not a replay.

#### `/profile/attempts` — Attempt history

Table per certification showing date, score, pass/fail, feedback mode,
selection mode. Link to `/exams/[attemptId]/results` for each completed
attempt.

---

## 11. Build phases

Work in this order. Each phase must leave `bun run test:ci` passing before
starting the next.

### Phase 1 — Schema + contracts
- Add `packages/platform-db/src/schema/certdrill.ts` with all tables.
- Export from `packages/platform-db/src/schema/index.ts`.
- Run `bun run db:generate -- --name add_certdrill_tables` and `bun run db:check`.
- Add TypeScript types to `packages/contracts/src/certdrill.ts`.
- Create module skeletons:
  - `apps/api/src/modules/certdrill/`
  - `apps/admin/src/modules/certdrill/`
  - `apps/web/src/modules/certdrill/`
  - and mount points (`/api/certdrill/*`, `/api/admin/certdrill/*`).

### Phase 2 — Admin API (no AI yet)
- All `/admin/*` routes: certifications, categories (with weight validation),
  learn resources (including ingest + manual content edit), question CRUD
  (including publish / bulk-publish / bulk-archive), and blueprint URL
  parse/import endpoints.
- `GET /admin/llm-models` returning the `FOUNDRY_MODELS` constant.
- `GET /admin/analytics/overview` and
  `GET /admin/analytics/certifications/:id` with date-range filters.
- `GET /certifications` and `GET /certifications/:id/categories` for the user
  app.
- All routes documented via `@hono/zod-openapi`.

### Phase 3 — Admin UI
- All pages and tabs described in Section 9.
- Design tokens wired to `apps/admin/globals.css`.
- Shared components (`StampBox`, `OptionButton`, etc.) built in
  `apps/admin/src/components/certdrill/`.
- Live-polling job list with React Query `refetchInterval`.
- Build `/admin/analytics` with KPI cards, line/bar/donut charts, and
  certification drill-down tables.

### Phase 4 — Async generation pipeline
- Add `inngest` (default), `pg-boss` (fallback), and `@azure-rest/ai-inference`
  to `apps/api/package.json`.
- Implement `JobQueueProvider` interface + provider factory (`QUEUE_PROVIDER`).
- Implement Inngest adapter first; pg-boss adapter second.
- Implement `POST /admin/generation-jobs` using provider abstraction.
- Worker handler: load job → call Foundry → parse → insert draft questions.
- Draft review UI in `/admin/generation-jobs/[id]`.

### Phase 5 — User exam flow
- Exam start screen (mode selectors + blueprint tree).
- `POST /exams` + weighted-selection algorithm (including backfill + warnings).
- Exam-taking screen (practice + exam mode, all shared components).
- `POST /exams/:id/submit` + results screen with category breakdown.
- Attempt history page.
- All design tokens wired to `apps/web/globals.css`.

### Phase 6 — Polish
- Exam timer (optional, configurable per attempt; 0 = untimed; local state only).
- Question navigator "flag for review" (local state; no DB change needed).
- Empty-state messaging when question bank is thin.
- Richer per-category analytics trend across multiple attempts.

### Phase 7 — Future / SaaS layer (out of MVP scope)
Billing is already wired (Dodo Payments). Enable via feature flags and plan
checks using `packages/payments-core` when ready. No new payment
infrastructure needed.

---

## 12. Conventions — follow the boilerplate's patterns

- **Testing:** `vitest` everywhere. Add unit tests for the weighted-selection
  algorithm and the weight-validation rule. Do not add new test runners.
- **Analytics query performance:** add indexes for
  `ExamAttempt(certification_id, completed_at, status)` and
  `Question(certification_id, status)` in the same migration set as analytics
  endpoints to keep dashboard queries fast.
- **Env vars:** add new vars to the relevant `.env.example` alongside the
  change. Validate in `apps/api/src/env.ts` using the existing pattern.
- **Module boundary discipline:** keep CertDrill code under the
  `modules/certdrill` namespace and API namespace mounts; avoid cross-cutting
  edits in boilerplate core unless needed for a generic extension seam.
- **DB migrations:** every PR that adds or changes a table must include the
  generated migration from `bun run db:generate`.
- **API errors:** follow the existing Hono error-response shape. HTTP 422 for
  validation failures, 404 for not-found, 401/403 for auth.
- **Progress tracking:** maintain `PROGRESS.md` at the repo root. Update at
  the end of every session with: what's done, what's next, open decisions.

---

## 13. Confirmed assumptions

- Single admin organization curating content for all end users. No
  multi-tenant white-labeling in MVP.
- Runtime is Bun + `@hono/node-server`.
- Queue provider is pluggable: default `inngest` for observability; optional
  `pgboss` fallback selected via `QUEUE_PROVIDER`.
- LLM provider is Azure AI Foundry. Model is selectable per generation job
  from the `FOUNDRY_MODELS` constant; changing the available model list is a
  code change in `apps/api/src/lib/foundry-models.ts`, not a DB change.
- `QuestionGenerationJob` stores provider metadata
  (`provider`, `provider_run_id`, `provider_run_url`) so admin UI can deep-link
  to provider runs when available.
- Explanations and citation links are required for every answer option
  (correct and incorrect) before publish.
- Questions and answer options support optional visual attachments
  (one or more PNG/JPG images) with alt text and captions.
- Category `weight_pct` is trusted as entered. System validates internal
  consistency (siblings sum to 100) only.
- `user_id` on `ExamAttempt` references BetterAuth's `user.id`. No separate
  User table.
- OAuth providers available: GitHub and Google.
- `ExamAttemptAnswer` allows overwriting a previous answer (user changes mind
  before submitting). `POST /exams/:id/answers` upserts by
  `(exam_attempt_id, question_id)`.
