import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VALIDATION_DETAILS, TRUNCATED_VALIDATION_DETAILS_MESSAGE, UNKNOWN_FIELD_VALIDATION_MESSAGE } from "../src/lib/http";
import { CertDrillAdminServiceError } from "../src/modules/certdrill/admin-service";
import {
  QUESTION_IMPORT_MAX_DOCUMENT_BYTES,
  QUESTION_IMPORT_MAX_RAW_BODY_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
} from "../src/modules/certdrill/question-import";
import { QuestionImportServiceError } from "../src/modules/certdrill/question-import-service";
import { createCertDrillAdminRouter } from "../src/modules/certdrill/routes";

const certificationId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const examFormId = "55555555-5555-4555-8555-555555555555";
const resourceId = "66666666-6666-4666-8666-666666666666";
const feedbackId = "77777777-7777-4777-8777-777777777777";

const service = {
  listCertifications: vi.fn(),
  createCertification: vi.fn(),
  updateCertification: vi.fn(),
  archiveCertification: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  listQuestionIndex: vi.fn(),
  listQuestions: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  publishQuestion: vi.fn(),
  previewQuestionImport: vi.fn(),
  importQuestions: vi.fn(),
  listExamForms: vi.fn(),
  createExamForm: vi.fn(),
  updateExamForm: vi.fn(),
  listResources: vi.fn(),
  createResource: vi.fn(),
  updateResource: vi.fn(),
  createMockGenerationJob: vi.fn(),
  listQuestionFeedbackForAdmin: vi.fn(),
  updateQuestionFeedback: vi.fn(),
};

function createApp() {
  const app = new Hono();
  app.route("/api/admin/certdrill", createCertDrillAdminRouter({ service: service as never }));
  return app;
}

describe("CertDrill admin routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates certification create/list/update requests", async () => {
    service.createCertification.mockResolvedValueOnce({ id: certificationId });
    service.listCertifications.mockResolvedValueOnce([{ id: certificationId }]);
    service.updateCertification.mockResolvedValueOnce({ id: certificationId, name: "Updated" });

    const createBody = { code: "AWS-SAA-C03", name: "AWS Architect", vendor: "AWS", questionCountDefault: 65, passThresholdPct: 72 };
    const createResponse = await createApp().request("/api/admin/certdrill/certifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const listResponse = await createApp().request("/api/admin/certdrill/certifications");
    const updateResponse = await createApp().request(`/api/admin/certdrill/certifications/${certificationId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });

    expect(createResponse.status).toBe(200);
    expect(listResponse.status).toBe(200);
    expect(updateResponse.status).toBe(200);
    expect(service.createCertification).toHaveBeenCalledWith(createBody);
    expect(service.listCertifications).toHaveBeenCalledWith();
    expect(service.updateCertification).toHaveBeenCalledWith(certificationId, { name: "Updated" });
  });

  it("delegates certification archive requests", async () => {
    service.archiveCertification.mockResolvedValueOnce({ id: certificationId, archivedAt: "2026-07-28T12:00:00.000Z" });

    const response = await createApp().request(`/api/admin/certdrill/certifications/${certificationId}/archive`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(service.archiveCertification).toHaveBeenCalledWith(certificationId);
  });

  it("delegates category create/list/update requests", async () => {
    service.createCategory.mockResolvedValueOnce({ id: categoryId });
    service.listCategories.mockResolvedValueOnce([{ id: categoryId }]);
    service.updateCategory.mockResolvedValueOnce({ id: categoryId });

    await createApp().request("/api/admin/certdrill/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, code: "D1", name: "Domain 1", weightPct: "100.00" }),
    });
    await createApp().request(`/api/admin/certdrill/certifications/${certificationId}/categories`);
    await createApp().request(`/api/admin/certdrill/categories/${categoryId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Domain 1 updated" }),
    });

    expect(service.createCategory).toHaveBeenCalledWith({ certificationId, code: "D1", name: "Domain 1", weightPct: "100.00" });
    expect(service.listCategories).toHaveBeenCalledWith(certificationId);
    expect(service.updateCategory).toHaveBeenCalledWith(categoryId, { name: "Domain 1 updated" });
  });

  it("delegates question create/update/publish requests", async () => {
    service.createQuestion.mockResolvedValueOnce({ id: questionId });
    service.updateQuestion.mockResolvedValueOnce({ id: questionId });
    service.publishQuestion.mockResolvedValueOnce({ id: questionId, status: "published" });

    const body = {
      certificationId,
      categoryId,
      stem: "Question?",
      difficulty: "medium",
      options: [
        { text: "Correct answer", isCorrect: true },
        { text: "Incorrect answer", isCorrect: false },
      ],
    };
    await createApp().request("/api/admin/certdrill/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await createApp().request(`/api/admin/certdrill/questions/${questionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stem: "Updated?" }),
    });
    const publishResponse = await createApp().request(`/api/admin/certdrill/questions/${questionId}/publish`, { method: "POST" });

    expect(publishResponse.status).toBe(200);
    expect(service.createQuestion).toHaveBeenCalledWith(body);
    expect(service.updateQuestion).toHaveBeenCalledWith(questionId, { stem: "Updated?" });
    expect(service.publishQuestion).toHaveBeenCalledWith(questionId);
  });

  it("delegates question index requests with supported query filters", async () => {
    const questionIndexResult = {
      query: {
        search: "zero trust",
        certificationId,
        categoryId,
        status: "published",
        difficulty: "hard",
        sort: "stem-desc",
        page: 3,
      },
      items: [],
      filterOptions: {
        certifications: [],
        categories: [],
      },
      pagination: {
        page: 3,
        pageSize: 50,
        pageCount: 1,
        totalItems: 0,
      },
    };
    service.listQuestionIndex.mockResolvedValueOnce(questionIndexResult);

    const response = await createApp().request(
      `/api/admin/certdrill/questions?search=zero%20trust&certificationId=${certificationId}&categoryId=${categoryId}&status=published&difficulty=hard&sort=stem-desc&page=3`,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: questionIndexResult });
    expect(service.listQuestionIndex).toHaveBeenCalledWith({
      search: "zero trust",
      certificationId,
      categoryId,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: "3",
    });
  });

  it("does not reject invalid question index query values before service normalization", async () => {
    const questionIndexResult = {
      query: {
        search: "zero trust",
        certificationId: undefined,
        categoryId: undefined,
        status: undefined,
        difficulty: undefined,
        sort: "stem-asc",
        page: 1,
      },
      items: [],
      filterOptions: {
        certifications: [],
        categories: [],
      },
      pagination: {
        page: 1,
        pageSize: 50,
        pageCount: 1,
        totalItems: 0,
      },
    };
    service.listQuestionIndex.mockResolvedValueOnce(questionIndexResult);

    const response = await createApp().request(
      "/api/admin/certdrill/questions?search=%20%20zero%20trust%20%20&certificationId=invalid&categoryId=also-invalid&status=review&difficulty=expert&sort=newest&page=0",
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: questionIndexResult });
    expect(service.listQuestionIndex).toHaveBeenCalledWith({
      search: "  zero trust  ",
      certificationId: "invalid",
      categoryId: "also-invalid",
      status: "review",
      difficulty: "expert",
      sort: "newest",
      page: "0",
    });
  });

  it("rejects unsafe option citation URL schemes before question delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId,
        categoryId,
        stem: "Question?",
        options: [
          { text: "Unsafe", isCorrect: true, explanation: "No", citationUrls: ["javascript:alert(1)"] },
        ],
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createQuestion).not.toHaveBeenCalled();
  });

  it("delegates exam form, resource, and mock generation requests", async () => {
    service.createExamForm.mockResolvedValueOnce({ id: examFormId });
    service.listExamForms.mockResolvedValueOnce([{ id: examFormId }]);
    service.updateExamForm.mockResolvedValueOnce({ id: examFormId });
    service.createResource.mockResolvedValueOnce({ id: resourceId });
    service.listResources.mockResolvedValueOnce([{ id: resourceId }]);
    service.updateResource.mockResolvedValueOnce({ id: resourceId });
    service.createMockGenerationJob.mockResolvedValueOnce({ job: { id: "job-1" }, generatedQuestions: [] });

    await createApp().request("/api/admin/certdrill/exam-forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, name: "Form A", questionIds: [questionId] }),
    });
    await createApp().request(`/api/admin/certdrill/certifications/${certificationId}/exam-forms`);
    await createApp().request(`/api/admin/certdrill/exam-forms/${examFormId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: false }),
    });
    await createApp().request("/api/admin/certdrill/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content" }),
    });
    await createApp().request(`/api/admin/certdrill/certifications/${certificationId}/resources`);
    await createApp().request(`/api/admin/certdrill/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    await createApp().request("/api/admin/certdrill/generation-jobs/mock", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, categoryId, prompt: "Prompt", topic: "Topic", requestedCount: 1 }),
    });

    expect(service.createExamForm).toHaveBeenCalledWith({ certificationId, name: "Form A", questionIds: [questionId] });
    expect(service.listExamForms).toHaveBeenCalledWith(certificationId);
    expect(service.updateExamForm).toHaveBeenCalledWith(examFormId, { isActive: false });
    expect(service.createResource).toHaveBeenCalledWith({ certificationId, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content" });
    expect(service.listResources).toHaveBeenCalledWith(certificationId);
    expect(service.updateResource).toHaveBeenCalledWith(resourceId, { title: "Updated" });
    expect(service.createMockGenerationJob).toHaveBeenCalledWith({ certificationId, categoryId, prompt: "Prompt", topic: "Topic", requestedCount: 1 });
  });

  it("delegates question feedback list requests", async () => {
    const feedback = [{ id: "abababab-abab-4aba-8aba-abababababab", questionId, rating: 2, status: "open" }];
    service.listQuestionFeedbackForAdmin.mockResolvedValueOnce(feedback);

    const response = await createApp().request("/api/admin/certdrill/question-feedback");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: feedback });
    expect(service.listQuestionFeedbackForAdmin).toHaveBeenCalledWith();
  });

  it("delegates question feedback status update requests", async () => {
    service.updateQuestionFeedback.mockResolvedValueOnce({ id: feedbackId, status: "reviewed" });

    const response = await createApp().request(`/api/admin/certdrill/question-feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { id: feedbackId, status: "reviewed" } });
    expect(service.updateQuestionFeedback).toHaveBeenCalledWith(feedbackId, { status: "reviewed" });
  });

  it("rejects invalid question feedback status updates before delegation", async () => {
    const response = await createApp().request(`/api/admin/certdrill/question-feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });

    expect(response.status).toBe(400);
    expect(service.updateQuestionFeedback).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/certifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Missing code" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid certification payload",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "code", message: "Code is required." }),
          expect.objectContaining({ path: "vendor", message: "Vendor is required." }),
        ]),
      },
    });
    expect(service.createCertification).not.toHaveBeenCalled();
  });

  it("rejects invalid UUID and URL fields before delegation", async () => {
    const categoryResponse = await createApp().request("/api/admin/certdrill/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId: "not-a-uuid", code: "D1", name: "Domain 1", weightPct: "100.00" }),
    });
    const resourceResponse = await createApp().request("/api/admin/certdrill/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, url: "not-a-url", title: "Docs", sourceType: "doc", contentMode: "deep_content" }),
    });

    expect(categoryResponse.status).toBe(400);
    expect(resourceResponse.status).toBe(400);
    await expect(categoryResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid category payload",
        details: [expect.objectContaining({ path: "certificationId", message: "Certification ID must be a valid UUID." })],
      },
    });
    await expect(resourceResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid resource payload",
        details: [expect.objectContaining({ path: "url", message: "Resource URL must be a valid URL." })],
      },
    });
    expect(service.createCategory).not.toHaveBeenCalled();
    expect(service.createResource).not.toHaveBeenCalled();
  });

  it("rejects invalid UUID path params before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/certifications/not-a-uuid/categories");

    expect(response.status).toBe(400);
    expect(service.listCategories).not.toHaveBeenCalled();
  });

  it("returns admin service validation errors in the shared error envelope", async () => {
    service.createCategory.mockRejectedValueOnce(new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS",
      "Sibling category weights must not exceed 100. Current total: 105.",
    ));

    const response = await createApp().request("/api/admin/certdrill/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, code: "D1", name: "Domain 1", weightPct: "105.00" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS",
        message: "Sibling category weights must not exceed 100. Current total: 105.",
      },
    });
  });
});

describe("CertDrill admin question import routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPreviewBody = {
    certificationId,
    document: { version: 1, questions: [] },
  };

  const previewDocumentHash = "a".repeat(64);

  const validConfirmBody = {
    ...validPreviewBody,
    previewDocumentHash,
    selectedSourceIndexes: [0],
    duplicateOverrideSourceIndexes: [],
  };

  // Builds a raw confirm body whose named index array holds `length` out-of-range entries, without
  // materializing the array in the test. Every entry is invalid, so an unbounded route would emit
  // one Zod issue and one response detail per entry.
  function confirmBodyWithIndexArray(field: "selectedSourceIndexes" | "duplicateOverrideSourceIndexes", length: number) {
    const hostileArray = `[${"-1,".repeat(length).slice(0, -1)}]`;
    const selected = field === "selectedSourceIndexes" ? hostileArray : "[0]";
    const overrides = field === "duplicateOverrideSourceIndexes" ? hostileArray : "[]";

    return `{"certificationId":"${certificationId}","document":{"version":1,"questions":[]}`
      + `,"previewDocumentHash":"${previewDocumentHash}"`
      + `,"selectedSourceIndexes":${selected},"duplicateOverrideSourceIndexes":${overrides}}`;
  }

  it("delegates preview requests to the service and returns its result", async () => {
    const previewResult = {
      documentVersion: 1,
      documentHash: previewDocumentHash,
      totals: { submitted: 1, valid: 1, invalid: 0, duplicateExisting: 0, duplicateBatch: 0, selectedByDefault: 1 },
      rows: [],
    };
    service.previewQuestionImport.mockResolvedValueOnce(previewResult);

    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPreviewBody),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: previewResult });
    expect(service.previewQuestionImport).toHaveBeenCalledWith(validPreviewBody);
  });

  it("delegates confirm requests to the service and returns its result", async () => {
    const importResult = { importedCount: 1, questionIds: ["10000000-0000-4100-8100-000000000001"] };
    service.importQuestions.mockResolvedValueOnce(importResult);

    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validConfirmBody),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: importResult });
    expect(service.importQuestions).toHaveBeenCalledWith(validConfirmBody);
  });

  it("rejects preview requests missing required fields before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ document: { version: 1, questions: [] } }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid question import preview payload",
        details: expect.arrayContaining([expect.objectContaining({ path: "certificationId" })]),
      },
    });
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects question import requests missing document before delegation", async () => {
    const previewResponse = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId }),
    });
    const confirmResponse = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId,
        previewDocumentHash,
        selectedSourceIndexes: [0],
        duplicateOverrideSourceIndexes: [],
      }),
    });

    expect(previewResponse.status).toBe(400);
    await expect(previewResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid question import preview payload",
        details: expect.arrayContaining([expect.objectContaining({ path: "document" })]),
      },
    });

    expect(confirmResponse.status).toBe(400);
    await expect(confirmResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid question import payload",
        details: expect.arrayContaining([expect.objectContaining({ path: "document" })]),
      },
    });

    expect(service.previewQuestionImport).not.toHaveBeenCalled();
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects preview requests with unexpected top-level fields before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPreviewBody, extra: "not-allowed" }),
    });

    expect(response.status).toBe(400);
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not valid json",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_FAILED" },
    });
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects an empty selectedSourceIndexes array before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validConfirmBody, selectedSourceIndexes: [] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid question import payload" },
    });
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects out-of-range source indexes before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validConfirmBody, selectedSourceIndexes: [QUESTION_IMPORT_MAX_ROWS] }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "VALIDATION_FAILED", message: "Invalid question import payload" },
    });
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects a duplicateOverrideSourceIndexes array longer than the row cap", async () => {
    const tooMany = Array.from({ length: QUESTION_IMPORT_MAX_ROWS + 1 }, (_, index) => index % QUESTION_IMPORT_MAX_ROWS);

    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validConfirmBody, duplicateOverrideSourceIndexes: tooMany }),
    });

    expect(response.status).toBe(400);
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("accepts confirm requests filling the row cap without truncating the submitted indexes", async () => {
    const importResult = { importedCount: QUESTION_IMPORT_MAX_ROWS, questionIds: [] };
    service.importQuestions.mockResolvedValueOnce(importResult);
    const allIndexes = Array.from({ length: QUESTION_IMPORT_MAX_ROWS }, (_, index) => index);
    const body = { ...validConfirmBody, selectedSourceIndexes: allIndexes, duplicateOverrideSourceIndexes: allIndexes };

    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(service.importQuestions).toHaveBeenCalledWith(body);
  });

  it("bounds validation of a huge selectedSourceIndexes array under the transport cap", async () => {
    const body = confirmBodyWithIndexArray("selectedSourceIndexes", 1_500_000);
    expect(body.length).toBeLessThan(QUESTION_IMPORT_MAX_RAW_BODY_BYTES);

    const startedAt = Date.now();
    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const responseText = await response.text();
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(400);
    // A 5 MiB body must never buy an unbounded amount of validation work or an unbounded response.
    expect(elapsedMs).toBeLessThan(5_000);
    expect(responseText.length).toBeLessThan(8 * 1024);

    const payload = JSON.parse(responseText);
    expect(payload.error.code).toBe("VALIDATION_FAILED");
    expect(payload.error.message).toBe("Invalid question import payload");
    expect(payload.error.details.length).toBe(MAX_VALIDATION_DETAILS + 1);
    expect(payload.error.details.at(-1)).toEqual({
      path: "body",
      message: TRUNCATED_VALIDATION_DETAILS_MESSAGE,
      code: "custom",
    });
    expect(service.importQuestions).not.toHaveBeenCalled();
  }, 30_000);

  it("bounds validation of a huge duplicateOverrideSourceIndexes array under the transport cap", async () => {
    const body = confirmBodyWithIndexArray("duplicateOverrideSourceIndexes", 1_500_000);
    expect(body.length).toBeLessThan(QUESTION_IMPORT_MAX_RAW_BODY_BYTES);

    const startedAt = Date.now();
    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const responseText = await response.text();
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(400);
    expect(elapsedMs).toBeLessThan(5_000);
    expect(responseText.length).toBeLessThan(8 * 1024);

    const payload = JSON.parse(responseText);
    expect(payload.error.details.length).toBe(MAX_VALIDATION_DETAILS + 1);
    for (const detail of payload.error.details.slice(0, MAX_VALIDATION_DETAILS)) {
      expect(detail.path).toMatch(/^duplicateOverrideSourceIndexes(\.\d+)?$/);
    }
    expect(payload.error.details.at(-1)).toEqual({
      path: "body",
      message: TRUNCATED_VALIDATION_DETAILS_MESSAGE,
      code: "custom",
    });
    expect(service.importQuestions).not.toHaveBeenCalled();
  }, 30_000);

  it("bounds validation details for a body carrying a huge number of unknown keys", async () => {
    const unknownKeys: Record<string, number> = {};
    for (let index = 0; index < 50_000; index += 1) {
      unknownKeys[`unknownKey${index}`] = index;
    }

    const startedAt = Date.now();
    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPreviewBody, ...unknownKeys }),
    });
    const responseText = await response.text();
    const elapsedMs = Date.now() - startedAt;

    expect(response.status).toBe(400);
    expect(elapsedMs).toBeLessThan(5_000);
    // Zod packs every unknown key into one issue whose message lists them all; the response must
    // not echo that list back.
    expect(responseText.length).toBeLessThan(8 * 1024);
    expect(responseText).not.toContain("unknownKey49999");

    const payload = JSON.parse(responseText);
    expect(payload.error.details.length).toBe(MAX_VALIDATION_DETAILS + 1);
    expect(payload.error.details[0]).toEqual({
      path: "unknownKey0",
      message: UNKNOWN_FIELD_VALIDATION_MESSAGE,
      code: "unrecognized_keys",
    });
    expect(payload.error.details.at(-1)).toEqual({
      path: "body",
      message: TRUNCATED_VALIDATION_DETAILS_MESSAGE,
      code: "custom",
    });
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  }, 30_000);

  it("rejects a malformed previewDocumentHash before delegation", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validConfirmBody, previewDocumentHash: "not-a-hash" }),
    });

    expect(response.status).toBe(400);
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects a request whose total body exceeds the transport size limit", async () => {
    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(6 * 1024 * 1024) },
      body: JSON.stringify(validPreviewBody),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects a request whose serialized document exceeds 5 MiB", async () => {
    const oversizedDocument = { version: 1, note: "a".repeat(QUESTION_IMPORT_MAX_DOCUMENT_BYTES + 1024) };

    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, document: oversizedDocument }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: { code: "PAYLOAD_TOO_LARGE" },
    });
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("maps a question import conflict to a typed 409 with refreshed preview details", async () => {
    const refreshedPreview = {
      documentVersion: 1,
      documentHash: "b".repeat(64),
      totals: { submitted: 1, valid: 1, invalid: 0, duplicateExisting: 1, duplicateBatch: 0, selectedByDefault: 0 },
      rows: [{ sourceIndex: 0, valid: true, duplicate: { existingQuestionIds: ["q-1"], earlierSourceIndexes: [] } }],
    };
    service.importQuestions.mockRejectedValueOnce(new QuestionImportServiceError(
      "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
      "Question import selection no longer matches the current preview. Review the refreshed preview.",
      refreshedPreview,
    ));

    const response = await createApp().request("/api/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validConfirmBody),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT",
        message: "Question import selection no longer matches the current preview. Review the refreshed preview.",
        details: refreshedPreview,
      },
    });
  });

  it("maps an invalid question import document error to a 400 with issue details", async () => {
    const issues = [{ field: "version", message: "Unsupported document version." }];
    service.previewQuestionImport.mockRejectedValueOnce(new QuestionImportServiceError(
      "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
      "Question import document is invalid.",
      issues,
    ));

    const response = await createApp().request("/api/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validPreviewBody),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_INVALID_QUESTION_IMPORT",
        message: "Question import document is invalid.",
        details: issues,
      },
    });
  });
});
