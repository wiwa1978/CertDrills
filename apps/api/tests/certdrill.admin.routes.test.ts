import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CertDrillAdminServiceError } from "../src/modules/certdrill/admin-service";
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
  listQuestions: vi.fn(),
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  publishQuestion: vi.fn(),
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

    const body = { certificationId, categoryId, stem: "Question?", difficulty: "medium", options: [] };
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
