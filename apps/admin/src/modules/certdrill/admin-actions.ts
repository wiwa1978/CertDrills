"use server";

import { revalidatePath } from "next/cache";
import type { CertDrillDifficulty } from "@platform/contracts";

import {
  createCertDrillAdminCategoryServer,
  createCertDrillAdminCertificationServer,
  createCertDrillAdminExamFormServer,
  createCertDrillAdminMockGenerationJobServer,
  createCertDrillAdminQuestionServer,
  createCertDrillAdminResourceServer,
  ingestCertDrillAdminResourceServer,
  archiveCertDrillAdminCategoryServer,
  archiveCertDrillAdminCertificationServer,
  publishCertDrillAdminQuestionServer,
  updateCertDrillAdminCategoryServer,
  updateCertDrillAdminCertificationServer,
  updateCertDrillAdminExamFormServer,
  updateCertDrillAdminQuestionFeedbackServer,
  updateCertDrillAdminQuestionServer,
  updateCertDrillAdminResourceServer,
  type CertDrillAdminCertificationUpdateInput,
  type CertDrillAdminExamFormUpdateInput,
  type CertDrillAdminQuestionOptionInput,
  type CertDrillAdminQuestionUpdateInput,
  type CertDrillAdminResourceInput,
  type CertDrillAdminResourceUpdateInput,
} from "@/lib/api/certdrill.server";
import {
  parseQuestionAnswerFields,
} from "./question-answer-fields";
import {
  validateQuestionForm,
} from "./question-form-validation";
import type { QuestionFormActionState } from "./question-form-state";

const CLEAR_RELATIONSHIP_SENTINEL = "__none__";

function questionFormError(error: unknown) {
  return error instanceof Error ? error.message : "Question could not be saved.";
}

function revalidateCertDrillAdminPage() {
  revalidatePath("/[locale]/admin/certdrill", "page");
  revalidatePath("/admin/certdrill");
  revalidatePath("/[locale]/admin/questions", "page");
  revalidatePath("/admin/questions");
}

function requiredString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(formData: FormData, name: string) {
  const value = requiredString(formData, name);
  return value || undefined;
}

function nullableString(formData: FormData, name: string) {
  return optionalString(formData, name) ?? null;
}

function submittedString(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  return optionalString(formData, name);
}

function submittedNullableString(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  const value = requiredString(formData, name);
  if (value === CLEAR_RELATIONSHIP_SENTINEL) return null;
  return value || undefined;
}

function optionalNumber(formData: FormData, name: string) {
  const value = optionalString(formData, name);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nullableNumber(formData: FormData, name: string) {
  return optionalNumber(formData, name) ?? null;
}

function submittedNumber(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  return optionalNumber(formData, name);
}

function submittedNullableNumber(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  const value = requiredString(formData, name);
  if (value === CLEAR_RELATIONSHIP_SENTINEL) return null;
  const parsed = Number(value);
  return value && Number.isFinite(parsed) ? parsed : undefined;
}

function checkboxValue(formData: FormData, name: string) {
  return formData.get(name) === "on";
}

function submittedBoolean(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  const value = formData.get(name);
  if (value === "true" || value === "on" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

function csvList(formData: FormData, name: string) {
  return requiredString(formData, name)
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function submittedCsvList(formData: FormData, name: string) {
  if (!formData.has(name)) return undefined;
  const values = csvList(formData, name);
  return values.length > 0 ? values : undefined;
}

function uniqueFormValues(values: FormDataEntryValue[]) {
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
}

function examFormQuestionIds(formData: FormData) {
  const manualQuestionIds = csvList(formData, "questionIds");
  if (manualQuestionIds.length > 0) return uniqueFormValues(manualQuestionIds);

  if (formData.has("questionPickerPresent")) {
    return uniqueFormValues(formData.getAll("selectedQuestionIds"));
  }

  return uniqueFormValues(manualQuestionIds);
}

function submittedExamFormQuestionIds(formData: FormData) {
  if (!formData.has("questionIds") && !formData.has("questionPickerPresent")) return undefined;
  return examFormQuestionIds(formData);
}

function compact<T extends Record<string, unknown>>(payload: T) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined)) as Partial<T>;
}

function difficultyValue(formData: FormData): CertDrillDifficulty | undefined {
  const value = optionalString(formData, "difficulty");
  return value === "easy" || value === "medium" || value === "hard" ? value : undefined;
}

function questionStatusValue(formData: FormData) {
  const value = optionalString(formData, "status");
  return value === "draft" || value === "published" || value === "archived" ? value : undefined;
}

function submittedDifficultyValue(formData: FormData): CertDrillDifficulty | undefined {
  if (!formData.has("difficulty")) return undefined;
  return difficultyValue(formData);
}

function submittedQuestionStatusValue(formData: FormData) {
  if (!formData.has("status")) return undefined;
  return questionStatusValue(formData);
}

function feedbackStatusValue(formData: FormData) {
  const value = optionalString(formData, "status");
  return value === "reviewed" || value === "resolved" ? value : undefined;
}

function resourceSourceTypeValue(formData: FormData): CertDrillAdminResourceInput["sourceType"] {
  const value = optionalString(formData, "sourceType");
  if (value === "unit" || value === "study-guide" || value === "exam-blueprint" || value === "doc") {
    return value;
  }
  return "module";
}

function submittedResourceSourceTypeValue(formData: FormData): CertDrillAdminResourceInput["sourceType"] | undefined {
  if (!formData.has("sourceType")) return undefined;
  const value = optionalString(formData, "sourceType");
  if (value === "module" || value === "unit" || value === "study-guide" || value === "exam-blueprint" || value === "doc") {
    return value;
  }
  return undefined;
}

function resourceContentModeValue(formData: FormData): CertDrillAdminResourceInput["contentMode"] {
  return optionalString(formData, "contentMode") === "outline_blueprint" ? "outline_blueprint" : "deep_content";
}

function submittedResourceContentModeValue(formData: FormData): CertDrillAdminResourceInput["contentMode"] | undefined {
  if (!formData.has("contentMode")) return undefined;
  const value = optionalString(formData, "contentMode");
  if (value === "deep_content" || value === "outline_blueprint") return value;
  return undefined;
}

function resourceStatusValue(formData: FormData): CertDrillAdminResourceInput["status"] {
  const value = optionalString(formData, "status");
  return value === "ingested" || value === "failed" ? value : "pending";
}

function submittedResourceStatusValue(formData: FormData): CertDrillAdminResourceInput["status"] | undefined {
  if (!formData.has("status")) return undefined;
  const value = optionalString(formData, "status");
  if (value === "pending" || value === "ingested" || value === "failed") return value;
  return undefined;
}

function questionOptions(formData: FormData): CertDrillAdminQuestionOptionInput[] {
  const parsed = parseQuestionAnswerFields(formData);
  return parsed.answers.map((answer, index) => ({
    text: answer.text,
    isCorrect: parsed.correctAnswerKey === answer.key,
    explanation: answer.explanation,
    citationUrls: answer.citationUrls,
    sortOrder: index,
  }));
}

function submittedQuestionOptions(formData: FormData) {
  if (!formData.has("answerKeys")) return undefined;
  return questionOptions(formData);
}

export async function createCertDrillCertificationAction(formData: FormData) {
  await createCertDrillAdminCertificationServer({
    code: requiredString(formData, "code"),
    name: requiredString(formData, "name"),
    vendor: requiredString(formData, "vendor"),
    logoUrl: nullableString(formData, "logoUrl"),
    blueprintSourceUrl: nullableString(formData, "blueprintSourceUrl"),
    description: nullableString(formData, "description"),
    questionCountDefault: optionalNumber(formData, "questionCountDefault"),
    quickDrillQuestionCount: optionalNumber(formData, "quickDrillQuestionCount"),
    categoryDrillQuestionCount: optionalNumber(formData, "categoryDrillQuestionCount"),
    examSimulationQuestionCount: nullableNumber(formData, "examSimulationQuestionCount"),
    examSimulationDurationMinutes: optionalNumber(formData, "examSimulationDurationMinutes"),
    passThresholdPct: optionalNumber(formData, "passThresholdPct"),
    isActive: checkboxValue(formData, "isActive"),
    enabledAt: nullableString(formData, "enabledAt"),
  });
  revalidateCertDrillAdminPage();
}

export async function updateCertDrillCertificationAction(formData: FormData) {
  const certificationId = requiredString(formData, "certificationId");
  const payload = compact({
    code: submittedString(formData, "code"),
    name: submittedString(formData, "name"),
    vendor: submittedString(formData, "vendor"),
    logoUrl: submittedNullableString(formData, "logoUrl"),
    blueprintSourceUrl: submittedNullableString(formData, "blueprintSourceUrl"),
    description: submittedNullableString(formData, "description"),
    questionCountDefault: submittedNumber(formData, "questionCountDefault"),
    quickDrillQuestionCount: submittedNumber(formData, "quickDrillQuestionCount"),
    categoryDrillQuestionCount: submittedNumber(formData, "categoryDrillQuestionCount"),
    examSimulationQuestionCount: submittedNullableNumber(formData, "examSimulationQuestionCount"),
    examSimulationDurationMinutes: submittedNumber(formData, "examSimulationDurationMinutes"),
    passThresholdPct: submittedNumber(formData, "passThresholdPct"),
    isActive: submittedBoolean(formData, "isActive"),
    enabledAt: submittedNullableString(formData, "enabledAt"),
    archivedAt: submittedNullableString(formData, "archivedAt"),
  }) as CertDrillAdminCertificationUpdateInput;

  await updateCertDrillAdminCertificationServer(certificationId, payload);
  revalidateCertDrillAdminPage();
}

export async function archiveCertDrillCertificationAction(formData: FormData) {
  const certificationId = requiredString(formData, "certificationId");
  if (!certificationId) return;
  await archiveCertDrillAdminCertificationServer(certificationId);
  revalidateCertDrillAdminPage();
}

export async function createCertDrillCategoryAction(formData: FormData) {
  await createCertDrillAdminCategoryServer({
    certificationId: requiredString(formData, "certificationId"),
    parentCategoryId: nullableString(formData, "parentCategoryId"),
    code: requiredString(formData, "code"),
    name: requiredString(formData, "name"),
    weightPct: nullableString(formData, "weightPct"),
    drillQuestionCount: nullableNumber(formData, "drillQuestionCount"),
    sortOrder: optionalNumber(formData, "sortOrder"),
  });
  revalidateCertDrillAdminPage();
}

export async function updateCertDrillCategoryAction(formData: FormData) {
  const categoryId = requiredString(formData, "categoryId");
  await updateCertDrillAdminCategoryServer(categoryId, compact({
    certificationId: submittedString(formData, "certificationId"),
    parentCategoryId: submittedNullableString(formData, "parentCategoryId"),
    code: submittedString(formData, "code"),
    name: submittedString(formData, "name"),
    weightPct: submittedString(formData, "weightPct"),
    drillQuestionCount: submittedNumber(formData, "drillQuestionCount"),
    sortOrder: submittedNumber(formData, "sortOrder"),
  }));
  revalidateCertDrillAdminPage();
}

export async function archiveCertDrillCategoryAction(formData: FormData) {
  const categoryId = requiredString(formData, "categoryId");
  if (!categoryId) return;
  await archiveCertDrillAdminCategoryServer(categoryId);
  revalidateCertDrillAdminPage();
}

export async function createCertDrillQuestionAction(
  _previousState: QuestionFormActionState,
  formData: FormData,
): Promise<QuestionFormActionState> {
  const validation = validateQuestionForm(formData);
  if (!validation.valid) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  try {
    await createCertDrillAdminQuestionServer({
      certificationId: requiredString(formData, "certificationId"),
      categoryId: requiredString(formData, "categoryId"),
      stem: requiredString(formData, "stem"),
      difficulty: difficultyValue(formData),
      status: questionStatusValue(formData) ?? "draft",
      createdBy: "admin",
      sourceResourceId: nullableString(formData, "sourceResourceId"),
      options: questionOptions(formData),
    });
    revalidateCertDrillAdminPage();
    return { status: "success", fieldErrors: {}, message: "Question created." };
  } catch (error) {
    return { status: "error", fieldErrors: {}, formError: questionFormError(error) };
  }
}

export async function updateCertDrillQuestionAction(
  _previousState: QuestionFormActionState,
  formData: FormData,
): Promise<QuestionFormActionState> {
  const validation = validateQuestionForm(formData);
  if (!validation.valid) {
    return { status: "error", fieldErrors: validation.fieldErrors };
  }

  const questionId = requiredString(formData, "questionId");
  if (!questionId) {
    return { status: "error", fieldErrors: {}, formError: "Question ID is required." };
  }

  const payload = compact({
    categoryId: submittedString(formData, "categoryId"),
    stem: submittedString(formData, "stem"),
    difficulty: submittedDifficultyValue(formData),
    status: submittedQuestionStatusValue(formData),
    sourceResourceId: submittedNullableString(formData, "sourceResourceId"),
    options: submittedQuestionOptions(formData),
  }) as CertDrillAdminQuestionUpdateInput;

  try {
    await updateCertDrillAdminQuestionServer(questionId, payload);
    revalidateCertDrillAdminPage();
    return { status: "success", fieldErrors: {}, message: "Question updated." };
  } catch (error) {
    return { status: "error", fieldErrors: {}, formError: questionFormError(error) };
  }
}

export async function publishCertDrillQuestionAction(formData: FormData) {
  await publishCertDrillAdminQuestionServer(requiredString(formData, "questionId"));
  revalidateCertDrillAdminPage();
}

export async function archiveCertDrillQuestionAction(formData: FormData) {
  const questionId = requiredString(formData, "questionId");
  if (!questionId) return;
  await updateCertDrillAdminQuestionServer(questionId, { status: "archived" });
  revalidateCertDrillAdminPage();
}

export async function createCertDrillExamFormAction(formData: FormData) {
  await createCertDrillAdminExamFormServer({
    certificationId: requiredString(formData, "certificationId"),
    name: requiredString(formData, "name"),
    description: nullableString(formData, "description"),
    durationMinutes: optionalNumber(formData, "durationMinutes"),
    questionIds: examFormQuestionIds(formData),
    sortOrder: optionalNumber(formData, "sortOrder"),
    isActive: checkboxValue(formData, "isActive"),
  });
  revalidateCertDrillAdminPage();
}

export async function updateCertDrillExamFormAction(formData: FormData) {
  const examFormId = requiredString(formData, "examFormId");
  const payload = compact({
    certificationId: submittedString(formData, "certificationId"),
    name: submittedString(formData, "name"),
    description: submittedString(formData, "description"),
    durationMinutes: submittedNumber(formData, "durationMinutes"),
    questionIds: submittedExamFormQuestionIds(formData),
    sortOrder: submittedNumber(formData, "sortOrder"),
    isActive: submittedBoolean(formData, "isActive"),
  }) as CertDrillAdminExamFormUpdateInput;

  await updateCertDrillAdminExamFormServer(examFormId, payload);
  revalidateCertDrillAdminPage();
}

export async function createCertDrillResourceAction(formData: FormData) {
  await createCertDrillAdminResourceServer({
    certificationId: requiredString(formData, "certificationId"),
    categoryId: nullableString(formData, "categoryId"),
    url: requiredString(formData, "url"),
    title: requiredString(formData, "title"),
    sourceType: resourceSourceTypeValue(formData),
    contentMode: resourceContentModeValue(formData),
    rawContent: nullableString(formData, "rawContent"),
    status: resourceStatusValue(formData),
  });
  revalidateCertDrillAdminPage();
}

export async function updateCertDrillResourceAction(formData: FormData) {
  const resourceId = requiredString(formData, "resourceId");
  const payload = compact({
    certificationId: submittedString(formData, "certificationId"),
    categoryId: submittedNullableString(formData, "categoryId"),
    url: submittedString(formData, "url"),
    title: submittedString(formData, "title"),
    sourceType: submittedResourceSourceTypeValue(formData),
    contentMode: submittedResourceContentModeValue(formData),
    rawContent: submittedString(formData, "rawContent"),
    status: submittedResourceStatusValue(formData),
  }) as CertDrillAdminResourceUpdateInput;

  await updateCertDrillAdminResourceServer(resourceId, payload);
  revalidateCertDrillAdminPage();
}

export async function ingestCertDrillResourceAction(formData: FormData) {
  const resourceId = requiredString(formData, "resourceId");
  if (!resourceId) {
    throw new Error("Resource ID is required.");
  }

  try {
    await ingestCertDrillAdminResourceServer(resourceId);
  } finally {
    revalidateCertDrillAdminPage();
  }
}

export async function createCertDrillMockGenerationAction(formData: FormData) {
  await createCertDrillAdminMockGenerationJobServer({
    certificationId: requiredString(formData, "certificationId"),
    categoryId: requiredString(formData, "categoryId"),
    prompt: requiredString(formData, "prompt"),
    topic: nullableString(formData, "topic"),
    requestedCount: optionalNumber(formData, "requestedCount"),
    resourceIds: csvList(formData, "resourceIds"),
  });
  revalidateCertDrillAdminPage();
}

export async function updateCertDrillQuestionFeedbackAction(formData: FormData) {
  const feedbackId = requiredString(formData, "feedbackId");
  const status = feedbackStatusValue(formData);
  if (!feedbackId || !status) return;

  await updateCertDrillAdminQuestionFeedbackServer(feedbackId, { status });
  revalidateCertDrillAdminPage();
}
