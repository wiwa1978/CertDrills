# CertDrill Resource Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Safely fetch public HTML and PDF CertDrill resources, persist normalized text snapshots, and expose ingestion from the admin Resources tab.

**Architecture:** Keep network fetching, document extraction, persistence orchestration, HTTP routing, and admin UI as separate units. The ingestion service receives testable fetch/extraction dependencies, while the admin service owns resource lookup and atomic status updates.

**Tech Stack:** TypeScript 5.9, Hono, Drizzle ORM, Vitest, Cheerio, pdfjs-dist, ipaddr.js, Next.js server actions

---

## File Structure

- Create `apps/api/src/modules/certdrill/resource-fetch.ts` — public URL validation, DNS/IP protection, redirects, timeout, and response byte limits.
- Create `apps/api/src/modules/certdrill/resource-extraction.ts` — HTML and PDF text extraction and normalization.
- Create `apps/api/src/modules/certdrill/resource-ingestion.ts` — ingestion result/error contract and fetch/extract orchestration.
- Create `apps/api/tests/modules/certdrill/resource-fetch.test.ts` — SSRF and fetch-limit tests.
- Create `apps/api/tests/modules/certdrill/resource-extraction.test.ts` — HTML/PDF extraction tests.
- Create `apps/api/tests/modules/certdrill/resource-ingestion.test.ts` — orchestration and failure tests.
- Modify `apps/api/src/modules/certdrill/admin-service.ts` — resource lookup and persistence lifecycle.
- Modify `apps/api/src/modules/certdrill/routes.ts` — ingestion endpoint.
- Modify `apps/api/tests/modules/certdrill/admin-service.test.ts` — persistence behavior.
- Modify `apps/api/tests/certdrill.admin.routes.test.ts` — route delegation.
- Modify `apps/admin/src/lib/api/certdrill.server.ts` — ingestion response type and server request.
- Modify `apps/admin/src/modules/certdrill/admin-actions.ts` — ingestion server action.
- Modify `apps/admin/src/modules/certdrill/admin-page.tsx` — ingestion controls and status.
- Modify `apps/admin/tests/components/certdrill-admin-page-copy.test.ts` — admin UI contract.
- Modify `apps/api/package.json` and `bun.lock` — document extraction dependencies.

### Task 1: Document extraction

**Files:**
- Create: `apps/api/src/modules/certdrill/resource-extraction.ts`
- Create: `apps/api/tests/modules/certdrill/resource-extraction.test.ts`
- Modify: `apps/api/package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Add extraction dependencies**

Run:

```bash
bun add --cwd apps/api cheerio pdfjs-dist ipaddr.js
bun add --cwd apps/api --dev pdf-lib
```

Expected: `apps/api/package.json` and `bun.lock` include the runtime extraction/network packages and the PDF test helper.

- [ ] **Step 2: Write failing extraction tests**

Create `apps/api/tests/modules/certdrill/resource-extraction.test.ts`:

```ts
import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  normalizeResourceText,
  extractResourceDocument,
} from "../../../src/modules/certdrill/resource-extraction";

describe("CertDrill resource extraction", () => {
  it("extracts headings and lists from HTML without scripts or navigation", async () => {
    const result = await extractResourceDocument({
      contentType: "text/html; charset=utf-8",
      body: Buffer.from(`
        <html><head><title>AZ-104 Study Guide</title></head>
        <body>
          <nav>Skip navigation</nav>
          <main><h1>Skills measured</h1><ul><li>Manage identities</li><li>Manage storage</li></ul></main>
          <script>ignore()</script>
        </body></html>
      `),
    });

    expect(result).toEqual({
      title: "AZ-104 Study Guide",
      text: "Skills measured\nManage identities\nManage storage",
      contentType: "text/html",
    });
  });

  it("normalizes repeated whitespace while retaining line structure", () => {
    expect(normalizeResourceText(" Domain 1 \\n\\n\\n  Task A   \\n Task B ")).toBe(
      "Domain 1\n\nTask A\nTask B",
    );
  });

  it("extracts text from PDF documents", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const page = pdf.addPage();
    page.drawText("Domain 1: Manage identities", { x: 50, y: 700, font });

    const result = await extractResourceDocument({
      contentType: "application/pdf",
      body: Buffer.from(await pdf.save()),
    });

    expect(result.contentType).toBe("application/pdf");
    expect(result.text).toContain("Domain 1: Manage identities");
  });

  it("rejects unsupported content types", async () => {
    await expect(
      extractResourceDocument({
        contentType: "application/zip",
        body: Buffer.from("zip"),
      }),
    ).rejects.toMatchObject({ code: "UNSUPPORTED_CONTENT_TYPE" });
  });
});
```

- [ ] **Step 3: Run tests to verify RED**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-extraction.test.ts
```

Expected: FAIL because `resource-extraction.ts` does not exist.

- [ ] **Step 4: Implement extraction**

Create `apps/api/src/modules/certdrill/resource-extraction.ts` with these exports:

```ts
import { load } from "cheerio";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

export type ExtractedResourceDocument = {
  title: string | null;
  text: string;
  contentType: "text/html" | "application/pdf";
};

export class ResourceExtractionError extends Error {
  constructor(
    public readonly code: "UNSUPPORTED_CONTENT_TYPE" | "EMPTY_CONTENT" | "EXTRACTED_TEXT_TOO_LARGE",
    message: string,
  ) {
    super(message);
    this.name = "ResourceExtractionError";
  }
}

const MAX_EXTRACTED_TEXT_LENGTH = 100_000;

export function normalizeResourceText(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function validateExtractedText(text: string) {
  if (!text) throw new ResourceExtractionError("EMPTY_CONTENT", "The resource contained no readable text.");
  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new ResourceExtractionError(
      "EXTRACTED_TEXT_TOO_LARGE",
      `Extracted resource text exceeds ${MAX_EXTRACTED_TEXT_LENGTH} characters.`,
    );
  }
  return text;
}

async function extractHtml(body: Buffer): Promise<ExtractedResourceDocument> {
  const $ = load(body.toString("utf8"));
  const title = normalizeResourceText($("title").first().text()) || null;
  $("script, style, nav, footer, noscript, svg").remove();
  const root = $("main, article").first().length > 0 ? $("main, article").first() : $("body");
  root.find("h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td").each((_, element) => {
    $(element).append("\n");
  });
  const text = validateExtractedText(normalizeResourceText(root.text()));
  return { title, text, contentType: "text/html" };
}

async function extractPdf(body: Buffer): Promise<ExtractedResourceDocument> {
  const document = await getDocument({ data: new Uint8Array(body) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => ("str" in item ? item.str : "")).join(" "));
  }
  const text = validateExtractedText(normalizeResourceText(pages.join("\n\n")));
  const title = typeof document.getMetadata === "function"
    ? await document.getMetadata().then((metadata) => {
        const info = metadata.info as { Title?: unknown };
        return typeof info.Title === "string" ? normalizeResourceText(info.Title) || null : null;
      })
    : null;
  return { title, text, contentType: "application/pdf" };
}

export async function extractResourceDocument(input: {
  contentType: string;
  body: Buffer;
}): Promise<ExtractedResourceDocument> {
  const contentType = input.contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "text/html" || contentType === "application/xhtml+xml") {
    return extractHtml(input.body);
  }
  if (contentType === "application/pdf") return extractPdf(input.body);
  throw new ResourceExtractionError(
    "UNSUPPORTED_CONTENT_TYPE",
    `Unsupported resource content type: ${contentType || "unknown"}.`,
  );
}
```

- [ ] **Step 5: Run extraction tests**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-extraction.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json bun.lock apps/api/src/modules/certdrill/resource-extraction.ts apps/api/tests/modules/certdrill/resource-extraction.test.ts
git commit -m "feat: extract CertDrill resource documents"
```

### Task 2: Safe public resource fetching

**Files:**
- Create: `apps/api/src/modules/certdrill/resource-fetch.ts`
- Create: `apps/api/tests/modules/certdrill/resource-fetch.test.ts`

- [ ] **Step 1: Write failing URL-safety tests**

Create tests for the exported `assertPublicResourceUrl` and `fetchPublicResource`:

```ts
import { describe, expect, it, vi } from "vitest";

import {
  assertPublicResourceUrl,
  fetchPublicResource,
} from "../../../src/modules/certdrill/resource-fetch";

describe("CertDrill public resource fetching", () => {
  it.each([
    "http://127.0.0.1/guide",
    "http://169.254.169.254/latest/meta-data",
    "http://10.0.0.8/guide",
    "http://[::1]/guide",
  ])("rejects private destination %s", async (url) => {
    await expect(assertPublicResourceUrl(url, async () => ["127.0.0.1"])).rejects.toMatchObject({
      code: "PRIVATE_DESTINATION",
    });
  });

  it("rejects redirect targets that resolve privately", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        status: 302,
        headers: { location: "http://internal.example/secret" },
        body: Buffer.alloc(0),
      });

    await expect(fetchPublicResource("https://public.example/guide", {
      request,
      resolve: async (hostname) => hostname === "public.example" ? ["93.184.216.34"] : ["10.0.0.5"],
    })).rejects.toMatchObject({ code: "PRIVATE_DESTINATION" });
  });

  it("rejects responses larger than the configured byte limit", async () => {
    await expect(fetchPublicResource("https://public.example/guide", {
      request: async () => ({
        status: 200,
        headers: { "content-type": "text/html" },
        body: Buffer.alloc(1_000_001),
      }),
      resolve: async () => ["93.184.216.34"],
      maxBytes: 1_000_000,
    })).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-fetch.test.ts
```

Expected: FAIL because the fetch module does not exist.

- [ ] **Step 3: Implement the safe fetch boundary**

Create `resource-fetch.ts` with:

```ts
import http from "node:http";
import https from "node:https";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import * as ipaddr from "ipaddr.js";

export type ResourceFetchErrorCode =
  | "INVALID_URL"
  | "PRIVATE_DESTINATION"
  | "FETCH_FAILED"
  | "REDIRECT_LIMIT"
  | "RESPONSE_TOO_LARGE";

export class ResourceFetchError extends Error {
  constructor(public readonly code: ResourceFetchErrorCode, message: string) {
    super(message);
    this.name = "ResourceFetchError";
  }
}

type FetchResponse = {
  status: number;
  headers: Record<string, string | undefined>;
  body: Buffer;
};

type FetchDeps = {
  resolve?: (hostname: string) => Promise<string[]>;
  request?: (url: URL, addresses: string[], timeoutMs: number, maxBytes: number) => Promise<FetchResponse>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
};

function isPrivateAddress(address: string) {
  return ipaddr.process(address).range() !== "unicast";
}

async function defaultResolve(hostname: string) {
  const results = await lookup(hostname, { all: true, verbatim: true });
  return results.map((result) => result.address);
}

export async function assertPublicResourceUrl(
  value: string,
  resolve: (hostname: string) => Promise<string[]> = defaultResolve,
) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ResourceFetchError("INVALID_URL", "Resource URL is invalid.");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new ResourceFetchError("INVALID_URL", "Resource URL must be public HTTP(S) without credentials.");
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(hostname) ? [hostname] : await resolve(hostname);
  if (addresses.length === 0 || addresses.some(isPrivateAddress)) {
    throw new ResourceFetchError("PRIVATE_DESTINATION", "Resource URL resolves to a non-public destination.");
  }
  return { url, addresses };
}

export async function fetchPublicResource(value: string, deps: FetchDeps = {}) {
  const resolve = deps.resolve ?? defaultResolve;
  const request = deps.request ?? nativePinnedRequest;
  const maxBytes = deps.maxBytes ?? 1_000_000;
  const timeoutMs = deps.timeoutMs ?? 10_000;
  const maxRedirects = deps.maxRedirects ?? 3;
  let current = value;

  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    const { url, addresses } = await assertPublicResourceUrl(current, resolve);
    const response = await request(url, addresses, timeoutMs, maxBytes);
    if (response.body.byteLength > maxBytes) {
      throw new ResourceFetchError("RESPONSE_TOO_LARGE", `Resource exceeds ${maxBytes} bytes.`);
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.location;
      if (!location) throw new ResourceFetchError("FETCH_FAILED", "Resource redirect omitted a location.");
      if (redirect === maxRedirects) throw new ResourceFetchError("REDIRECT_LIMIT", "Resource exceeded redirect limit.");
      current = new URL(location, url).toString();
      continue;
    }
    if (response.status < 200 || response.status >= 300) {
      throw new ResourceFetchError("FETCH_FAILED", `Resource returned HTTP ${response.status}.`);
    }
    return {
      finalUrl: url.toString(),
      contentType: response.headers["content-type"] ?? "",
      body: response.body,
    };
  }
  throw new ResourceFetchError("REDIRECT_LIMIT", "Resource exceeded redirect limit.");
}

function nativePinnedRequest(
  url: URL,
  addresses: string[],
  timeoutMs: number,
  maxBytes: number,
): Promise<FetchResponse> {
  const address = addresses[0];
  if (!address) {
    throw new ResourceFetchError("FETCH_FAILED", "Resource hostname has no public address.");
  }
  const transport = url.protocol === "https:" ? https : http;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");

  return new Promise((resolve, reject) => {
    const request = transport.request({
      protocol: url.protocol,
      hostname,
      port: url.port || undefined,
      path: `${url.pathname}${url.search}`,
      method: "GET",
      headers: {
        accept: "text/html,application/xhtml+xml,application/pdf",
        host: url.host,
        "user-agent": "CertDrills-ResourceIngestor/1.0",
      },
      servername: isIP(hostname) ? undefined : hostname,
      signal: AbortSignal.timeout(timeoutMs),
      lookup: (_hostname, _options, callback) => {
        callback(null, address, isIP(address) as 4 | 6);
      },
    }, (response) => {
      const declaredLength = Number(response.headers["content-length"] ?? 0);
      if (declaredLength > maxBytes) {
        response.destroy();
        reject(new ResourceFetchError("RESPONSE_TOO_LARGE", `Resource exceeds ${maxBytes} bytes.`));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.byteLength;
        if (totalBytes > maxBytes) {
          response.destroy();
          reject(new ResourceFetchError("RESPONSE_TOO_LARGE", `Resource exceeds ${maxBytes} bytes.`));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        const headers = Object.fromEntries(
          Object.entries(response.headers).map(([key, value]) => [
            key.toLowerCase(),
            Array.isArray(value) ? value.join(", ") : value,
          ]),
        );
        resolve({
          status: response.statusCode ?? 0,
          headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    request.on("error", (error) => {
      reject(new ResourceFetchError("FETCH_FAILED", `Resource fetch failed: ${error.message}`));
    });
    request.end();
  });
}
```

This pinning is mandatory: resolving safely and then allowing the HTTP client to resolve the hostname again would permit DNS rebinding.

- [ ] **Step 4: Run fetch tests**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-fetch.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/certdrill/resource-fetch.ts apps/api/tests/modules/certdrill/resource-fetch.test.ts
git commit -m "feat: safely fetch CertDrill resources"
```

### Task 3: Ingestion orchestration and persistence

**Files:**
- Create: `apps/api/src/modules/certdrill/resource-ingestion.ts`
- Create: `apps/api/tests/modules/certdrill/resource-ingestion.test.ts`
- Modify: `apps/api/src/modules/certdrill/admin-service.ts`
- Modify: `apps/api/tests/modules/certdrill/admin-service.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Test that `createResourceIngestor`:

```ts
const ingestor = createResourceIngestor({
  fetchResource: async () => ({
    finalUrl: "https://learn.example/guide",
    contentType: "text/html",
    body: Buffer.from("<main><h1>Domain 1</h1></main>"),
  }),
  extractDocument: async () => ({
    title: "Guide",
    text: "Domain 1",
    contentType: "text/html",
  }),
  now: () => new Date("2026-08-06T12:00:00.000Z"),
});

await expect(ingestor.ingest("https://learn.example/guide")).resolves.toEqual({
  finalUrl: "https://learn.example/guide",
  title: "Guide",
  rawContent: "Domain 1",
  contentType: "text/html",
  ingestedAt: new Date("2026-08-06T12:00:00.000Z"),
});
```

Also assert that fetch and extraction errors are returned as typed ingestion failures without success-shaped fallback data.

- [ ] **Step 2: Run tests to verify RED**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-ingestion.test.ts
```

Expected: FAIL because the ingestion module does not exist.

- [ ] **Step 3: Implement the ingestor**

Create:

```ts
import { extractResourceDocument } from "./resource-extraction";
import { fetchPublicResource } from "./resource-fetch";

export type ResourceIngestionResult = {
  finalUrl: string;
  title: string | null;
  rawContent: string;
  contentType: "text/html" | "application/pdf";
  ingestedAt: Date;
};

export function createResourceIngestor(deps: {
  fetchResource?: typeof fetchPublicResource;
  extractDocument?: typeof extractResourceDocument;
  now?: () => Date;
} = {}) {
  const fetchResource = deps.fetchResource ?? fetchPublicResource;
  const extractDocument = deps.extractDocument ?? extractResourceDocument;
  const now = deps.now ?? (() => new Date());

  return {
    async ingest(url: string): Promise<ResourceIngestionResult> {
      const fetched = await fetchResource(url);
      const extracted = await extractDocument({
        contentType: fetched.contentType,
        body: fetched.body,
      });
      return {
        finalUrl: fetched.finalUrl,
        title: extracted.title,
        rawContent: extracted.text,
        contentType: extracted.contentType,
        ingestedAt: now(),
      };
    },
  };
}

export type ResourceIngestor = ReturnType<typeof createResourceIngestor>;
```

- [ ] **Step 4: Write failing admin-service tests**

Add:

```ts
it("persists successful resource ingestion", async () => {
  const resource = {
    id: ids.resource,
    certificationId: ids.cert,
    url: "https://learn.example/old",
    title: "Old title",
    rawContent: null,
    ingestedAt: null,
    status: "pending",
  };
  const ingestedAt = new Date("2026-08-06T12:00:00.000Z");
  const { db, updates } = createAdminDb({
    resources: [resource],
    returningByTable: {
      certdrill_learn_resources: [{
        ...resource,
        url: "https://learn.example/guide",
        title: "Study guide",
        rawContent: "Skills measured",
        ingestedAt,
        status: "ingested",
        ingestError: null,
      }],
    },
  });
  const resourceIngestor = {
    ingest: vi.fn().mockResolvedValue({
      finalUrl: "https://learn.example/guide",
      title: "Study guide",
      rawContent: "Skills measured",
      contentType: "text/html",
      ingestedAt,
    }),
  };
  const service = createCertDrillAdminService({ db, resourceIngestor });

  await expect(service.ingestResource(ids.resource)).resolves.toMatchObject({
    id: ids.resource,
    status: "ingested",
  });
  expect(updates.at(-1)?.values).toMatchObject({
    url: "https://learn.example/guide",
    title: "Study guide",
    rawContent: "Skills measured",
    ingestedAt,
    status: "ingested",
    ingestError: null,
  });
});

it("preserves the previous snapshot when refresh fails", async () => {
  const previousIngestedAt = new Date("2026-08-05T12:00:00.000Z");
  const { db, updates } = createAdminDb({
    resources: [{
      id: ids.resource,
      certificationId: ids.cert,
      url: "https://learn.example/guide",
      title: "Study guide",
      rawContent: "Previous snapshot",
      ingestedAt: previousIngestedAt,
      status: "ingested",
    }],
  });
  const service = createCertDrillAdminService({
    db,
    resourceIngestor: {
      ingest: vi.fn().mockRejectedValue(new Error("Resource returned HTTP 503.")),
    },
  });

  await expect(service.ingestResource(ids.resource)).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED",
    message: "Resource returned HTTP 503.",
  });
  expect(updates.at(-1)?.values).toMatchObject({
    status: "failed",
    ingestError: "Resource returned HTTP 503.",
  });
  expect(updates.at(-1)?.values).not.toHaveProperty("rawContent");
  expect(updates.at(-1)?.values).not.toHaveProperty("ingestedAt");
});

it("rejects ingestion for an unknown resource", async () => {
  const { db } = createAdminDb({ resources: [] });
  const service = createCertDrillAdminService({
    db,
    resourceIngestor: { ingest: vi.fn() },
  });

  await expect(service.ingestResource(ids.resource)).rejects.toMatchObject({
    code: "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND",
  });
});
```

- [ ] **Step 5: Implement service persistence**

Import the ingestion dependency:

```ts
import {
  createResourceIngestor,
  type ResourceIngestor,
} from "./resource-ingestion";
```

Extend dependencies and errors:

```ts
type CertDrillAdminServiceDeps = {
  db: any;
  questionIndex?: CertDrillAdminQuestionIndex;
  resourceIngestor?: ResourceIngestor;
};
```

Extend the existing `ResourceRow` type so ingestion does not rely on `any`:

```ts
type ResourceRow = {
  id: string;
  certificationId?: string;
  categoryId?: string | null;
  url: string;
  title: string;
  rawContent?: string | null;
  ingestedAt?: Date | null;
  status?: "pending" | "ingested" | "failed";
};
```

```ts
export type CertDrillAdminServiceErrorCode =
  | "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND"
  | "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED"
  | "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS"
  | "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE"
  | "CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE"
  | "CERTDRILL_ADMIN_QUESTION_NOT_FOUND"
  | "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE";
```

Initialize the default ingestor immediately after `questionIndex`:

```ts
const resourceIngestor = deps.resourceIngestor ?? createResourceIngestor();
```

Then add:

```ts
async function ingestResource(id: string) {
  const resource = await deps.db.query.certdrillLearnResources.findFirst({
    where: eq(certdrillLearnResources.id, id),
  });
  if (!resource) {
    throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_RESOURCE_NOT_FOUND", "Resource not found.");
  }

  try {
    const result = await resourceIngestor.ingest(resource.url);
    const [updated] = await deps.db.update(certdrillLearnResources).set({
      url: result.finalUrl,
      title: result.title || resource.title,
      rawContent: result.rawContent,
      ingestedAt: result.ingestedAt,
      status: "ingested",
      ingestError: null,
      updatedAt: new Date(),
    }).where(eq(certdrillLearnResources.id, id)).returning();
    return updated;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Resource ingestion failed.";
    await deps.db.update(certdrillLearnResources).set({
      status: "failed",
      ingestError: message,
      updatedAt: new Date(),
    }).where(eq(certdrillLearnResources.id, id));
    throw new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED",
      message,
    );
  }
}
```

Return `ingestResource` from the service.

- [ ] **Step 6: Run service tests**

Run:

```bash
bun run --cwd apps/api test -- tests/modules/certdrill/resource-ingestion.test.ts tests/modules/certdrill/admin-service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/certdrill/resource-ingestion.ts apps/api/src/modules/certdrill/admin-service.ts apps/api/tests/modules/certdrill/resource-ingestion.test.ts apps/api/tests/modules/certdrill/admin-service.test.ts
git commit -m "feat: persist CertDrill resource ingestion"
```

### Task 4: Admin ingestion API

**Files:**
- Modify: `apps/api/src/modules/certdrill/routes.ts`
- Modify: `apps/api/tests/certdrill.admin.routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Add `ingestResource: vi.fn()` to the service mock and test:

```ts
it("delegates resource ingestion", async () => {
  service.ingestResource.mockResolvedValueOnce({
    id: resourceId,
    status: "ingested",
    rawContent: "Skills measured",
  });

  const response = await createApp().request(
    `/api/admin/certdrill/resources/${resourceId}/ingest`,
    { method: "POST" },
  );

  expect(response.status).toBe(200);
  expect(service.ingestResource).toHaveBeenCalledWith(resourceId);
});
```

- [ ] **Step 2: Run the route test to verify RED**

Run:

```bash
bun run --cwd apps/api test -- tests/certdrill.admin.routes.test.ts
```

Expected: FAIL with HTTP 404 because the ingestion route is absent.

- [ ] **Step 3: Add the route**

After the existing resource PATCH route, add:

```ts
router.post("/resources/:id/ingest", (c) => {
  const id = adminUuidParam(c);
  if (!id) return validationError(c, "Invalid resource id");
  return withAdminAction(c, () => deps.service.ingestResource(id));
});
```

Keep ingestion failures in the existing `CertDrillAdminServiceError` response shape.

- [ ] **Step 4: Run API verification**

Run:

```bash
bun run --cwd apps/api test -- tests/certdrill.admin.routes.test.ts tests/modules/certdrill/resource-fetch.test.ts tests/modules/certdrill/resource-extraction.test.ts tests/modules/certdrill/resource-ingestion.test.ts tests/modules/certdrill/admin-service.test.ts
bun run typecheck:api
```

Expected: all selected tests pass and typecheck exits successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/certdrill/routes.ts apps/api/tests/certdrill.admin.routes.test.ts
git commit -m "feat: expose CertDrill resource ingestion"
```

### Task 5: Admin Resources-tab controls

**Files:**
- Modify: `apps/admin/src/lib/api/certdrill.server.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-actions.ts`
- Modify: `apps/admin/src/modules/certdrill/admin-page.tsx`
- Modify: `apps/admin/tests/components/certdrill-admin-page-copy.test.ts`

- [ ] **Step 1: Write the failing admin UI contract test**

Extend the source-contract test with:

```ts
expect(source).toContain("ingestCertDrillResourceAction");
expect(source).toContain('name="resourceId" value={resource.id}');
expect(source).toContain('resource.status === "ingested" ? "Refresh" : "Ingest"');
expect(source).toContain("resource.ingestedAt");
expect(source).toContain("resource.ingestError");
```

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts
```

Expected: FAIL because ingestion controls are absent.

- [ ] **Step 3: Add admin API and action**

Extend `CertDrillAdminResource`:

```ts
export type CertDrillAdminResource = CertDrillAdminResourceInput & {
  id: string;
  ingestedAt?: Nullable<string>;
  ingestError?: Nullable<string>;
};
```

Add:

```ts
export async function ingestCertDrillAdminResourceServer(
  resourceId: string,
): Promise<CertDrillAdminResource> {
  return certdrillAdminRequest<CertDrillAdminResource>(
    `/resources/${resourceId}/ingest`,
    jsonRequestInit("POST", {}),
  );
}
```

Add the server action:

```ts
export async function ingestCertDrillResourceAction(formData: FormData) {
  await ingestCertDrillAdminResourceServer(requiredString(formData, "resourceId"));
  revalidateCertDrillAdminPage();
}
```

- [ ] **Step 4: Add ingestion controls and status**

Import the action and extend `ResourceTable` with an Actions column:

```tsx
<TableCell>
  <form action={ingestCertDrillResourceAction}>
    <input type="hidden" name="resourceId" value={resource.id} />
    <Button type="submit" size="sm" variant="outline">
      {resource.status === "ingested" ? "Refresh" : "Ingest"}
    </Button>
  </form>
</TableCell>
```

Below the status badge, render:

```tsx
{resource.ingestedAt ? (
  <p className="text-xs text-muted-foreground">
    Snapshot {new Date(resource.ingestedAt).toLocaleString()}
  </p>
) : null}
{resource.ingestError ? (
  <p className="max-w-sm text-xs text-destructive">{resource.ingestError}</p>
) : null}
```

Do not add an Analyze button in this slice; analysis requires the later parse-run plan.

- [ ] **Step 5: Run admin verification**

Run:

```bash
bun run --cwd apps/admin test -- tests/components/certdrill-admin-page-copy.test.ts
bun run test:admin
bun run typecheck:admin
```

Expected: all admin tests pass and typecheck exits successfully.

- [ ] **Step 6: Run full repository verification**

Run:

```bash
bun run test:ci
```

Expected: database schema check, all typechecks, and all repository tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/lib/api/certdrill.server.ts apps/admin/src/modules/certdrill/admin-actions.ts apps/admin/src/modules/certdrill/admin-page.tsx apps/admin/tests/components/certdrill-admin-page-copy.test.ts
git commit -m "feat: ingest resources from CertDrill admin"
```

## Follow-up Plans

After this plan is complete, create separate implementation plans for:

1. blueprint parse-run schema and Azure AI Foundry provider;
2. structured proposal validation and diff APIs;
3. Blueprint-tab analysis and preview UI;
4. transactional category merge/replace import and provenance.
