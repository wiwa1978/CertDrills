"use server";

import { ApiRequestError } from "@platform/frontend-shared";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createCertDrillAdminExamFormServer,
  regenerateCertDrillAdminExamFormServer,
  replaceCertDrillAdminExamFormQuestionServer,
  setCertDrillAdminExamFormActiveServer,
  updateCertDrillAdminExamFormMetadataServer,
} from "@/lib/api/certdrill.server";

import { examFormEditorHref, examFormListHref } from "./exam-form-href";

export type ExamFormActionState = {
  status: "idle" | "error" | "success";
  formError?: string;
  fieldErrors: Partial<Record<"name" | "durationMinutes" | "targetQuestionCount", string[]>>;
};

export const initialExamFormActionState: ExamFormActionState = { status: "idle", fieldErrors: {} };

function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

function positiveInteger(formData: FormData, name: "durationMinutes" | "targetQuestionCount") {
  const parsed = Number(value(formData, name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function actionError(error: unknown): ExamFormActionState {
  if (error instanceof ApiRequestError && error.errorCode === "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT") {
    return { status: "error", fieldErrors: {}, formError: "This assignment changed after the page loaded. Reload and try again." };
  }
  return { status: "error", fieldErrors: {}, formError: error instanceof Error ? error.message.replace(/^API error \(\d+\):\s*/, "") : "Exam form could not be saved." };
}

function revalidateExamForm(certificationId: string, examFormId?: string) {
  revalidatePath(examFormListHref(certificationId));
  if (examFormId) revalidatePath(examFormEditorHref(certificationId, examFormId));
}

export async function createCertDrillExamFormAction(_state: ExamFormActionState, formData: FormData): Promise<ExamFormActionState> {
  const certificationId = value(formData, "certificationId");
  const name = value(formData, "name");
  const durationMinutes = positiveInteger(formData, "durationMinutes");
  const targetQuestionCount = positiveInteger(formData, "targetQuestionCount");
  const fieldErrors: ExamFormActionState["fieldErrors"] = {};
  if (!name) fieldErrors.name = ["Name is required."];
  if (!durationMinutes) fieldErrors.durationMinutes = ["Enter a positive whole number."];
  if (!targetQuestionCount) fieldErrors.targetQuestionCount = ["Enter a positive whole number."];
  if (Object.keys(fieldErrors).length) return { status: "error", fieldErrors };
  try {
    const created = await createCertDrillAdminExamFormServer({ certificationId, name, durationMinutes: durationMinutes!, targetQuestionCount: targetQuestionCount! });
    revalidateExamForm(certificationId, created.id);
    redirect(examFormEditorHref(certificationId, created.id));
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) throw error;
    return actionError(error);
  }
}

export async function updateCertDrillExamFormMetadataAction(_state: ExamFormActionState, formData: FormData): Promise<ExamFormActionState> {
  const certificationId = value(formData, "certificationId");
  const examFormId = value(formData, "examFormId");
  const name = value(formData, "name");
  const durationMinutes = positiveInteger(formData, "durationMinutes");
  if (!name || !durationMinutes) return { status: "error", fieldErrors: { ...(!name ? { name: ["Name is required."] } : {}), ...(!durationMinutes ? { durationMinutes: ["Enter a positive whole number."] } : {}) } };
  try {
    await updateCertDrillAdminExamFormMetadataServer(examFormId, { name, durationMinutes });
    revalidateExamForm(certificationId, examFormId);
    return { status: "success", fieldErrors: {} };
  } catch (error) { return actionError(error); }
}

export async function regenerateCertDrillExamFormAction(_state: ExamFormActionState, formData: FormData): Promise<ExamFormActionState> {
  const certificationId = value(formData, "certificationId");
  const examFormId = value(formData, "examFormId");
  const targetQuestionCount = positiveInteger(formData, "targetQuestionCount");
  if (!targetQuestionCount) return { status: "error", fieldErrors: { targetQuestionCount: ["Enter a positive whole number."] } };
  try {
    await regenerateCertDrillAdminExamFormServer(examFormId, { targetQuestionCount, expectedAssignmentVersion: Number(value(formData, "expectedAssignmentVersion")) });
    revalidateExamForm(certificationId, examFormId);
    return { status: "success", fieldErrors: {} };
  } catch (error) { return actionError(error); }
}

export async function replaceCertDrillExamFormQuestionAction(_state: ExamFormActionState, formData: FormData): Promise<ExamFormActionState> {
  const certificationId = value(formData, "certificationId");
  const examFormId = value(formData, "examFormId");
  try {
    await replaceCertDrillAdminExamFormQuestionServer(examFormId, { currentQuestionId: value(formData, "currentQuestionId"), replacementQuestionId: value(formData, "replacementQuestionId"), expectedAssignmentVersion: Number(value(formData, "expectedAssignmentVersion")) });
    revalidateExamForm(certificationId, examFormId);
    return { status: "success", fieldErrors: {} };
  } catch (error) { return actionError(error); }
}

export async function setCertDrillExamFormActiveAction(_state: ExamFormActionState, formData: FormData): Promise<ExamFormActionState> {
  const certificationId = value(formData, "certificationId");
  const examFormId = value(formData, "examFormId");
  try {
    await setCertDrillAdminExamFormActiveServer(examFormId, value(formData, "isActive") === "true");
    revalidateExamForm(certificationId, examFormId);
    return { status: "success", fieldErrors: {} };
  } catch (error) { return actionError(error); }
}

export async function deactivateCertDrillExamFormAction(formData: FormData) {
  const certificationId = value(formData, "certificationId");
  await setCertDrillAdminExamFormActiveServer(value(formData, "examFormId"), false);
  revalidateExamForm(certificationId);
}
