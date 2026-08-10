"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "node:crypto";
import type { CertDrillDifficulty } from "@platform/contracts";

import {
  createCertDrillAdminCategoryServer,
  createCertDrillAdminCertificationServer,
  createCertDrillAdminQuestionServer,
  archiveCertDrillAdminCategoryServer,
  archiveCertDrillAdminCertificationServer,
  publishCertDrillAdminQuestionServer,
  updateCertDrillAdminCategoryServer,
  updateCertDrillAdminCertificationServer,
  updateCertDrillAdminQuestionFeedbackServer,
  updateCertDrillAdminQuestionServer,
  updateCertDrillAdminQuestionStatusesServer,
  updateCertDrillAdminQuestionDeliveryPurposesServer,
  type CertDrillAdminCertificationUpdateInput,
  type CertDrillAdminQuestionOptionInput,
  type CertDrillAdminQuestionInteraction,
  type CertDrillAdminQuestionType,
  type CertDrillAdminQuestionUpdateInput,
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


function uniqueFormValues(values: FormDataEntryValue[]) {
  return [...new Set(values
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean))];
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

function questionDeliveryPurposeValue(formData: FormData) {
  const value = optionalString(formData, "deliveryPurpose");
  return value === "practice" || value === "assessment" || value === "both" ? value : undefined;
}

function submittedDifficultyValue(formData: FormData): CertDrillDifficulty | undefined {
  if (!formData.has("difficulty")) return undefined;
  return difficultyValue(formData);
}

function submittedQuestionStatusValue(formData: FormData) {
  if (!formData.has("status")) return undefined;
  return questionStatusValue(formData);
}

function submittedQuestionDeliveryPurposeValue(formData: FormData) {
  if (!formData.has("deliveryPurpose")) return undefined;
  return questionDeliveryPurposeValue(formData);
}

function feedbackStatusValue(formData: FormData) {
  const value = optionalString(formData, "status");
  return value === "reviewed" || value === "resolved" ? value : undefined;
}

function questionTypeValue(formData: FormData): CertDrillAdminQuestionType {
  const value = optionalString(formData, "questionType");
  return value === "fill_blank" || value === "matching" ? value : "single_choice";
}

function lines(formData: FormData, name: string) {
  return (optionalString(formData, name) ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
}

function values(formData: FormData, name: string) {
  return formData.getAll(name).map((value) => typeof value === "string" ? value.trim() : "");
}

function questionInteraction(formData: FormData, questionType: CertDrillAdminQuestionType): CertDrillAdminQuestionInteraction | null {
  if (questionType === "single_choice") return null;
  if (questionType === "fill_blank") {
    return {
      type: "fill_blank",
      acceptedAnswers: lines(formData, "acceptedAnswers"),
      explanation: optionalString(formData, "interactionExplanation") ?? "",
      citationUrls: lines(formData, "interactionCitationUrls"),
    };
  }

  const ids = values(formData, "matchingPairIds");
  const prompts = values(formData, "matchingPrompts");
  const targets = values(formData, "matchingTargets");
  const explanations = values(formData, "matchingExplanations");
  const citationGroups = values(formData, "matchingCitationUrls");
  return {
    type: "matching",
    pairs: prompts.map((prompt, index) => {
      const [promptId, targetId] = (ids[index] ?? "").split(":");
      return {
        promptId: promptId || randomUUID(),
        targetId: targetId || randomUUID(),
        prompt,
        target: targets[index] ?? "",
        explanation: explanations[index] ?? "",
        citationUrls: (citationGroups[index] ?? "").split(/\r?\n/).map((value) => value.trim()).filter(Boolean),
      };
    }),
  };
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
    examSimulationScenarioCount: optionalNumber(formData, "examSimulationScenarioCount"),
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
    examSimulationScenarioCount: submittedNumber(formData, "examSimulationScenarioCount"),
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
    const questionType = questionTypeValue(formData);
    await createCertDrillAdminQuestionServer({
      certificationId: requiredString(formData, "certificationId"),
      categoryId: requiredString(formData, "categoryId"),
      stem: requiredString(formData, "stem"),
      questionType,
      interactionJson: questionInteraction(formData, questionType),
      difficulty: difficultyValue(formData),
      status: questionStatusValue(formData) ?? "draft",
      deliveryPurpose: questionDeliveryPurposeValue(formData) ?? "both",
      createdBy: "admin",
      sourceResourceId: nullableString(formData, "sourceResourceId"),
      options: questionType === "single_choice" ? questionOptions(formData) : [],
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

  const questionType = questionTypeValue(formData);
  const payload = compact({
    categoryId: submittedString(formData, "categoryId"),
    stem: submittedString(formData, "stem"),
    questionType,
    interactionJson: questionInteraction(formData, questionType),
    difficulty: submittedDifficultyValue(formData),
    status: submittedQuestionStatusValue(formData),
    deliveryPurpose: submittedQuestionDeliveryPurposeValue(formData),
    sourceResourceId: submittedNullableString(formData, "sourceResourceId"),
    options: questionType === "single_choice" ? submittedQuestionOptions(formData) : [],
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

async function updateSelectedQuestionStatus(formData: FormData, status: "draft" | "published") {
  const questionIds = uniqueFormValues(formData.getAll("questionIds"));
  if (questionIds.length === 0) return;
  await updateCertDrillAdminQuestionStatusesServer({ questionIds, status });
  revalidateCertDrillAdminPage();
}

export async function publishSelectedCertDrillQuestionsAction(formData: FormData) {
  await updateSelectedQuestionStatus(formData, "published");
}

export async function unpublishSelectedCertDrillQuestionsAction(formData: FormData) {
  await updateSelectedQuestionStatus(formData, "draft");
}

async function updateSelectedQuestionDeliveryPurpose(formData: FormData, deliveryPurpose: "practice" | "assessment") {
  const questionIds = uniqueFormValues(formData.getAll("questionIds"));
  if (questionIds.length === 0) return;
  await updateCertDrillAdminQuestionDeliveryPurposesServer({ questionIds, deliveryPurpose });
  revalidateCertDrillAdminPage();
}

export async function setSelectedCertDrillQuestionsPracticeAction(formData: FormData) {
  await updateSelectedQuestionDeliveryPurpose(formData, "practice");
}

export async function setSelectedCertDrillQuestionsAssessmentAction(formData: FormData) {
  await updateSelectedQuestionDeliveryPurpose(formData, "assessment");
}

export async function archiveCertDrillQuestionAction(formData: FormData) {
  const questionId = requiredString(formData, "questionId");
  if (!questionId) return;
  await updateCertDrillAdminQuestionServer(questionId, { status: "archived" });
  revalidateCertDrillAdminPage();
}



export async function updateCertDrillQuestionFeedbackAction(formData: FormData) {
  const feedbackId = requiredString(formData, "feedbackId");
  const status = feedbackStatusValue(formData);
  if (!feedbackId || !status) return;

  await updateCertDrillAdminQuestionFeedbackServer(feedbackId, { status });
  revalidateCertDrillAdminPage();
}
