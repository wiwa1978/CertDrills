import type {
  AnswerCertDrillQuestionRequest,
  AnswerCertDrillQuestionResponse,
  CreateCertDrillExamAttemptRequest,
  CreateCertDrillExamAttemptResponse,
  SubmitCertDrillExamAttemptResponse,
} from "@platform/contracts";

import { apiRequest } from "./client";

type SuccessResult<T> = { success: boolean; data: T };
type ApiResult<T> = SuccessResult<T> | T;

function isSuccessResult<T>(result: ApiResult<T>): result is SuccessResult<T> {
  return result !== null && typeof result === "object" && "data" in result;
}

function unwrapResult<T>(result: ApiResult<T>): T {
  return isSuccessResult(result) ? result.data : result;
}

export async function createCertDrillAttempt(input: CreateCertDrillExamAttemptRequest) {
  const result = await apiRequest<ApiResult<CreateCertDrillExamAttemptResponse>>("/api/certdrill/exams", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return unwrapResult(result);
}

export async function answerCertDrillQuestion(attemptId: string, input: AnswerCertDrillQuestionRequest) {
  const result = await apiRequest<ApiResult<AnswerCertDrillQuestionResponse>>(
    `/api/certdrill/exams/${encodeURIComponent(attemptId)}/answers`,
    {
      method: "POST",
      body: JSON.stringify(input),
    }
  );
  return unwrapResult(result);
}

export async function submitCertDrillAttempt(attemptId: string) {
  const result = await apiRequest<ApiResult<SubmitCertDrillExamAttemptResponse>>(
    `/api/certdrill/exams/${encodeURIComponent(attemptId)}/submit`,
    { method: "POST" }
  );
  return unwrapResult(result);
}
