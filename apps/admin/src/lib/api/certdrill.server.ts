import type { CertDrillCertificationListItem, CertDrillDifficulty } from "@platform/contracts";

import { serverApiRequest } from "./client.server";

type SuccessResult<T> = { success: boolean; data: T };
type Nullable<T> = T | null;

const CERTDRILL_ADMIN_BASE_PATH = "/api/admin/certdrill";

export type CertDrillAdminCertificationInput = {
  code: string;
  name: string;
  vendor: string;
  vendorId?: Nullable<string>;
  logoUrl?: Nullable<string>;
  blueprintSourceUrl?: Nullable<string>;
  description?: Nullable<string>;
  questionCountDefault?: number;
  quickDrillQuestionCount?: number;
  categoryDrillQuestionCount?: number;
  examSimulationQuestionCount?: Nullable<number>;
  examSimulationDurationMinutes?: number;
  passThresholdPct?: number;
  isActive?: boolean;
  enabledAt?: Nullable<string>;
  archivedAt?: Nullable<string>;
};

export type CertDrillAdminCertificationUpdateInput = Partial<CertDrillAdminCertificationInput>;
export type CertDrillAdminCertification = CertDrillAdminCertificationInput & { id: string };
export type CertDrillAdminVendor = { id: string; slug: string; name: string; logoUrl?: Nullable<string>; sortOrder: number; isActive: boolean };

export type CertDrillAdminCategoryInput = {
  certificationId: string;
  parentCategoryId?: Nullable<string>;
  code: string;
  name: string;
  weightPct?: Nullable<string | number>;
  drillQuestionCount?: Nullable<number>;
  sortOrder?: number;
};

export type CertDrillAdminCategoryUpdateInput = Partial<CertDrillAdminCategoryInput>;
export type CertDrillAdminCategory = CertDrillAdminCategoryInput & { id: string };

export type CertDrillAdminMediaAssetInput = {
  url: string;
  mimeType?: string;
  mime_type?: string;
};

export type CertDrillAdminQuestionOptionInput = {
  text: string;
  mediaAssets?: CertDrillAdminMediaAssetInput[];
  isCorrect: boolean;
  explanation?: string;
  citationUrls?: string[];
  sortOrder?: number;
};

export type CertDrillAdminQuestionInput = {
  certificationId: string;
  categoryId: string;
  stem: string;
  mediaAssets?: CertDrillAdminMediaAssetInput[];
  difficulty?: CertDrillDifficulty;
  status?: "draft" | "published" | "archived";
  createdBy?: "ai" | "admin";
  sourceResourceId?: Nullable<string>;
  generationJobId?: Nullable<string>;
  options?: CertDrillAdminQuestionOptionInput[];
};

export type CertDrillAdminQuestionUpdateInput = Partial<Omit<CertDrillAdminQuestionInput, "certificationId" | "createdBy">>;
export type CertDrillAdminQuestion = CertDrillAdminQuestionInput & { id: string };

export type CertDrillAdminExamFormInput = {
  certificationId: string;
  name: string;
  description?: Nullable<string>;
  sortOrder?: number;
  isActive?: boolean;
  durationMinutes?: number;
  questionIds: string[];
};

export type CertDrillAdminExamFormUpdateInput = Partial<CertDrillAdminExamFormInput>;
export type CertDrillAdminExamForm = CertDrillAdminExamFormInput & { id: string };

export type CertDrillAdminResourceInput = {
  certificationId: string;
  categoryId?: Nullable<string>;
  url: string;
  title: string;
  sourceType: "module" | "unit" | "study-guide" | "exam-blueprint" | "doc";
  contentMode: "deep_content" | "outline_blueprint";
  rawContent?: Nullable<string>;
  status?: "pending" | "ingested" | "failed";
};

export type CertDrillAdminResourceUpdateInput = Partial<CertDrillAdminResourceInput>;
export type CertDrillAdminResource = CertDrillAdminResourceInput & { id: string };

export type CertDrillAdminMockGenerationInput = {
  certificationId: string;
  categoryId: string;
  prompt: string;
  topic?: Nullable<string>;
  requestedCount?: number;
  resourceIds?: string[];
};

export type CertDrillAdminMockGenerationJob = {
  job: unknown;
  generatedQuestions: CertDrillAdminQuestion[];
};

export type CertDrillAdminQuestionFeedback = {
  id: string;
  userId: string;
  questionId: string;
  examAttemptId: Nullable<string>;
  rating: number;
  disputeCorrectAnswer: boolean;
  message: Nullable<string>;
  status: "open" | "reviewed" | "resolved";
  createdAt: string;
  updatedAt: string;
};

export type CertDrillAdminQuestionFeedbackUpdateInput = {
  status: "reviewed" | "resolved";
};

function jsonRequestInit(method: "POST" | "PATCH", payload: unknown): RequestInit {
  return {
    method,
    body: JSON.stringify(payload),
  };
}

async function certdrillAdminRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const result = init
    ? await serverApiRequest<SuccessResult<T>>(`${CERTDRILL_ADMIN_BASE_PATH}${path}`, init)
    : await serverApiRequest<SuccessResult<T>>(`${CERTDRILL_ADMIN_BASE_PATH}${path}`);
  return result.data;
}

export async function getCertDrillCertificationsServer() {
  const result = await serverApiRequest<SuccessResult<CertDrillCertificationListItem[]>>("/api/certdrill/certifications");
  return result.data;
}

export async function listCertDrillAdminCertificationsServer(): Promise<CertDrillAdminCertification[]> {
  return certdrillAdminRequest<CertDrillAdminCertification[]>("/certifications");
}

export async function listCertDrillAdminVendorsServer(): Promise<CertDrillAdminVendor[]> {
  return certdrillAdminRequest<CertDrillAdminVendor[]>("/vendors");
}

export async function createCertDrillAdminCertificationServer(
  payload: CertDrillAdminCertificationInput,
): Promise<CertDrillAdminCertification> {
  return certdrillAdminRequest<CertDrillAdminCertification>("/certifications", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminCertificationServer(
  certificationId: string,
  payload: CertDrillAdminCertificationUpdateInput,
): Promise<CertDrillAdminCertification> {
  return certdrillAdminRequest<CertDrillAdminCertification>(`/certifications/${certificationId}`, jsonRequestInit("PATCH", payload));
}

export async function archiveCertDrillAdminCertificationServer(certificationId: string): Promise<CertDrillAdminCertification> {
  return certdrillAdminRequest<CertDrillAdminCertification>(`/certifications/${certificationId}/archive`, { method: "POST" });
}

export async function listCertDrillAdminCategoriesServer(certificationId: string): Promise<CertDrillAdminCategory[]> {
  return certdrillAdminRequest<CertDrillAdminCategory[]>(`/certifications/${certificationId}/categories`);
}

export async function createCertDrillAdminCategoryServer(payload: CertDrillAdminCategoryInput): Promise<CertDrillAdminCategory> {
  return certdrillAdminRequest<CertDrillAdminCategory>("/categories", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminCategoryServer(
  categoryId: string,
  payload: CertDrillAdminCategoryUpdateInput,
): Promise<CertDrillAdminCategory> {
  return certdrillAdminRequest<CertDrillAdminCategory>(`/categories/${categoryId}`, jsonRequestInit("PATCH", payload));
}

export async function archiveCertDrillAdminCategoryServer(categoryId: string): Promise<CertDrillAdminCategory> {
  return certdrillAdminRequest<CertDrillAdminCategory>(`/categories/${categoryId}/archive`, { method: "POST" });
}

export async function listCertDrillAdminQuestionsServer(certificationId: string): Promise<CertDrillAdminQuestion[]> {
  return certdrillAdminRequest<CertDrillAdminQuestion[]>(`/certifications/${certificationId}/questions`);
}

export async function createCertDrillAdminQuestionServer(payload: CertDrillAdminQuestionInput): Promise<CertDrillAdminQuestion> {
  return certdrillAdminRequest<CertDrillAdminQuestion>("/questions", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminQuestionServer(
  questionId: string,
  payload: CertDrillAdminQuestionUpdateInput,
): Promise<CertDrillAdminQuestion> {
  return certdrillAdminRequest<CertDrillAdminQuestion>(`/questions/${questionId}`, jsonRequestInit("PATCH", payload));
}

export async function publishCertDrillAdminQuestionServer(questionId: string): Promise<CertDrillAdminQuestion> {
  return certdrillAdminRequest<CertDrillAdminQuestion>(`/questions/${questionId}/publish`, { method: "POST" });
}

export async function listCertDrillAdminExamFormsServer(certificationId: string): Promise<CertDrillAdminExamForm[]> {
  return certdrillAdminRequest<CertDrillAdminExamForm[]>(`/certifications/${certificationId}/exam-forms`);
}

export async function createCertDrillAdminExamFormServer(payload: CertDrillAdminExamFormInput): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>("/exam-forms", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminExamFormServer(
  examFormId: string,
  payload: CertDrillAdminExamFormUpdateInput,
): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}`, jsonRequestInit("PATCH", payload));
}

export async function listCertDrillAdminResourcesServer(certificationId: string): Promise<CertDrillAdminResource[]> {
  return certdrillAdminRequest<CertDrillAdminResource[]>(`/certifications/${certificationId}/resources`);
}

export async function createCertDrillAdminResourceServer(payload: CertDrillAdminResourceInput): Promise<CertDrillAdminResource> {
  return certdrillAdminRequest<CertDrillAdminResource>("/resources", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminResourceServer(
  resourceId: string,
  payload: CertDrillAdminResourceUpdateInput,
): Promise<CertDrillAdminResource> {
  return certdrillAdminRequest<CertDrillAdminResource>(`/resources/${resourceId}`, jsonRequestInit("PATCH", payload));
}

export async function createCertDrillAdminMockGenerationJobServer(
  payload: CertDrillAdminMockGenerationInput,
): Promise<CertDrillAdminMockGenerationJob> {
  return certdrillAdminRequest<CertDrillAdminMockGenerationJob>("/generation-jobs/mock", jsonRequestInit("POST", payload));
}

export async function listCertDrillAdminQuestionFeedbackServer(): Promise<CertDrillAdminQuestionFeedback[]> {
  return certdrillAdminRequest<CertDrillAdminQuestionFeedback[]>("/question-feedback");
}

export async function updateCertDrillAdminQuestionFeedbackServer(
  feedbackId: string,
  payload: CertDrillAdminQuestionFeedbackUpdateInput,
): Promise<CertDrillAdminQuestionFeedback> {
  return certdrillAdminRequest<CertDrillAdminQuestionFeedback>(`/question-feedback/${feedbackId}`, jsonRequestInit("PATCH", payload));
}
