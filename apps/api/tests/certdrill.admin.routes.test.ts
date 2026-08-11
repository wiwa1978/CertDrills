import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_VALIDATION_DETAILS, TRUNCATED_VALIDATION_DETAILS_MESSAGE, UNKNOWN_FIELD_VALIDATION_MESSAGE } from "../src/lib/http";
import { CertDrillAdminServiceError, type createCertDrillAdminService } from "../src/product/certdrill/admin-service";
import {
  QUESTION_IMPORT_MAX_DOCUMENT_BYTES,
  QUESTION_IMPORT_MAX_DOCUMENT_NESTING,
  QUESTION_IMPORT_MAX_RAW_BODY_BYTES,
  QUESTION_IMPORT_MAX_ROWS,
} from "../src/product/certdrill/question-import";
import { QuestionImportServiceError } from "../src/product/certdrill/question-import-service";
import { createCertDrillAdminRouter } from "../src/product/certdrill/routes";

const certificationId = "22222222-2222-4222-8222-222222222222";
const categoryId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const otherQuestionId = "45454545-4545-4454-8454-454545454545";
const examFormId = "55555555-5555-4555-8555-555555555555";
const resourceId = "66666666-6666-4666-8666-666666666666";
const feedbackId = "77777777-7777-4777-8777-777777777777";
const blueprintParseRunId = "88888888-8888-4888-8888-888888888889";
const generationJobId = "99999999-9999-4999-8999-999999999999";
const scenarioId = "12121212-1212-4212-8212-121212121212";
const userId = "13131313-1313-4313-8313-131313131313";

type CertDrillAdminService = ReturnType<typeof createCertDrillAdminService>;
type MockedCertDrillAdminService = {
  [K in keyof CertDrillAdminService]: CertDrillAdminService[K] extends (...args: any[]) => any
    ? ReturnType<typeof vi.fn<CertDrillAdminService[K]>>
    : never;
};

const service = {
  listCertifications: vi.fn<CertDrillAdminService["listCertifications"]>(),
  listVendors: vi.fn<CertDrillAdminService["listVendors"]>(),
  createCertification: vi.fn<CertDrillAdminService["createCertification"]>(),
  updateCertification: vi.fn<CertDrillAdminService["updateCertification"]>(),
  archiveCertification: vi.fn<CertDrillAdminService["archiveCertification"]>(),
  listCategories: vi.fn<CertDrillAdminService["listCategories"]>(),
  createCategory: vi.fn<CertDrillAdminService["createCategory"]>(),
  updateCategory: vi.fn<CertDrillAdminService["updateCategory"]>(),
  archiveCategory: vi.fn<CertDrillAdminService["archiveCategory"]>(),
  listQuestionIndex: vi.fn<CertDrillAdminService["listQuestionIndex"]>(),
  listQuestions: vi.fn<CertDrillAdminService["listQuestions"]>(),
  createQuestion: vi.fn<CertDrillAdminService["createQuestion"]>(),
  updateQuestion: vi.fn<CertDrillAdminService["updateQuestion"]>(),
  publishQuestion: vi.fn<CertDrillAdminService["publishQuestion"]>(),
  updateQuestionStatuses: vi.fn<CertDrillAdminService["updateQuestionStatuses"]>(),
  updateQuestionDeliveryPurposes: vi.fn<CertDrillAdminService["updateQuestionDeliveryPurposes"]>(),
  previewQuestionImport: vi.fn<CertDrillAdminService["previewQuestionImport"]>(),
  importQuestions: vi.fn<CertDrillAdminService["importQuestions"]>(),
  startCategoryDiscovery: vi.fn<CertDrillAdminService["startCategoryDiscovery"]>(),
  getBlueprintParseRun: vi.fn<CertDrillAdminService["getBlueprintParseRun"]>(),
  listBlueprintParseRuns: vi.fn<CertDrillAdminService["listBlueprintParseRuns"]>(),
  processPendingBlueprintParseRuns: vi.fn<CertDrillAdminService["processPendingBlueprintParseRuns"]>(),
  startQuestionGeneration: vi.fn<CertDrillAdminService["startQuestionGeneration"]>(),
  getQuestionGenerationJob: vi.fn<CertDrillAdminService["getQuestionGenerationJob"]>(),
  listQuestionGenerationJobs: vi.fn<CertDrillAdminService["listQuestionGenerationJobs"]>(),
  processPendingQuestionGenerationJobs: vi.fn<CertDrillAdminService["processPendingQuestionGenerationJobs"]>(),
  startScenarioGeneration: vi.fn<CertDrillAdminService["startScenarioGeneration"]>(),
  getScenarioGenerationJob: vi.fn<CertDrillAdminService["getScenarioGenerationJob"]>(),
  listScenarioGenerationJobs: vi.fn<CertDrillAdminService["listScenarioGenerationJobs"]>(),
  processPendingScenarioGenerationJobs: vi.fn<CertDrillAdminService["processPendingScenarioGenerationJobs"]>(),
  listScenarios: vi.fn<CertDrillAdminService["listScenarios"]>(),
  createScenario: vi.fn<CertDrillAdminService["createScenario"]>(),
  updateScenario: vi.fn<CertDrillAdminService["updateScenario"]>(),
  archiveScenario: vi.fn<CertDrillAdminService["archiveScenario"]>(),
  validateScenario: vi.fn<CertDrillAdminService["validateScenario"]>(),
  publishScenario: vi.fn<CertDrillAdminService["publishScenario"]>(),
  updateScenarioStatuses: vi.fn<CertDrillAdminService["updateScenarioStatuses"]>(),
  setExamFormScenarios: vi.fn<CertDrillAdminService["setExamFormScenarios"]>(),
  listExamForms: vi.fn<CertDrillAdminService["listExamForms"]>(),
  createExamForm: vi.fn<CertDrillAdminService["createExamForm"]>(),
  getExamForm: vi.fn<CertDrillAdminService["getExamForm"]>(),
  updateExamFormMetadata: vi.fn<CertDrillAdminService["updateExamFormMetadata"]>(),
  regenerateExamForm: vi.fn<CertDrillAdminService["regenerateExamForm"]>(),
  replaceExamFormQuestion: vi.fn<CertDrillAdminService["replaceExamFormQuestion"]>(),
  setExamFormActive: vi.fn<CertDrillAdminService["setExamFormActive"]>(),
  listResources: vi.fn<CertDrillAdminService["listResources"]>(),
  createResource: vi.fn<CertDrillAdminService["createResource"]>(),
  updateResource: vi.fn<CertDrillAdminService["updateResource"]>(),
  ingestResource: vi.fn<CertDrillAdminService["ingestResource"]>(),
  listQuestionFeedbackForAdmin: vi.fn<CertDrillAdminService["listQuestionFeedbackForAdmin"]>(),
  resetUserProgress: vi.fn<CertDrillAdminService["resetUserProgress"]>(),
  updateQuestionFeedback: vi.fn<CertDrillAdminService["updateQuestionFeedback"]>(),
} satisfies MockedCertDrillAdminService;

function createApp() {
  const app = new Hono();
  app.route("/admin/certdrill", createCertDrillAdminRouter({ service }));
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
    const createResponse = await createApp().request("/admin/certdrill/certifications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(createBody),
    });
    const listResponse = await createApp().request("/admin/certdrill/certifications");
    const updateResponse = await createApp().request(`/admin/certdrill/certifications/${certificationId}`, {
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

    const response = await createApp().request(`/admin/certdrill/certifications/${certificationId}/archive`, { method: "POST" });

    expect(response.status).toBe(200);
    expect(service.archiveCertification).toHaveBeenCalledWith(certificationId);
  });

  it("delegates category create/list/update requests", async () => {
    service.createCategory.mockResolvedValueOnce({ id: categoryId });
    service.listCategories.mockResolvedValueOnce([{ id: categoryId }]);
    service.updateCategory.mockResolvedValueOnce({ id: categoryId });

    await createApp().request("/admin/certdrill/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, code: "D1", name: "Domain 1", weightPct: "100.00" }),
    });
    await createApp().request(`/admin/certdrill/certifications/${certificationId}/categories`);
    await createApp().request(`/admin/certdrill/categories/${categoryId}`, {
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
    service.updateQuestionStatuses.mockResolvedValueOnce([
      { id: questionId, status: "published" },
      { id: otherQuestionId, status: "published" },
    ]);
    service.updateQuestionDeliveryPurposes.mockResolvedValueOnce([
      { id: questionId, deliveryPurpose: "assessment" },
      { id: otherQuestionId, deliveryPurpose: "assessment" },
    ]);

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
    await createApp().request("/admin/certdrill/questions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    await createApp().request(`/admin/certdrill/questions/${questionId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stem: "Updated?" }),
    });
    const publishResponse = await createApp().request(`/admin/certdrill/questions/${questionId}/publish`, { method: "POST" });
    const bulkResponse = await createApp().request("/admin/certdrill/questions/status", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionIds: [questionId, otherQuestionId], status: "published" }),
    });
    const bulkPurposeResponse = await createApp().request("/admin/certdrill/questions/delivery-purpose", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionIds: [questionId, otherQuestionId], deliveryPurpose: "assessment" }),
    });

    expect(publishResponse.status).toBe(200);
    expect(bulkResponse.status).toBe(200);
    expect(bulkPurposeResponse.status).toBe(200);
    expect(service.createQuestion).toHaveBeenCalledWith(body);
    expect(service.updateQuestion).toHaveBeenCalledWith(questionId, { stem: "Updated?" });
    expect(service.publishQuestion).toHaveBeenCalledWith(questionId);
    expect(service.updateQuestionStatuses).toHaveBeenCalledWith({ questionIds: [questionId, otherQuestionId], status: "published" });
    expect(service.updateQuestionDeliveryPurposes).toHaveBeenCalledWith({ questionIds: [questionId, otherQuestionId], deliveryPurpose: "assessment" });
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
      `/admin/certdrill/questions?search=zero%20trust&certificationId=${certificationId}&categoryId=${categoryId}&status=published&difficulty=hard&sort=stem-desc&page=3`,
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
      "/admin/certdrill/questions?search=%20%20zero%20trust%20%20&certificationId=invalid&categoryId=also-invalid&status=review&difficulty=expert&sort=newest&page=0",
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
    const response = await createApp().request("/admin/certdrill/questions", {
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

  it("delegates focused exam form requests", async () => {
    service.createExamForm.mockResolvedValueOnce({ id: examFormId });
    service.listExamForms.mockResolvedValueOnce([{ id: examFormId }]);
    service.getExamForm.mockResolvedValueOnce({ id: examFormId });
    service.updateExamFormMetadata.mockResolvedValueOnce({ id: examFormId });
    service.regenerateExamForm.mockResolvedValueOnce({ id: examFormId });
    service.replaceExamFormQuestion.mockResolvedValueOnce({ id: examFormId });
    service.setExamFormActive.mockResolvedValueOnce({ id: examFormId });

    const createPayload = { certificationId, name: "Form A", durationMinutes: 120, targetQuestionCount: 60 };
    const regeneratePayload = { targetQuestionCount: 50, expectedAssignmentVersion: 2 };
    const replacePayload = { currentQuestionId: questionId, replacementQuestionId: otherQuestionId, expectedAssignmentVersion: 2 };

    await createApp().request("/admin/certdrill/exam-forms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createPayload) });
    await createApp().request(`/admin/certdrill/certifications/${certificationId}/exam-forms`);
    await createApp().request(`/admin/certdrill/exam-forms/${examFormId}`);
    await createApp().request(`/admin/certdrill/exam-forms/${examFormId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "Form B", durationMinutes: 90 }) });
    await createApp().request(`/admin/certdrill/exam-forms/${examFormId}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(regeneratePayload) });
    await createApp().request(`/admin/certdrill/exam-forms/${examFormId}/questions/replace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(replacePayload) });
    await createApp().request(`/admin/certdrill/exam-forms/${examFormId}/activation`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: true }) });

    expect(service.createExamForm).toHaveBeenCalledWith(createPayload);
    expect(service.listExamForms).toHaveBeenCalledWith(certificationId);
    expect(service.getExamForm).toHaveBeenCalledWith(examFormId);
    expect(service.updateExamFormMetadata).toHaveBeenCalledWith(examFormId, { name: "Form B", durationMinutes: 90 });
    expect(service.regenerateExamForm).toHaveBeenCalledWith(examFormId, regeneratePayload);
    expect(service.replaceExamFormQuestion).toHaveBeenCalledWith(examFormId, replacePayload);
    expect(service.setExamFormActive).toHaveBeenCalledWith(examFormId, true);
  });

  it("delegates scenario CRUD, validation, and exam form assignment", async () => {
    const contentJson = {
      initialNodeKey: "start",
      nodes: [{
        key: "start",
        title: "Start",
        situation: "Choose a response.",
        evidence: ["Signal"],
        options: [
          { key: "a", title: "A", description: "Action A", consequence: "Outcome A", nextNodeKey: null },
          { key: "b", title: "B", description: "Action B", consequence: "Outcome B", nextNodeKey: null },
        ],
      }],
    };
    const createPayload = { certificationId, title: "Incident", description: null, difficulty: "medium" as const, estimatedMinutes: 15, contentJson };
    const updatePayload = { title: "Updated incident", description: "Review", difficulty: "hard" as const, estimatedMinutes: 20, contentJson };
    service.listScenarios.mockResolvedValueOnce([{ id: scenarioId }]);
    service.createScenario.mockResolvedValueOnce({ id: scenarioId });
    service.updateScenario.mockResolvedValueOnce({ id: scenarioId });
    service.validateScenario.mockResolvedValueOnce({ id: scenarioId, status: "validated" });
    service.publishScenario.mockResolvedValueOnce({ id: scenarioId, status: "published" });
    service.updateScenarioStatuses.mockResolvedValueOnce([{ id: scenarioId, status: "draft" }]);
    service.setExamFormScenarios.mockResolvedValueOnce({ id: examFormId, scenarioIds: [scenarioId] });
    service.archiveScenario.mockResolvedValueOnce({ id: scenarioId, status: "archived" });

    const responses = await Promise.all([
      createApp().request(`/admin/certdrill/certifications/${certificationId}/scenarios`),
      createApp().request("/admin/certdrill/scenarios", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(createPayload) }),
      createApp().request(`/admin/certdrill/scenarios/${scenarioId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(updatePayload) }),
      createApp().request(`/admin/certdrill/scenarios/${scenarioId}/validate`, { method: "POST" }),
      createApp().request(`/admin/certdrill/scenarios/${scenarioId}/publish`, { method: "POST" }),
      createApp().request("/admin/certdrill/scenarios/status", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioIds: [scenarioId], status: "draft" }) }),
      createApp().request(`/admin/certdrill/exam-forms/${examFormId}/scenarios`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioIds: [scenarioId] }) }),
      createApp().request(`/admin/certdrill/scenarios/${scenarioId}/archive`, { method: "POST" }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 201, 200, 200, 200, 200, 200, 200]);
    expect(service.listScenarios).toHaveBeenCalledWith(certificationId);
    expect(service.createScenario).toHaveBeenCalledWith(createPayload);
    expect(service.updateScenario).toHaveBeenCalledWith(scenarioId, updatePayload);
    expect(service.validateScenario).toHaveBeenCalledWith(scenarioId);
    expect(service.publishScenario).toHaveBeenCalledWith(scenarioId);
    expect(service.updateScenarioStatuses).toHaveBeenCalledWith({ scenarioIds: [scenarioId], status: "draft" });
    expect(service.setExamFormScenarios).toHaveBeenCalledWith(examFormId, [scenarioId]);
    expect(service.archiveScenario).toHaveBeenCalledWith(scenarioId);
  });

  it("rejects invalid exam form payloads without delegation", async () => {
    const responses = await Promise.all([
      createApp().request("/admin/certdrill/exam-forms", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ certificationId: "bad", name: "", durationMinutes: 0, targetQuestionCount: -1 }) }),
      createApp().request(`/admin/certdrill/exam-forms/${examFormId}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetQuestionCount: 2.5, expectedAssignmentVersion: 0 }) }),
      createApp().request(`/admin/certdrill/exam-forms/${examFormId}/questions/replace`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ currentQuestionId: "bad", replacementQuestionId: otherQuestionId, expectedAssignmentVersion: 1 }) }),
    ]);
    expect(responses.map((response) => response.status)).toEqual([400, 400, 400]);
    expect(service.createExamForm).not.toHaveBeenCalled();
    expect(service.regenerateExamForm).not.toHaveBeenCalled();
    expect(service.replaceExamFormQuestion).not.toHaveBeenCalled();
  });

  it("maps assignment conflicts to 409", async () => {
    service.regenerateExamForm.mockRejectedValueOnce(new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_CONFLICT", "Reload"));
    const response = await createApp().request(`/admin/certdrill/exam-forms/${examFormId}/regenerate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetQuestionCount: 60, expectedAssignmentVersion: 2 }) });
    expect(response.status).toBe(409);
  });

  it("maps exam form not-found and active-question protection statuses", async () => {
    service.getExamForm.mockRejectedValueOnce(new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_NOT_FOUND", "Missing"));
    service.updateQuestion.mockRejectedValueOnce(new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE", "In use"));
    const [missing, inUse] = await Promise.all([
      createApp().request(`/admin/certdrill/exam-forms/${examFormId}`),
      createApp().request(`/admin/certdrill/questions/${questionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "archived" }) }),
    ]);
    expect(missing.status).toBe(404);
    expect(inUse.status).toBe(409);
  });

  it("delegates resource requests", async () => {
    service.createResource.mockResolvedValueOnce({ id: resourceId });
    service.listResources.mockResolvedValueOnce([{ id: resourceId }]);
    service.updateResource.mockResolvedValueOnce({ id: resourceId });
    service.ingestResource.mockResolvedValueOnce({ id: resourceId, status: "ingested" });
    await createApp().request("/admin/certdrill/resources", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content" }),
    });
    await createApp().request(`/admin/certdrill/certifications/${certificationId}/resources`);
    await createApp().request(`/admin/certdrill/resources/${resourceId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Updated" }),
    });
    const ingestResponse = await createApp().request(`/admin/certdrill/resources/${resourceId}/ingest`, { method: "POST" });

    expect(service.createResource).toHaveBeenCalledWith({ certificationId, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content" });
    expect(service.listResources).toHaveBeenCalledWith(certificationId);
    expect(service.updateResource).toHaveBeenCalledWith(resourceId, { title: "Updated" });
    expect(ingestResponse.status).toBe(200);
    expect(service.ingestResource).toHaveBeenCalledWith(resourceId);
  });

  it("starts and reads grounded question generation jobs", async () => {
    const job = { id: generationJobId, certificationId, categoryId, status: "pending" as const };
    service.startQuestionGeneration.mockResolvedValueOnce(job);
    service.listQuestionGenerationJobs.mockResolvedValueOnce([job]);
    service.getQuestionGenerationJob.mockResolvedValueOnce(job);
    const payload = {
      categoryId: null,
      resourceIds: [resourceId],
      sourceUrls: ["https://docs.example.com/guide"],
      requestedCount: 5,
      focus: "Identity",
      systemInstructions: "Use detailed answer choices.",
      instructions: null,
      questionTypes: ["single_choice", "fill_blank", "matching"],
      difficultyMix: { easy: 20, medium: 60, hard: 20 },
      deliveryPurpose: "assessment",
    };
    const startResponse = await createApp().request(`/admin/certdrill/certifications/${certificationId}/question-generation-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const [listResponse, detailResponse] = await Promise.all([
      createApp().request(`/admin/certdrill/certifications/${certificationId}/question-generation-jobs`),
      createApp().request(`/admin/certdrill/question-generation-jobs/${generationJobId}`),
    ]);

    expect(startResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(service.startQuestionGeneration).toHaveBeenCalledWith({
      certificationId,
      categoryId: null,
      resourceIds: [resourceId],
      sourceUrls: ["https://docs.example.com/guide"],
      requestedCount: 5,
      config: { focus: "Identity", systemInstructions: "Use detailed answer choices.", instructions: null, questionTypes: ["single_choice", "fill_blank", "matching"], difficultyMix: { easy: 20, medium: 60, hard: 20 }, deliveryPurpose: "assessment" },
    });
    expect(service.listQuestionGenerationJobs).toHaveBeenCalledWith(certificationId);
    expect(service.getQuestionGenerationJob).toHaveBeenCalledWith(generationJobId);
  });

  it("starts and reads grounded scenario generation jobs", async () => {
    const job = { id: generationJobId, certificationId, status: "pending" as const };
    service.startScenarioGeneration.mockResolvedValueOnce(job);
    service.listScenarioGenerationJobs.mockResolvedValueOnce([job]);
    service.getScenarioGenerationJob.mockResolvedValueOnce(job);
    const payload = {
      resourceIds: [resourceId],
      sourceUrls: ["https://docs.example.com/guide"],
      requestedCount: 2,
      difficulty: "hard" as const,
      focus: "Incident response",
      instructions: null,
    };
    const startResponse = await createApp().request(`/admin/certdrill/certifications/${certificationId}/scenario-generation-jobs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const [listResponse, detailResponse] = await Promise.all([
      createApp().request(`/admin/certdrill/certifications/${certificationId}/scenario-generation-jobs`),
      createApp().request(`/admin/certdrill/scenario-generation-jobs/${generationJobId}`),
    ]);

    expect(startResponse.status).toBe(201);
    expect(listResponse.status).toBe(200);
    expect(detailResponse.status).toBe(200);
    expect(service.startScenarioGeneration).toHaveBeenCalledWith({ certificationId, ...payload });
    expect(service.listScenarioGenerationJobs).toHaveBeenCalledWith(certificationId);
    expect(service.getScenarioGenerationJob).toHaveBeenCalledWith(generationJobId);
  });

  it("starts category discovery from a study guide URL and returns 201", async () => {
    const studyGuideUrl = "https://learn.example.com/study-guide";
    const pendingRun = {
      id: blueprintParseRunId,
      certificationId,
      resourceId,
      status: "pending",
    };
    service.startCategoryDiscovery.mockResolvedValueOnce(pendingRun);

    const response = await createApp().request(`/admin/certdrill/certifications/${certificationId}/category-discoveries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: studyGuideUrl }),
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, data: pendingRun });
    expect(service.startCategoryDiscovery).toHaveBeenCalledWith({ certificationId, url: studyGuideUrl });
  });

  it("delegates blueprint parse run list and detail requests", async () => {
    const run = {
      id: blueprintParseRunId,
      certificationId,
      resourceId,
      status: "completed",
    };
    service.listBlueprintParseRuns.mockResolvedValueOnce([run]);
    service.getBlueprintParseRun.mockResolvedValueOnce(run);

    const listResponse = await createApp().request(`/admin/certdrill/certifications/${certificationId}/blueprint-parse-runs`);
    const detailResponse = await createApp().request(`/admin/certdrill/blueprint-parse-runs/${blueprintParseRunId}`);

    expect(listResponse.status).toBe(200);
    await expect(listResponse.json()).resolves.toEqual({ success: true, data: [run] });
    expect(service.listBlueprintParseRuns).toHaveBeenCalledWith(certificationId);

    expect(detailResponse.status).toBe(200);
    await expect(detailResponse.json()).resolves.toEqual({ success: true, data: run });
    expect(service.getBlueprintParseRun).toHaveBeenCalledWith(blueprintParseRunId);
  });

  it("returns 404 when a blueprint parse run detail request does not exist", async () => {
    service.getBlueprintParseRun.mockResolvedValueOnce(null);

    const response = await createApp().request(`/admin/certdrill/blueprint-parse-runs/${blueprintParseRunId}`);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Blueprint parse run not found.",
      },
    });
  });

  it("rejects invalid category discovery and blueprint parse run values before delegation", async () => {
    const invalidCertificationResponse = await createApp().request("/admin/certdrill/certifications/not-a-uuid/blueprint-parse-runs");
    const invalidBodyResponse = await createApp().request(`/admin/certdrill/certifications/${certificationId}/category-discoveries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "not-a-url", extra: true }),
    });
    const invalidDetailResponse = await createApp().request("/admin/certdrill/blueprint-parse-runs/not-a-uuid");

    expect(invalidCertificationResponse.status).toBe(400);
    await expect(invalidCertificationResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid certification id",
      },
    });

    expect(invalidBodyResponse.status).toBe(400);
    await expect(invalidBodyResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid category discovery payload",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "url", message: "Resource URL must be a valid URL." }),
          expect.objectContaining({ path: "extra", message: UNKNOWN_FIELD_VALIDATION_MESSAGE }),
        ]),
      },
    });

    expect(invalidDetailResponse.status).toBe(400);
    await expect(invalidDetailResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid blueprint parse run id",
      },
    });

    expect(service.startCategoryDiscovery).not.toHaveBeenCalled();
    expect(service.listBlueprintParseRuns).not.toHaveBeenCalled();
    expect(service.getBlueprintParseRun).not.toHaveBeenCalled();
  });

  it("maps category discovery service errors to not-found and bad-request envelopes", async () => {
    service.startCategoryDiscovery
      .mockRejectedValueOnce(new CertDrillAdminServiceError(
        "CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND",
        "Certification not found.",
      ))
      .mockRejectedValueOnce(new CertDrillAdminServiceError(
        "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED",
        "Study guide could not be fetched.",
      ));

    const request = () => createApp().request(`/admin/certdrill/certifications/${certificationId}/category-discoveries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url: "https://learn.example.com/study-guide" }),
    });
    const notFoundResponse = await request();
    const badRequestResponse = await request();

    expect(notFoundResponse.status).toBe(404);
    await expect(notFoundResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND",
        message: "Certification not found.",
      },
    });

    expect(badRequestResponse.status).toBe(400);
    await expect(badRequestResponse.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED",
        message: "Study guide could not be fetched.",
      },
    });
  });

  it("rejects invalid resource ids before ingestion delegation", async () => {
    const response = await createApp().request("/admin/certdrill/resources/not-a-uuid/ingest", {
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid resource id",
      },
    });
    expect(service.ingestResource).not.toHaveBeenCalled();
  });

  it("delegates question feedback list requests", async () => {
    const feedback = [{ id: "abababab-abab-4aba-8aba-abababababab", questionId, rating: 2, status: "open" }];
    service.listQuestionFeedbackForAdmin.mockResolvedValueOnce(feedback);

    const response = await createApp().request("/admin/certdrill/question-feedback");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: feedback });
    expect(service.listQuestionFeedbackForAdmin).toHaveBeenCalledWith();
  });

  it("delegates question feedback status update requests", async () => {
    service.updateQuestionFeedback.mockResolvedValueOnce({ id: feedbackId, status: "reviewed" });

    const response = await createApp().request(`/admin/certdrill/question-feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "reviewed" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { id: feedbackId, status: "reviewed" } });
    expect(service.updateQuestionFeedback).toHaveBeenCalledWith(feedbackId, { status: "reviewed" });
  });

  it("rejects invalid question feedback status updates before delegation", async () => {
    const response = await createApp().request(`/admin/certdrill/question-feedback/${feedbackId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "open" }),
    });

    expect(response.status).toBe(400);
    expect(service.updateQuestionFeedback).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies before delegation", async () => {
    const response = await createApp().request("/admin/certdrill/certifications", {
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
    const categoryResponse = await createApp().request("/admin/certdrill/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId: "not-a-uuid", code: "D1", name: "Domain 1", weightPct: "100.00" }),
    });
    const resourceResponse = await createApp().request("/admin/certdrill/resources", {
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
    const response = await createApp().request("/admin/certdrill/certifications/not-a-uuid/categories");

    expect(response.status).toBe(400);
    expect(service.listCategories).not.toHaveBeenCalled();
  });

  it("returns admin service validation errors in the shared error envelope", async () => {
    service.createCategory.mockRejectedValueOnce(new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS",
      "Sibling category weights must not exceed 100. Current total: 105.",
    ));

    const response = await createApp().request("/admin/certdrill/categories", {
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
  it("resets all CertDrill progress for a valid user id", async () => {
    service.resetUserProgress.mockResolvedValueOnce({ deletedAttemptCount: 3, deletedReviewItemCount: 2 });

    const response = await createApp().request(`/admin/certdrill/users/${userId}/progress`, { method: "DELETE" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { deletedAttemptCount: 3, deletedReviewItemCount: 2 } });
    expect(service.resetUserProgress).toHaveBeenCalledWith(userId);
  });

  it("rejects malformed progress reset user ids", async () => {
    const response = await createApp().request("/admin/certdrill/users/not-a-uuid/progress", { method: "DELETE" });

    expect(response.status).toBe(400);
    expect(service.resetUserProgress).not.toHaveBeenCalled();
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

  function deeplyNestedDocumentJson(depth: number) {
    return "[".repeat(depth) + "0" + "]".repeat(depth);
  }

  it("delegates preview requests to the service and returns its result", async () => {
    const previewResult = {
      documentVersion: 1,
      documentHash: previewDocumentHash,
      totals: { submitted: 1, valid: 1, invalid: 0, duplicateExisting: 0, duplicateBatch: 0, selectedByDefault: 1 },
      rows: [],
    };
    service.previewQuestionImport.mockResolvedValueOnce(previewResult);

    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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

    const response = await createApp().request("/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validConfirmBody),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: importResult });
    expect(service.importQuestions).toHaveBeenCalledWith(validConfirmBody);
  });

  it("rejects preview requests missing required fields before delegation", async () => {
    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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
    const previewResponse = await createApp().request("/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId }),
    });
    const confirmResponse = await createApp().request("/admin/certdrill/questions/import", {
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
    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validPreviewBody, extra: "not-allowed" }),
    });

    expect(response.status).toBe(400);
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON bodies before delegation", async () => {
    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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
    const response = await createApp().request("/admin/certdrill/questions/import", {
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
    const response = await createApp().request("/admin/certdrill/questions/import", {
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

    const response = await createApp().request("/admin/certdrill/questions/import", {
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

    const response = await createApp().request("/admin/certdrill/questions/import", {
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
    const response = await createApp().request("/admin/certdrill/questions/import", {
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
    const response = await createApp().request("/admin/certdrill/questions/import", {
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
    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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
    const response = await createApp().request("/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validConfirmBody, previewDocumentHash: "not-a-hash" }),
    });

    expect(response.status).toBe(400);
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects a deeply nested document before delegating preview or confirm requests", async () => {
    const document = deeplyNestedDocumentJson(QUESTION_IMPORT_MAX_DOCUMENT_NESTING * 8);
    const previewResponse = await createApp().request("/admin/certdrill/questions/import/preview", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"certificationId":"${certificationId}","document":${document}}`,
    });
    const confirmResponse = await createApp().request("/admin/certdrill/questions/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: `{"certificationId":"${certificationId}","document":${document},"previewDocumentHash":"${previewDocumentHash}","selectedSourceIndexes":[0],"duplicateOverrideSourceIndexes":[]}`,
    });

    await expect(previewResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid question import preview payload",
        details: [{ path: "document", message: "Document nesting/shape is invalid.", code: "custom" }],
      },
    });
    await expect(confirmResponse.json()).resolves.toMatchObject({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid question import payload",
        details: [{ path: "document", message: "Document nesting/shape is invalid.", code: "custom" }],
      },
    });
    expect(previewResponse.status).toBe(400);
    expect(confirmResponse.status).toBe(400);
    expect(service.previewQuestionImport).not.toHaveBeenCalled();
    expect(service.importQuestions).not.toHaveBeenCalled();
  });

  it("rejects a request whose total body exceeds the transport size limit", async () => {
    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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

    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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

    const response = await createApp().request("/admin/certdrill/questions/import", {
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

    const response = await createApp().request("/admin/certdrill/questions/import/preview", {
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
