import type { CertDrillCertificationListItem, CertDrillDifficulty } from "@platform/contracts";

import type {
  CertDrillQuestionImportPreviewResult,
  CertDrillQuestionImportResult,
} from "@/modules/certdrill/question-import-types";

import { serverApiRequest } from "./client.server";

type SuccessResult<T> = { success: boolean; data: T };
type Nullable<T> = T | null;
export type CertDrillAdminProgressResetResult = {
  deletedAttemptCount: number;
  deletedReviewItemCount: number;
};

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
  examSimulationScenarioCount?: number;
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
  weightMinPct?: Nullable<string | number>;
  weightMaxPct?: Nullable<string | number>;
  drillQuestionCount?: Nullable<number>;
  sortOrder?: number;
};

export type CertDrillAdminCategoryUpdateInput = Partial<CertDrillAdminCategoryInput>;
export type CertDrillAdminCategory = CertDrillAdminCategoryInput & { id: string; archivedAt?: Nullable<string> };

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
export type CertDrillAdminQuestionType = "single_choice" | "fill_blank" | "matching";
export type CertDrillAdminQuestionInteraction =
  | { type: "fill_blank"; acceptedAnswers: string[]; explanation: string; citationUrls: string[] }
  | { type: "matching"; pairs: Array<{ promptId: string; targetId: string; prompt: string; target: string; explanation: string; citationUrls: string[] }> };


export type CertDrillAdminQuestionInput = {
  certificationId: string;
  categoryId: string;
  stem: string;
  questionType?: CertDrillAdminQuestionType;
  interactionJson?: Nullable<CertDrillAdminQuestionInteraction>;
  mediaAssets?: CertDrillAdminMediaAssetInput[];
  difficulty?: CertDrillDifficulty;
  status?: "draft" | "published" | "archived";
  deliveryPurpose?: "practice" | "assessment" | "both";
  createdBy?: "ai" | "admin";
  sourceResourceId?: Nullable<string>;
  generationJobId?: Nullable<string>;
  options?: CertDrillAdminQuestionOptionInput[];
};

export type CertDrillAdminQuestionUpdateInput = Partial<Omit<CertDrillAdminQuestionInput, "certificationId" | "createdBy">>;
export type CertDrillAdminQuestionBulkStatusInput = {
  questionIds: string[];
  status: "draft" | "published";
};
export type CertDrillAdminQuestionBulkDeliveryPurposeInput = {
  questionIds: string[];
  deliveryPurpose: "practice" | "assessment";
};
export type CertDrillAdminQuestion = CertDrillAdminQuestionInput & { id: string };
export type CertDrillAdminQuestionIndexSort = "stem-asc" | "stem-desc";
export type CertDrillAdminQuestionIndexQuery = {
  search?: string | null;
  certificationId?: string | null;
  categoryId?: string | null;
  status?: NonNullable<CertDrillAdminQuestion["status"]> | string | null;
  difficulty?: CertDrillDifficulty | string | null;
  sort?: CertDrillAdminQuestionIndexSort | string | null;
  page?: number | string | null;
};

export type CertDrillAdminQuestionIndexOption = {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
  sortOrder: number;
};

export type CertDrillAdminQuestionIndexItem = {
  questionId: string;
  stem: string;
  status: NonNullable<CertDrillAdminQuestion["status"]>;
  deliveryPurpose: NonNullable<CertDrillAdminQuestion["deliveryPurpose"]>;
  difficulty: CertDrillDifficulty;
  certificationId: string;
  certificationCode: string;
  certificationName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
  options: CertDrillAdminQuestionIndexOption[];
};

export type CertDrillAdminQuestionIndexEffectiveQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: NonNullable<CertDrillAdminQuestion["status"]>;
  difficulty?: CertDrillDifficulty;
  sort: CertDrillAdminQuestionIndexSort;
  page: number;
};

export type CertDrillAdminQuestionIndexResult = {
  query: CertDrillAdminQuestionIndexEffectiveQuery;
  items: CertDrillAdminQuestionIndexItem[];
  certifications: Array<Pick<CertDrillAdminCertification, "id" | "code" | "name">>;
  categories: Array<Pick<CertDrillAdminCategory, "id" | "certificationId" | "code" | "name">>;
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
};

export type CertDrillAdminExamFormAllocation = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

export type CertDrillAdminExamFormCreateInput = {
  certificationId: string;
  name: string;
  durationMinutes: number;
  targetQuestionCount: number;
};
export type CertDrillAdminExamFormMetadataInput = { name?: string; durationMinutes?: number };
export type CertDrillAdminExamFormRegenerateInput = { targetQuestionCount: number; expectedAssignmentVersion: number };
export type CertDrillAdminExamFormReplaceInput = { currentQuestionId: string; replacementQuestionId: string; expectedAssignmentVersion: number };
export type CertDrillAdminScenarioOption = {
  key: string;
  title: string;
  description: string;
  consequence: string;
  points?: number;
  nextNodeKey: Nullable<string>;
};
export type CertDrillAdminScenarioNode = {
  key: string;
  title: string;
  situation: string;
  evidence: string[];
  options: CertDrillAdminScenarioOption[];
};
export type CertDrillAdminScenarioContent = {
  initialNodeKey: string;
  nodes: CertDrillAdminScenarioNode[];
};
export type CertDrillAdminScenarioInput = {
  certificationId: string;
  title: string;
  description: Nullable<string>;
  difficulty: "easy" | "medium" | "hard";
  estimatedMinutes: number;
  contentJson: CertDrillAdminScenarioContent;
};
export type CertDrillAdminScenario = CertDrillAdminScenarioInput & {
  id: string;
  status: "draft" | "validated" | "published" | "archived";
  validatedAt: Nullable<string>;
  examFormIds: string[];
  createdAt: string;
  updatedAt: string;
};
export type CertDrillAdminScenarioBulkStatusInput = {
  scenarioIds: string[];
  status: "draft" | "published";
};

export type CertDrillAdminExamForm = {
  id: string;
  certificationId: string;
  name: string;
  description: Nullable<string>;
  sortOrder: number;
  isActive: boolean;
  durationMinutes: number;
  targetQuestionCount: number;
  questionIds: string[];
  assignmentVersion: number;
  allocationSnapshot: CertDrillAdminExamFormAllocation[];
  scenarioIds: string[];
  generatedAt: string;
};

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
export type CertDrillAdminResource = CertDrillAdminResourceInput & {
  id: string;
  ingestedAt?: Nullable<string>;
  ingestError?: Nullable<string>;
};

export type CertDrillBlueprintEvidence = {
  excerpt: string;
  location: Nullable<string>;
};

export type CertDrillBlueprintCategoryProposal = {
  code: string;
  name: string;
  parentCode: Nullable<string>;
  weightPct: Nullable<number>;
  weightMinPct?: Nullable<number>;
  weightMaxPct?: Nullable<number>;
  sortOrder: number;
  evidence: CertDrillBlueprintEvidence[];
};

export type CertDrillBlueprintProposal = {
  confidence: "high" | "medium" | "low";
  warnings: string[];
  categories: CertDrillBlueprintCategoryProposal[];
};

export type CertDrillBlueprintParseRun = {
  id: string;
  certificationId: string;
  resourceId: string;
  status: "pending" | "running" | "completed" | "failed";
  provider: string;
  model: string;
  contentChecksum: string;
  proposalJson: Nullable<CertDrillBlueprintProposal>;
  confidence: Nullable<CertDrillBlueprintProposal["confidence"]>;
  warningsJson: string[];
  errorMessage: Nullable<string>;
  startedAt: Nullable<string>;
  completedAt: Nullable<string>;
  createdAt: string;
  updatedAt: string;
};

export type CertDrillQuestionGenerationInput = {
  categoryId: Nullable<string>;
  resourceIds: string[];
  sourceUrls: string[];
  requestedCount: number;
  focus: Nullable<string>;
  systemInstructions: Nullable<string>;
  instructions: Nullable<string>;
  questionTypes: Array<"single_choice" | "fill_blank" | "matching">;
  difficultyMix: { easy: number; medium: number; hard: number };
  deliveryPurpose: "practice" | "assessment";
};

export type CertDrillQuestionGenerationJob = {
  id: string;
  certificationId: string;
  categoryId: Nullable<string>;
  resourceIds: string[];
  requestedCount: number;
  provider: string;
  status: "pending" | "running" | "completed" | "failed";
  modelUsed: Nullable<string>;
  generatedCount: Nullable<number>;
  errorMessage: Nullable<string>;
  startedAt: Nullable<string>;
  completedAt: Nullable<string>;
  createdAt: string;
  updatedAt: string;
};
export type CertDrillScenarioGenerationInput = {
  resourceIds: string[];
  sourceUrls: string[];
  requestedCount: number;
  difficulty: "easy" | "medium" | "hard";
  focus: Nullable<string>;
  instructions: Nullable<string>;
};

export type CertDrillScenarioGenerationJob = {
  id: string;
  certificationId: string;
  resourceIds: string[];
  requestedCount: number;
  difficulty: "easy" | "medium" | "hard";
  focus: Nullable<string>;
  instructions: Nullable<string>;
  provider: string;
  modelUsed: string;
  status: "pending" | "running" | "completed" | "failed";
  generatedCount: Nullable<number>;
  errorMessage: Nullable<string>;
  startedAt: Nullable<string>;
  completedAt: Nullable<string>;
  createdAt: string;
  updatedAt: string;
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

type CertDrillAdminQuestionIndexApiItem = Omit<CertDrillAdminQuestionIndexItem, "options"> & {
  answerOptions: CertDrillAdminQuestionIndexOption[];
};

type CertDrillBlueprintParseRunApi = CertDrillBlueprintParseRun & {
  rawOutput?: Nullable<string>;
};

type CertDrillAdminQuestionIndexApiResult = {
  query: CertDrillAdminQuestionIndexResult["query"];
  items: CertDrillAdminQuestionIndexApiItem[];
  filterOptions: {
    certifications: CertDrillAdminQuestionIndexResult["certifications"];
    categories: CertDrillAdminQuestionIndexResult["categories"];
  };
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    totalItems: number;
  };
};

function jsonRequestInit(method: "POST" | "PATCH" | "PUT", payload: unknown): RequestInit {
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

function appendSearchParam(params: URLSearchParams, name: string, value: string | number | null | undefined) {
  if (value === undefined || value === null) return;

  const normalizedValue = typeof value === "string" ? value.trim() : String(value);
  if (!normalizedValue) return;

  params.append(name, normalizedValue);
}

function toCertDrillBlueprintParseRun({ rawOutput: _ignoredRawOutput, ...run }: CertDrillBlueprintParseRunApi): CertDrillBlueprintParseRun {
  return run;
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

export async function listCertDrillAdminQuestionIndexServer(
  query: CertDrillAdminQuestionIndexQuery = {},
): Promise<CertDrillAdminQuestionIndexResult> {
  const searchParams = new URLSearchParams();
  appendSearchParam(searchParams, "search", query.search);
  appendSearchParam(searchParams, "certificationId", query.certificationId);
  appendSearchParam(searchParams, "categoryId", query.categoryId);
  appendSearchParam(searchParams, "status", query.status);
  appendSearchParam(searchParams, "difficulty", query.difficulty);
  appendSearchParam(searchParams, "sort", query.sort);
  appendSearchParam(searchParams, "page", query.page);

  const queryString = searchParams.toString();
  const result = await certdrillAdminRequest<CertDrillAdminQuestionIndexApiResult>(queryString ? `/questions?${queryString}` : "/questions");

  return {
    query: result.query,
    items: result.items.map(({ answerOptions, ...item }) => ({ ...item, options: answerOptions })),
    certifications: result.filterOptions.certifications,
    categories: result.filterOptions.categories,
    page: result.pagination.page,
    pageCount: result.pagination.pageCount,
    pageSize: result.pagination.pageSize,
    total: result.pagination.totalItems,
  };
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

export async function updateCertDrillAdminQuestionStatusesServer(
  payload: CertDrillAdminQuestionBulkStatusInput,
): Promise<CertDrillAdminQuestion[]> {
  return certdrillAdminRequest<CertDrillAdminQuestion[]>("/questions/status", jsonRequestInit("PATCH", payload));
}

export async function updateCertDrillAdminQuestionDeliveryPurposesServer(
  payload: CertDrillAdminQuestionBulkDeliveryPurposeInput,
): Promise<CertDrillAdminQuestion[]> {
  return certdrillAdminRequest<CertDrillAdminQuestion[]>("/questions/delivery-purpose", jsonRequestInit("PATCH", payload));
}

export type CertDrillAdminQuestionImportPreviewInput = {
  certificationId: string;
  document: unknown;
};

export type CertDrillAdminQuestionImportConfirmInput = CertDrillAdminQuestionImportPreviewInput & {
  previewDocumentHash: string;
  selectedSourceIndexes: number[];
  duplicateOverrideSourceIndexes: number[];
};

export async function previewCertDrillAdminQuestionImportServer(
  payload: CertDrillAdminQuestionImportPreviewInput,
): Promise<CertDrillQuestionImportPreviewResult> {
  return certdrillAdminRequest<CertDrillQuestionImportPreviewResult>("/questions/import/preview", jsonRequestInit("POST", payload));
}

export async function confirmCertDrillAdminQuestionImportServer(
  payload: CertDrillAdminQuestionImportConfirmInput,
): Promise<CertDrillQuestionImportResult> {
  return certdrillAdminRequest<CertDrillQuestionImportResult>("/questions/import", jsonRequestInit("POST", payload));
}

export async function listCertDrillAdminExamFormsServer(certificationId: string): Promise<CertDrillAdminExamForm[]> {
  return certdrillAdminRequest<CertDrillAdminExamForm[]>(`/certifications/${certificationId}/exam-forms`);
}

export async function getCertDrillAdminExamFormServer(examFormId: string): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}`);
}

export async function createCertDrillAdminExamFormServer(payload: CertDrillAdminExamFormCreateInput): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>("/exam-forms", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminExamFormMetadataServer(
  examFormId: string,
  payload: CertDrillAdminExamFormMetadataInput,
): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}`, jsonRequestInit("PATCH", payload));
}

export async function regenerateCertDrillAdminExamFormServer(examFormId: string, payload: CertDrillAdminExamFormRegenerateInput): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}/regenerate`, jsonRequestInit("POST", payload));
}

export async function replaceCertDrillAdminExamFormQuestionServer(examFormId: string, payload: CertDrillAdminExamFormReplaceInput): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}/questions/replace`, jsonRequestInit("POST", payload));
}

export async function setCertDrillAdminExamFormActiveServer(examFormId: string, isActive: boolean): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}/activation`, jsonRequestInit("PATCH", { isActive }));
}

export async function listCertDrillAdminScenariosServer(certificationId: string): Promise<CertDrillAdminScenario[]> {
  return certdrillAdminRequest<CertDrillAdminScenario[]>(`/certifications/${certificationId}/scenarios`);
}

export async function createCertDrillAdminScenarioServer(payload: CertDrillAdminScenarioInput): Promise<CertDrillAdminScenario> {
  return certdrillAdminRequest<CertDrillAdminScenario>("/scenarios", jsonRequestInit("POST", payload));
}

export async function updateCertDrillAdminScenarioServer(scenarioId: string, payload: Omit<CertDrillAdminScenarioInput, "certificationId">): Promise<CertDrillAdminScenario> {
  return certdrillAdminRequest<CertDrillAdminScenario>(`/scenarios/${scenarioId}`, jsonRequestInit("PATCH", payload));
}

export async function archiveCertDrillAdminScenarioServer(scenarioId: string): Promise<CertDrillAdminScenario> {
  return certdrillAdminRequest<CertDrillAdminScenario>(`/scenarios/${scenarioId}/archive`, jsonRequestInit("POST", {}));
}

export async function validateCertDrillAdminScenarioServer(scenarioId: string): Promise<CertDrillAdminScenario> {
  return certdrillAdminRequest<CertDrillAdminScenario>(`/scenarios/${scenarioId}/validate`, jsonRequestInit("POST", {}));
}

export async function publishCertDrillAdminScenarioServer(scenarioId: string): Promise<CertDrillAdminScenario> {
  return certdrillAdminRequest<CertDrillAdminScenario>(`/scenarios/${scenarioId}/publish`, jsonRequestInit("POST", {}));
}

export async function updateCertDrillAdminScenarioStatusesServer(payload: CertDrillAdminScenarioBulkStatusInput): Promise<CertDrillAdminScenario[]> {
  return certdrillAdminRequest<CertDrillAdminScenario[]>("/scenarios/status", jsonRequestInit("PATCH", payload));
}

export async function setCertDrillAdminExamFormScenariosServer(examFormId: string, scenarioIds: string[]): Promise<CertDrillAdminExamForm> {
  return certdrillAdminRequest<CertDrillAdminExamForm>(`/exam-forms/${examFormId}/scenarios`, jsonRequestInit("PUT", { scenarioIds }));
}


export async function listCertDrillAdminResourcesServer(certificationId: string): Promise<CertDrillAdminResource[]> {
  return certdrillAdminRequest<CertDrillAdminResource[]>(`/certifications/${certificationId}/resources`);
}

export async function listCertDrillAdminBlueprintParseRunsServer(certificationId: string): Promise<CertDrillBlueprintParseRun[]> {
  const result = await certdrillAdminRequest<CertDrillBlueprintParseRunApi[]>(`/certifications/${certificationId}/blueprint-parse-runs`);
  return result.map(toCertDrillBlueprintParseRun);
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

export async function ingestCertDrillAdminResourceServer(resourceId: string): Promise<CertDrillAdminResource> {
  return certdrillAdminRequest<CertDrillAdminResource>(`/resources/${resourceId}/ingest`, jsonRequestInit("POST", {}));
}

export async function startCertDrillAdminCategoryDiscoveryServer(
  certificationId: string,
  url: string,
): Promise<CertDrillBlueprintParseRun> {
  const result = await certdrillAdminRequest<CertDrillBlueprintParseRunApi>(
    `/certifications/${certificationId}/category-discoveries`,
    jsonRequestInit("POST", { url }),
  );
  return toCertDrillBlueprintParseRun(result);
}

export async function getCertDrillAdminBlueprintParseRunServer(runId: string): Promise<CertDrillBlueprintParseRun> {
  const result = await certdrillAdminRequest<CertDrillBlueprintParseRunApi>(`/blueprint-parse-runs/${runId}`);
  return toCertDrillBlueprintParseRun(result);
}

export async function startCertDrillAdminQuestionGenerationServer(
  certificationId: string,
  payload: CertDrillQuestionGenerationInput,
): Promise<CertDrillQuestionGenerationJob> {
  return certdrillAdminRequest<CertDrillQuestionGenerationJob>(
    `/certifications/${certificationId}/question-generation-jobs`,
    jsonRequestInit("POST", payload),
  );
}

export async function getCertDrillAdminQuestionGenerationJobServer(jobId: string): Promise<CertDrillQuestionGenerationJob> {
  return certdrillAdminRequest<CertDrillQuestionGenerationJob>(`/question-generation-jobs/${jobId}`);
}

export async function listCertDrillAdminQuestionGenerationJobsServer(certificationId: string): Promise<CertDrillQuestionGenerationJob[]> {
  return certdrillAdminRequest<CertDrillQuestionGenerationJob[]>(`/certifications/${certificationId}/question-generation-jobs`);
}
export async function startCertDrillAdminScenarioGenerationServer(
  certificationId: string,
  payload: CertDrillScenarioGenerationInput,
): Promise<CertDrillScenarioGenerationJob> {
  return certdrillAdminRequest<CertDrillScenarioGenerationJob>(
    `/certifications/${certificationId}/scenario-generation-jobs`,
    jsonRequestInit("POST", payload),
  );
}

export async function getCertDrillAdminScenarioGenerationJobServer(jobId: string): Promise<CertDrillScenarioGenerationJob> {
  return certdrillAdminRequest<CertDrillScenarioGenerationJob>(`/scenario-generation-jobs/${jobId}`);
}

export async function listCertDrillAdminScenarioGenerationJobsServer(certificationId: string): Promise<CertDrillScenarioGenerationJob[]> {
  return certdrillAdminRequest<CertDrillScenarioGenerationJob[]>(`/certifications/${certificationId}/scenario-generation-jobs`);
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

export async function resetCertDrillAdminUserProgressServer(userId: string): Promise<CertDrillAdminProgressResetResult> {
  return certdrillAdminRequest<CertDrillAdminProgressResetResult>(`/users/${encodeURIComponent(userId)}/progress`, { method: "DELETE" });
}
