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

    await expectHelperCall("listCertDrillAdminCertificationsServer", [], "/api/admin/certdrill/certifications");
    await expectHelperCall("createCertDrillAdminCertificationServer", [createPayload], "/api/admin/certdrill/certifications", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminCertificationServer", ["cert-1", updatePayload], "/api/admin/certdrill/certifications/cert-1", {
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
      "/api/admin/certdrill/certifications/cert-1/categories",
    );
    await expectHelperCall("createCertDrillAdminCategoryServer", [createPayload], "/api/admin/certdrill/categories", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminCategoryServer", ["category-1", updatePayload], "/api/admin/certdrill/categories/category-1", {
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
      "/api/admin/certdrill/certifications/cert-1/questions",
    );
    await expectHelperCall("createCertDrillAdminQuestionServer", [createPayload], "/api/admin/certdrill/questions", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminQuestionServer", ["question-1", updatePayload], "/api/admin/certdrill/questions/question-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
    await expectHelperCall("publishCertDrillAdminQuestionServer", ["question-1"], "/api/admin/certdrill/questions/question-1/publish", {
      method: "POST",
    });
  });

  it("lists, creates, and updates admin exam forms", async () => {
    const createPayload = {
      certificationId: "cert-1",
      name: "Practice Exam A",
      description: "First form",
      sortOrder: 1,
      isActive: true,
      durationMinutes: 120,
      questionIds: ["question-1"],
    };
    const updatePayload = { name: "Practice Exam B", questionIds: ["question-2"] };

    await expectHelperCall(
      "listCertDrillAdminExamFormsServer",
      ["cert-1"],
      "/api/admin/certdrill/certifications/cert-1/exam-forms",
    );
    await expectHelperCall("createCertDrillAdminExamFormServer", [createPayload], "/api/admin/certdrill/exam-forms", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminExamFormServer", ["form-1", updatePayload], "/api/admin/certdrill/exam-forms/form-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
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
      "/api/admin/certdrill/certifications/cert-1/resources",
    );
    await expectHelperCall("createCertDrillAdminResourceServer", [createPayload], "/api/admin/certdrill/resources", {
      method: "POST",
      body: JSON.stringify(createPayload),
    });
    await expectHelperCall("updateCertDrillAdminResourceServer", ["resource-1", updatePayload], "/api/admin/certdrill/resources/resource-1", {
      method: "PATCH",
      body: JSON.stringify(updatePayload),
    });
  });

  it("creates mock generation jobs", async () => {
    const payload = {
      certificationId: "cert-1",
      categoryId: "category-1",
      prompt: "Generate questions about identity.",
      topic: "Identity",
      requestedCount: 3,
      resourceIds: ["resource-1"],
    };

    await expectHelperCall("createCertDrillAdminMockGenerationJobServer", [payload], "/api/admin/certdrill/generation-jobs/mock", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  });

  it("lists question feedback for admin review", async () => {
    await expectHelperCall("listCertDrillAdminQuestionFeedbackServer", [], "/api/admin/certdrill/question-feedback");
    await expectHelperCall("updateCertDrillAdminQuestionFeedbackServer", ["feedback-1", { status: "resolved" }], "/api/admin/certdrill/question-feedback/feedback-1", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
  });
});
