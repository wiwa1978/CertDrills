import { beforeEach, describe, expect, it, vi } from "vitest";

import * as certdrillApi from "../../src/lib/api/certdrill.server";
import { serverApiRequest } from "../../src/lib/api/client.server";

vi.mock("../../src/lib/api/client.server", () => ({
  serverApiRequest: vi.fn(),
}));

const serverApiRequestMock = vi.mocked(serverApiRequest);
const api = certdrillApi as Record<string, (...args: unknown[]) => Promise<unknown>>;

async function expectHelperCall(name: string, args: unknown[], path: string, init?: RequestInit) {
  const payload = { id: "returned" };
  serverApiRequestMock.mockResolvedValueOnce({ success: true, data: payload });

  const helper = api[name];
  expect(typeof helper).toBe("function");
  await expect(helper(...args)).resolves.toBe(payload);

  if (init) {
    expect(serverApiRequestMock).toHaveBeenCalledWith(path, init);
  } else {
    expect(serverApiRequestMock).toHaveBeenCalledWith(path);
  }
}

describe("CertDrill admin API helpers", () => {
  beforeEach(() => {
    serverApiRequestMock.mockReset();
  });

  it("preserves the read-only user certification helper", async () => {
    await expectHelperCall("getCertDrillCertificationsServer", [], "/api/certdrill/certifications");
  });

  it("lists, creates, and updates admin certifications", async () => {
    const createPayload = {
      code: "AZ-104",
      name: "Azure Administrator",
      vendor: "Microsoft",
      questionCountDefault: 15,
      isActive: true,
    };
    const updatePayload = { name: "Azure Administrator Associate", isActive: false };

    await expectHelperCall("listCertDrillAdminCertificationsServer", [], "/admin/certdrill/certifications");
    await expectHelperCall("createCertDrillAdminCertificationServer", [createPayload], "/admin/certdrill/certifications", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminCertificationServer", ["cert-1", updatePayload], "/admin/certdrill/certifications/cert-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
  });

  it("lists, creates, and updates admin categories", async () => {
    const createPayload = {
      certificationId: "cert-1",
      parentCategoryId: null,
      code: "manage-identity",
      name: "Manage identities",
      weightPct: 25,
      drillQuestionCount: 8,
      sortOrder: 1,
    };
    const updatePayload = { name: "Manage Azure identities", weightPct: "30" };

    await expectHelperCall(
      "listCertDrillAdminCategoriesServer",
      ["cert-1"],
      "/admin/certdrill/certifications/cert-1/categories",
    );
    await expectHelperCall("createCertDrillAdminCategoryServer", [createPayload], "/admin/certdrill/categories", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminCategoryServer", ["category-1", updatePayload], "/admin/certdrill/categories/category-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
  });

  it("lists, creates, updates, and publishes admin questions", async () => {
    const createPayload = {
      certificationId: "cert-1",
      categoryId: "category-1",
      stem: "Which option is correct?",
      difficulty: "medium",
      status: "draft",
      options: [
        { text: "Correct", isCorrect: true, explanation: "Because it is correct.", citationUrls: [] },
        { text: "Wrong", isCorrect: false, explanation: "Because it is wrong.", citationUrls: [] },
      ],
    };
    const updatePayload = { stem: "Which updated option is correct?" };

    await expectHelperCall(
      "listCertDrillAdminQuestionsServer",
      ["cert-1"],
      "/admin/certdrill/certifications/cert-1/questions",
    );
    await expectHelperCall("createCertDrillAdminQuestionServer", [createPayload], "/admin/certdrill/questions", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminQuestionServer", ["question-1", updatePayload], "/admin/certdrill/questions/question-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
    await expectHelperCall("publishCertDrillAdminQuestionServer", ["question-1"], "/admin/certdrill/questions/question-1/publish", {
      method: "POST",
    });
    const bulkPayload = { questionIds: ["question-1", "question-2"], status: "published" };
    await expectHelperCall("updateCertDrillAdminQuestionStatusesServer", [bulkPayload], "/admin/certdrill/questions/status", {
      method: "PATCH",
      body: JSON.stringify(bulkPayload),
    });
    const purposePayload = { questionIds: ["question-1", "question-2"], deliveryPurpose: "assessment" as const };
    await expectHelperCall("updateCertDrillAdminQuestionDeliveryPurposesServer", [purposePayload], "/admin/certdrill/questions/delivery-purpose", {
      method: "PATCH",
      body: JSON.stringify(purposePayload),
    });
  });

  it("lists the centralized admin question index with only defined query params", async () => {
    const payload = {
      query: {
        search: "zero trust",
        certificationId: "cert-1",
        categoryId: undefined,
        status: "published",
        difficulty: "hard",
        sort: "stem-desc" as const,
        page: 3,
      },
      items: [
        {
          questionId: "question-1",
          stem: "Which option is correct?",
          status: "published",
          difficulty: "hard",
          certificationId: "cert-1",
          certificationCode: "AZ-104",
          certificationName: "Azure Administrator",
          categoryId: "category-1",
          categoryCode: "identity",
          categoryName: "Identity",
          answerOptions: [
            {
              id: "option-1",
              questionId: "question-1",
              text: "Correct",
              isCorrect: true,
              explanation: "Because it matches the requirement.",
              sortOrder: 1,
            },
          ],
        },
      ],
      filterOptions: {
        certifications: [{ id: "cert-1", code: "AZ-104", name: "Azure Administrator" }],
        categories: [{ id: "category-1", certificationId: "cert-1", code: "identity", name: "Identity" }],
      },
      pagination: {
        page: 3,
        pageSize: 50,
        pageCount: 4,
        totalItems: 175,
      },
    };
    serverApiRequestMock.mockResolvedValueOnce({ success: true, data: payload });

    await expect(certdrillApi.listCertDrillAdminQuestionIndexServer({
      search: "  zero trust  ",
      certificationId: "cert-1",
      categoryId: "",
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: 3,
    })).resolves.toEqual({
      query: {
        search: "zero trust",
        certificationId: "cert-1",
        categoryId: undefined,
        status: "published",
        difficulty: "hard",
        sort: "stem-desc",
        page: 3,
      },
      items: [
        {
          questionId: "question-1",
          stem: "Which option is correct?",
          status: "published",
          difficulty: "hard",
          certificationId: "cert-1",
          certificationCode: "AZ-104",
          certificationName: "Azure Administrator",
          categoryId: "category-1",
          categoryCode: "identity",
          categoryName: "Identity",
          options: [
            {
              id: "option-1",
              questionId: "question-1",
              text: "Correct",
              isCorrect: true,
              explanation: "Because it matches the requirement.",
              sortOrder: 1,
            },
          ],
        },
      ],
      certifications: [{ id: "cert-1", code: "AZ-104", name: "Azure Administrator" }],
      categories: [{ id: "category-1", certificationId: "cert-1", code: "identity", name: "Identity" }],
      page: 3,
      pageCount: 4,
      pageSize: 50,
      total: 175,
    });

    expect(serverApiRequestMock).toHaveBeenCalledWith(
      "/admin/certdrill/questions?search=zero+trust&certificationId=cert-1&status=published&difficulty=hard&sort=stem-desc&page=3",
    );
  });

  it("omits empty centralized admin question index query params", async () => {
    const payload = {
      query: {
        search: undefined,
        certificationId: undefined,
        categoryId: undefined,
        status: undefined,
        difficulty: undefined,
        sort: "stem-asc" as const,
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
    serverApiRequestMock.mockResolvedValueOnce({ success: true, data: payload });

    await expect(certdrillApi.listCertDrillAdminQuestionIndexServer({
      search: "   ",
      certificationId: undefined,
      categoryId: "",
      status: undefined,
      difficulty: undefined,
      sort: undefined,
      page: undefined,
    })).resolves.toEqual({
      query: {
        search: undefined,
        certificationId: undefined,
        categoryId: undefined,
        status: undefined,
        difficulty: undefined,
        sort: "stem-asc",
        page: 1,
      },
      items: [],
      certifications: [],
      categories: [],
      page: 1,
      pageCount: 1,
      pageSize: 50,
      total: 0,
    });

    expect(serverApiRequestMock).toHaveBeenCalledWith("/admin/certdrill/questions");
  });

  it("uses focused admin exam form endpoints", async () => {
    const createPayload = { certificationId: "cert-1", name: "Practice Exam A", durationMinutes: 120, targetQuestionCount: 60 };
    const updatePayload = { name: "Practice Exam B", durationMinutes: 90 };
    const regeneratePayload = { targetQuestionCount: 50, expectedAssignmentVersion: 2 };
    const replacePayload = { currentQuestionId: "question-1", replacementQuestionId: "question-2", expectedAssignmentVersion: 2 };

    await expectHelperCall(
      "listCertDrillAdminExamFormsServer",
      ["cert-1"],
      "/admin/certdrill/certifications/cert-1/exam-forms",
    );
    await expectHelperCall("getCertDrillAdminExamFormServer", ["form-1"], "/admin/certdrill/exam-forms/form-1");
    await expectHelperCall("createCertDrillAdminExamFormServer", [createPayload], "/admin/certdrill/exam-forms", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminExamFormMetadataServer", ["form-1", updatePayload], "/admin/certdrill/exam-forms/form-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
    await expectHelperCall("regenerateCertDrillAdminExamFormServer", ["form-1", regeneratePayload], "/admin/certdrill/exam-forms/form-1/regenerate", { method: "POST", body: JSON.stringify(regeneratePayload) });
    await expectHelperCall("replaceCertDrillAdminExamFormQuestionServer", ["form-1", replacePayload], "/admin/certdrill/exam-forms/form-1/questions/replace", { method: "POST", body: JSON.stringify(replacePayload) });
    await expectHelperCall("setCertDrillAdminExamFormActiveServer", ["form-1", false], "/admin/certdrill/exam-forms/form-1/activation", { method: "PATCH", body: JSON.stringify({ isActive: false }) });
  });

  it("uses focused scenario administration endpoints", async () => {
    const createPayload = { certificationId: "cert-1", title: "Incident", description: null, difficulty: "medium", estimatedMinutes: 15, contentJson: { initialNodeKey: "start", nodes: [] } };
    const { certificationId: _certificationId, ...updatePayload } = createPayload;
    await expectHelperCall("listCertDrillAdminScenariosServer", ["cert-1"], "/admin/certdrill/certifications/cert-1/scenarios");
    await expectHelperCall("createCertDrillAdminScenarioServer", [createPayload], "/admin/certdrill/scenarios", { method: "POST", body: JSON.stringify(createPayload) });
    await expectHelperCall("updateCertDrillAdminScenarioServer", ["scenario-1", updatePayload], "/admin/certdrill/scenarios/scenario-1", { method: "PATCH", body: JSON.stringify(updatePayload) });
    await expectHelperCall("validateCertDrillAdminScenarioServer", ["scenario-1"], "/admin/certdrill/scenarios/scenario-1/validate", { method: "POST", body: JSON.stringify({}) });
    await expectHelperCall("publishCertDrillAdminScenarioServer", ["scenario-1"], "/admin/certdrill/scenarios/scenario-1/publish", { method: "POST", body: JSON.stringify({}) });
    await expectHelperCall("updateCertDrillAdminScenarioStatusesServer", [{ scenarioIds: ["scenario-1"], status: "published" }], "/admin/certdrill/scenarios/status", { method: "PATCH", body: JSON.stringify({ scenarioIds: ["scenario-1"], status: "published" }) });
    await expectHelperCall("archiveCertDrillAdminScenarioServer", ["scenario-1"], "/admin/certdrill/scenarios/scenario-1/archive", { method: "POST", body: JSON.stringify({}) });
  });

  it("lists, creates, and updates admin resources", async () => {
    const createPayload = {
      certificationId: "cert-1",
      categoryId: "category-1",
      url: "https://learn.example.test/module",
      title: "Learn module",
      sourceType: "module",
      contentMode: "deep_content",
      rawContent: "content",
      status: "pending",
    };
    const updatePayload = { title: "Updated module", status: "ingested" };

    await expectHelperCall(
      "listCertDrillAdminResourcesServer",
      ["cert-1"],
      "/admin/certdrill/certifications/cert-1/resources",
    );
    await expectHelperCall("createCertDrillAdminResourceServer", [createPayload], "/admin/certdrill/resources", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminResourceServer", ["resource-1", updatePayload], "/admin/certdrill/resources/resource-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
  });

  it("lists and reads blueprint runs and starts URL category discovery without exposing raw output", async () => {
    const proposal = {
      confidence: "high" as const,
      warnings: ["Keep vendor phrasing."],
      categories: [
        {
          code: "1.0",
          name: "Identity",
          parentCode: null,
          weightPct: 40,
          sortOrder: 1,
          evidence: [
            {
              excerpt: "Manage identities and governance.",
              location: "Section 1",
            },
          ],
        },
      ],
    };
    const apiRun = {
      id: "run-1",
      certificationId: "cert-1",
      resourceId: "resource-1",
      status: "completed" as const,
      provider: "openai",
      model: "gpt-5.5",
      contentChecksum: "checksum-1",
      proposalJson: proposal,
      rawOutput: "{\"confidence\":\"high\"}",
      confidence: "high" as const,
      warningsJson: ["Keep vendor phrasing."],
      errorMessage: null,
      startedAt: "2026-08-07T09:00:00.000Z",
      completedAt: "2026-08-07T09:01:00.000Z",
      createdAt: "2026-08-07T08:59:00.000Z",
      updatedAt: "2026-08-07T09:01:00.000Z",
    };
    const expectedRun = {
      id: "run-1",
      certificationId: "cert-1",
      resourceId: "resource-1",
      status: "completed" as const,
      provider: "openai",
      model: "gpt-5.5",
      contentChecksum: "checksum-1",
      proposalJson: proposal,
      confidence: "high" as const,
      warningsJson: ["Keep vendor phrasing."],
      errorMessage: null,
      startedAt: "2026-08-07T09:00:00.000Z",
      completedAt: "2026-08-07T09:01:00.000Z",
      createdAt: "2026-08-07T08:59:00.000Z",
      updatedAt: "2026-08-07T09:01:00.000Z",
    };

    serverApiRequestMock.mockResolvedValueOnce({ success: true, data: [apiRun] });
    await expect(certdrillApi.listCertDrillAdminBlueprintParseRunsServer("cert-1")).resolves.toEqual([expectedRun]);
    expect(serverApiRequestMock).toHaveBeenCalledWith("/admin/certdrill/certifications/cert-1/blueprint-parse-runs");

    serverApiRequestMock.mockResolvedValueOnce({ success: true, data: apiRun });
    await expect(certdrillApi.startCertDrillAdminCategoryDiscoveryServer("cert-1", "https://learn.example/study-guide")).resolves.toEqual(expectedRun);
    expect(serverApiRequestMock).toHaveBeenCalledWith("/admin/certdrill/certifications/cert-1/category-discoveries", {
      method: "POST",
      body: JSON.stringify({ url: "https://learn.example/study-guide" }),
    });

    serverApiRequestMock.mockResolvedValueOnce({ success: true, data: apiRun });
    await expect(certdrillApi.getCertDrillAdminBlueprintParseRunServer("run-1")).resolves.toEqual(expectedRun);
    expect(serverApiRequestMock).toHaveBeenCalledWith("/admin/certdrill/blueprint-parse-runs/run-1");
  });

  it("starts, lists, and reads grounded generation jobs", async () => {
    const input = {
      categoryId: "category-1",
      resourceIds: ["resource-1"],
      sourceUrls: ["https://docs.example.com/guide"],
      requestedCount: 3,
      focus: "Identity",
      systemInstructions: null,
      instructions: null,
      questionTypes: ["single_choice"] as const,
      difficultyMix: { easy: 20, medium: 60, hard: 20 },
      deliveryPurpose: "practice" as const,
    };

    await expectHelperCall("startCertDrillAdminQuestionGenerationServer", ["cert-1", input], "/admin/certdrill/certifications/cert-1/question-generation-jobs", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await expectHelperCall("listCertDrillAdminQuestionGenerationJobsServer", ["cert-1"], "/admin/certdrill/certifications/cert-1/question-generation-jobs");
    await expectHelperCall("getCertDrillAdminQuestionGenerationJobServer", ["job-1"], "/admin/certdrill/question-generation-jobs/job-1");
  });

  it("lists question feedback for admin review", async () => {
    await expectHelperCall("listCertDrillAdminQuestionFeedbackServer", [], "/admin/certdrill/question-feedback");
    await expectHelperCall("updateCertDrillAdminQuestionFeedbackServer", ["feedback-1", { status: "resolved" }], "/admin/certdrill/question-feedback/feedback-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
  });
});
