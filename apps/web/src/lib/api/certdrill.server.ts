import type {
  CertDrillAttemptHistoryItem,
  CertDrillCategory,
  CertDrillCertificationListItem,
  CertDrillReadinessSummary,
  CertDrillResumeExamAttemptResponse,
  CertDrillReviewExamAttemptResponse,
} from "@platform/contracts";

import { serverApiRequest } from "./client.server";

type SuccessResult<T> = { success: boolean; data: T };

export async function getCertDrillCertificationsServer() {
  const result = await serverApiRequest<SuccessResult<CertDrillCertificationListItem[]>>("/api/certdrill/certifications");
  return result.data;
}

export async function getMyCertDrillCertificationsServer() {
  const result = await serverApiRequest<SuccessResult<CertDrillCertificationListItem[]>>("/api/certdrill/my-certifications");
  return result.data;
}

export async function getCertDrillReadinessServer() {
  const result = await serverApiRequest<SuccessResult<CertDrillReadinessSummary>>("/api/certdrill/readiness");
  return result.data;
}

export async function getCertDrillCategoriesServer(certificationId: string) {
  const result = await serverApiRequest<SuccessResult<CertDrillCategory[]>>(
    `/api/certdrill/certifications/${encodeURIComponent(certificationId)}/categories`
  );
  return result.data;
}

export async function getCertDrillReviewServer(attemptId: string) {
  const result = await serverApiRequest<SuccessResult<CertDrillReviewExamAttemptResponse>>(
    `/api/certdrill/exams/${encodeURIComponent(attemptId)}/review`
  );
  return result.data;
}

export async function getCertDrillAttemptServer(attemptId: string) {
  const result = await serverApiRequest<SuccessResult<CertDrillResumeExamAttemptResponse>>(
    `/api/certdrill/exams/${encodeURIComponent(attemptId)}`
  );
  return result.data;
}

export async function getCertDrillAttemptsServer() {
  const result = await serverApiRequest<SuccessResult<CertDrillAttemptHistoryItem[]>>("/api/certdrill/users/me/attempts");
  return result.data;
}
