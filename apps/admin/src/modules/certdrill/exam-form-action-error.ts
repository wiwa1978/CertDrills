import { ApiRequestError } from "@platform/frontend-shared";

export type ExamFormActionState = {
  status: "idle" | "error" | "success";
  formError?: string;
  fieldErrors: Partial<Record<"name" | "durationMinutes" | "targetQuestionCount", string[]>>;
};

export const initialExamFormActionState: ExamFormActionState = { status: "idle", fieldErrors: {} };

type CapacityShortage = {
  categoryName: string;
  requiredCount: number;
  availableCount: number;
};
const examFormFields = new Set(["name", "durationMinutes", "targetQuestionCount"] as const);

function isCapacityShortage(value: unknown): value is CapacityShortage {
  if (!value || typeof value !== "object") return false;
  const shortage = value as Record<string, unknown>;
  return typeof shortage.categoryName === "string"
    && Number.isInteger(shortage.requiredCount)
    && Number.isInteger(shortage.availableCount);
}

export function examFormActionError(error: unknown): ExamFormActionState {
  if (error instanceof ApiRequestError) {
    if (error.errorCode === "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT") {
      return { status: "error", fieldErrors: {}, formError: "This assignment changed after the page loaded. Reload and try again." };
    }
    if (error.errorCode === "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY" && Array.isArray(error.details)) {
      const shortages = error.details.filter(isCapacityShortage);
      if (shortages.length > 0) {
        return {
          status: "error",
          fieldErrors: {},
          formError: shortages.map((shortage) => `${shortage.categoryName} requires ${shortage.requiredCount} questions but only ${shortage.availableCount} published questions are available.`).join(" "),
        };
      }
    }
    if (Array.isArray(error.details)) {
      const fieldErrors: ExamFormActionState["fieldErrors"] = {};
      for (const detail of error.details) {
        if (!detail || typeof detail !== "object") continue;
        const { path, message } = detail as Record<string, unknown>;
        const field = typeof path === "string" ? path.split(".").at(-1) : undefined;
        if (field && examFormFields.has(field as "name" | "durationMinutes" | "targetQuestionCount") && typeof message === "string") {
          const key = field as keyof typeof fieldErrors;
          fieldErrors[key] = [...(fieldErrors[key] ?? []), message];
        }
      }
      if (Object.keys(fieldErrors).length > 0) return { status: "error", fieldErrors, formError: error.message };
    }
  }

  return {
    status: "error",
    fieldErrors: {},
    formError: error instanceof Error ? error.message.replace(/^API error \(\d+\):\s*/, "") : "Exam form could not be saved.",
  };
}
