import { beforeEach, describe, expect, it, vi } from "vitest";

const { createExamForm, revalidatePath, redirect } = vi.hoisted(() => ({
  createExamForm: vi.fn(),
  revalidatePath: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/api/certdrill.server", () => ({
  createCertDrillAdminExamFormServer: createExamForm,
  regenerateCertDrillAdminExamFormServer: vi.fn(),
  replaceCertDrillAdminExamFormQuestionServer: vi.fn(),
  setCertDrillAdminExamFormActiveServer: vi.fn(),
  updateCertDrillAdminExamFormMetadataServer: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({ redirect }));

import { ApiRequestError } from "@platform/frontend-shared";
import { createCertDrillExamFormAction, initialExamFormActionState } from "@/modules/certdrill/exam-form-actions";
import { examFormActionError } from "@/modules/certdrill/exam-form-action-error";

function formData() {
  const data = new FormData();
  data.set("certificationId", "22222222-2222-4222-8222-222222222222");
  data.set("name", "Form A");
  data.set("durationMinutes", "120");
  data.set("targetQuestionCount", "60");
  return data;
}

describe("exam form actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns API failures with a digest as action state instead of rethrowing", async () => {
    createExamForm.mockRejectedValueOnce(new ApiRequestError({
      status: 400,
      errorCode: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      message: "Insufficient question capacity.",
      details: [{ categoryName: "Networking", requiredCount: 20, availableCount: 12 }],
    }));

    await expect(createCertDrillExamFormAction(initialExamFormActionState, formData())).resolves.toEqual({
      status: "error",
      fieldErrors: {},
      formError: "Networking requires 20 questions but only 12 published questions are available.",
    });
    expect(redirect).not.toHaveBeenCalled();
  });

  it("formats all capacity shortage details", () => {
    const state = examFormActionError(new ApiRequestError({
      status: 400,
      errorCode: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY",
      message: "Insufficient capacity.",
      details: [
        { categoryName: "Networking", requiredCount: 20, availableCount: 12 },
        { categoryName: "Security", requiredCount: 10, availableCount: 8 },
      ],
    }));
    expect(state.formError).toContain("Networking requires 20 questions but only 12 published questions are available.");
    expect(state.formError).toContain("Security requires 10 questions but only 8 published questions are available.");
  });

  it("preserves API validation details as field errors", () => {
    const state = examFormActionError(new ApiRequestError({
      status: 400,
      errorCode: "VALIDATION_FAILED",
      message: "Invalid exam form payload.",
      details: [
        { path: "name", message: "Name is required." },
        { path: "targetQuestionCount", message: "Must be positive." },
      ],
    }));
    expect(state).toEqual({
      status: "error",
      fieldErrors: {
        name: ["Name is required."],
        targetQuestionCount: ["Must be positive."],
      },
      formError: "Invalid exam form payload.",
    });
  });
});
