import type { QuestionFormFieldErrors } from "./question-form-validation";

export type QuestionFormActionState = {
  status: "idle" | "error" | "success";
  fieldErrors: QuestionFormFieldErrors;
  formError?: string;
  message?: string;
};

export const initialQuestionFormActionState: QuestionFormActionState = {
  status: "idle",
  fieldErrors: {},
};
