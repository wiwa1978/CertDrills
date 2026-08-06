import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/env", () => ({
  env: {
    TRUST_PROXY: false,
  },
}));

const { clearRequestGuardrailStateForTests, getRouteGuardrailForTests, requestGuardrails } = await import("../../src/middleware/request-guardrails");
const { QUESTION_IMPORT_MAX_DOCUMENT_BYTES, QUESTION_IMPORT_MAX_RAW_BODY_BYTES } = await import("../../src/modules/certdrill/question-import");
const { createCertDrillAdminRouter } = await import("../../src/modules/certdrill/routes");

function buildApp() {
  const app = new Hono();
  app.use("/*", requestGuardrails);
  app.patch("/admin/discounts/discount-1", async (c) => c.json({ success: true, data: await c.req.json() }));
  app.post("/admin/verify-admin-secret", (c) => c.json({ success: true, data: { ok: true } }));
  return app;
}

const certificationId = "22222222-2222-4222-8222-222222222222";
const previewDocumentHash = "b".repeat(64);

// Stubbed so the guardrail tests exercise the middleware plus the real import routes without
// touching the database or inserting any questions.
const certDrillAdminService = {
  createQuestion: vi.fn(),
  previewQuestionImport: vi.fn(),
  importQuestions: vi.fn(),
};

// Mounts the guardrail middleware in front of the real CertDrill admin router at its real
// application path, so route registration and the global guardrails are verified together.
function buildCertDrillApp() {
  const app = new Hono();
  app.use("/*", requestGuardrails);
  app.route("/api/admin/certdrill", createCertDrillAdminRouter({ service: certDrillAdminService as never }));
  return app;
}

const questionImportPaths = [
  "/api/admin/certdrill/questions/import",
  "/api/admin/certdrill/questions/import/preview",
] as const;

// Reads the guardrail table itself so the configured rate-limit entries are asserted, not just the
// observable 429 behaviour of one endpoint.
function questionImportRateLimits() {
  return Object.fromEntries(questionImportPaths.map((path) => [
    path,
    getRouteGuardrailForTests("POST", path)?.rateLimit,
  ])) as Record<(typeof questionImportPaths)[number], { windowMs: number; max: number }>;
}

function buildImportDocument(byteTarget: number) {
  return {
    version: 1,
    questions: [
      {
        categoryCode: "SEC-01",
        stem: `Which option is correct? ${"padding ".repeat(Math.ceil(byteTarget / 8))}`,
        answers: [
          { text: "Correct", isCorrect: true },
          { text: "Wrong", isCorrect: false },
        ],
      },
    ],
  };
}

describe("requestGuardrails", () => {
  beforeEach(() => {
    clearRequestGuardrailStateForTests();
  });

  it("applies JSON body size limits to PATCH routes", async () => {
    const res = await buildApp().request("/admin/discounts/discount-1", {
      method: "PATCH",
      headers: { "content-type": "application/json", "content-length": String(70 * 1024) },
      body: JSON.stringify({ code: "X" }),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
  });

  it("returns the nested error envelope for unsupported content type", async () => {
    const res = await buildApp().request("/admin/verify-admin-secret", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "secret=test",
    });

    expect(res.status).toBe(415);
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: { code: "BAD_REQUEST", message: "Unsupported content type" },
    });
  });
});

describe("requestGuardrails question import coverage", () => {
  beforeEach(() => {
    clearRequestGuardrailStateForTests();
    vi.clearAllMocks();
  });

  it("aligns the import guardrail with the import transport cap", () => {
    expect(QUESTION_IMPORT_MAX_RAW_BODY_BYTES).toBe(QUESTION_IMPORT_MAX_DOCUMENT_BYTES + 64 * 1024);
    expect(QUESTION_IMPORT_MAX_RAW_BODY_BYTES).toBeGreaterThan(64 * 1024);
  });

  it("lets a preview payload above the default 64 KiB JSON cap reach the import route", async () => {
    certDrillAdminService.previewQuestionImport.mockResolvedValueOnce({ documentHash: previewDocumentHash });
    const body = JSON.stringify({ certificationId, document: buildImportDocument(200 * 1024) });
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(64 * 1024);

    const res = await buildCertDrillApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(certDrillAdminService.previewQuestionImport).toHaveBeenCalledTimes(1);
  });

  it("lets a confirm payload above the default 64 KiB JSON cap reach the import route", async () => {
    certDrillAdminService.importQuestions.mockResolvedValueOnce({ importedCount: 0, questionIds: [] });
    const body = JSON.stringify({
      certificationId,
      document: buildImportDocument(200 * 1024),
      previewDocumentHash,
      selectedSourceIndexes: [0],
      duplicateOverrideSourceIndexes: [],
    });
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(64 * 1024);

    const res = await buildCertDrillApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(res.status).toBe(200);
    expect(certDrillAdminService.importQuestions).toHaveBeenCalledTimes(1);
  });

  it("rejects an import payload above the transport cap from its content-length header", async () => {
    const res = await buildCertDrillApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(QUESTION_IMPORT_MAX_RAW_BODY_BYTES + 1),
      },
      body: JSON.stringify({ certificationId, document: buildImportDocument(1024) }),
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(certDrillAdminService.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects a streamed import payload above the transport cap before the route parses it", async () => {
    const body = JSON.stringify({
      certificationId,
      document: buildImportDocument(QUESTION_IMPORT_MAX_RAW_BODY_BYTES),
    });
    expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(QUESTION_IMPORT_MAX_RAW_BODY_BYTES);

    const res = await buildCertDrillApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    expect(res.status).toBe(413);
    await expect(res.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(certDrillAdminService.importQuestions).not.toHaveBeenCalled();
  });

  it("keeps the default JSON cap for other CertDrill admin routes", async () => {
    const res = await buildCertDrillApp().request("/api/admin/certdrill/questions", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(70 * 1024) },
      body: JSON.stringify({ certificationId, stem: "Question?" }),
    });

    expect(res.status).toBe(413);
    expect(certDrillAdminService.createQuestion).not.toHaveBeenCalled();
  });

  it("configures admin-appropriate rate limits for both import endpoints", () => {
    expect(questionImportRateLimits()).toEqual({
      "/api/admin/certdrill/questions/import": { windowMs: 60_000, max: 10 },
      "/api/admin/certdrill/questions/import/preview": { windowMs: 60_000, max: 30 },
    });
  });

  it("rate limits repeated confirm imports from one client", async () => {
    certDrillAdminService.importQuestions.mockResolvedValue({ importedCount: 0, questionIds: [] });
    const app = buildCertDrillApp();
    const body = JSON.stringify({
      certificationId,
      document: buildImportDocument(16),
      previewDocumentHash,
      selectedSourceIndexes: [0],
      duplicateOverrideSourceIndexes: [],
    });
    const send = () => app.request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    const confirmLimit = questionImportRateLimits()["/api/admin/certdrill/questions/import"].max;
    for (let attempt = 0; attempt < confirmLimit; attempt += 1) {
      expect((await send()).status).toBe(200);
    }

    const limited = await send();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBeTruthy();
    await expect(limited.json()).resolves.toMatchObject({
      success: false,
      error: { code: "RATE_LIMITED" },
    });
    expect(certDrillAdminService.importQuestions).toHaveBeenCalledTimes(confirmLimit);
  });

  it("rate limits repeated preview requests from one client above the confirm allowance", async () => {
    certDrillAdminService.previewQuestionImport.mockResolvedValue({ documentHash: previewDocumentHash });
    const app = buildCertDrillApp();
    const body = JSON.stringify({ certificationId, document: buildImportDocument(16) });
    const send = () => app.request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });

    const previewLimit = questionImportRateLimits()["/api/admin/certdrill/questions/import/preview"].max;
    expect(previewLimit).toBeGreaterThan(questionImportRateLimits()["/api/admin/certdrill/questions/import"].max);

    for (let attempt = 0; attempt < previewLimit; attempt += 1) {
      expect((await send()).status).toBe(200);
    }

    expect((await send()).status).toBe(429);
    expect(certDrillAdminService.previewQuestionImport).toHaveBeenCalledTimes(previewLimit);
  });
});
