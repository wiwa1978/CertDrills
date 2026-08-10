"use server";

import { revalidatePath } from "next/cache";

import {
  createCertDrillAdminScenarioServer,
  archiveCertDrillAdminScenarioServer,
  publishCertDrillAdminScenarioServer,
  updateCertDrillAdminScenarioServer,
  updateCertDrillAdminScenarioStatusesServer,
  validateCertDrillAdminScenarioServer,
  type CertDrillAdminScenarioContent,
  type CertDrillAdminScenarioInput,
} from "@/lib/api/certdrill.server";
import type { ScenarioActionState } from "./scenario-action-state";


function value(formData: FormData, name: string) {
  const entry = formData.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

function revalidateScenarioAdmin(certificationId: string) {
  revalidatePath(`/admin/certdrill/${certificationId}`);
  revalidatePath("/[locale]/admin/certdrill/[certificationId]", "page");
}

function actionError(error: unknown): ScenarioActionState {
  return { status: "error", message: error instanceof Error ? error.message : "Scenario operation failed." };
}

function scenarioInput(formData: FormData): CertDrillAdminScenarioInput {
  const certificationId = value(formData, "certificationId");
  const title = value(formData, "title");
  const description = value(formData, "description") || null;
  const difficultyValue = value(formData, "difficulty");
  const difficulty = difficultyValue === "easy" || difficultyValue === "hard" ? difficultyValue : "medium";
  const estimatedMinutes = Number(value(formData, "estimatedMinutes"));
  let contentJson: CertDrillAdminScenarioContent;
  try {
    contentJson = JSON.parse(value(formData, "contentJson")) as CertDrillAdminScenarioContent;
  } catch {
    throw new Error("Scenario definition must be valid JSON.");
  }
  return { certificationId, title, description, difficulty, estimatedMinutes, contentJson };
}

export async function createCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  try {
    const input = scenarioInput(formData);
    await createCertDrillAdminScenarioServer(input);
    revalidateScenarioAdmin(input.certificationId);
    return { status: "success", message: "Scenario created as Draft." };
  } catch (error) {
    return actionError(error);
  }
}

export async function updateCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  try {
    const scenarioId = value(formData, "scenarioId");
    const input = scenarioInput(formData);
    const { certificationId, ...payload } = input;
    await updateCertDrillAdminScenarioServer(scenarioId, payload);
    revalidateScenarioAdmin(certificationId);
    return { status: "success", message: "Scenario updated and returned to Draft." };
  } catch (error) {
    return actionError(error);
  }
}

export async function validateCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  const certificationId = value(formData, "certificationId");
  try {
    await validateCertDrillAdminScenarioServer(value(formData, "scenarioId"));
    revalidateScenarioAdmin(certificationId);
    return { status: "success", message: "Scenario validated." };
  } catch (error) {
    return actionError(error);
  }
}

export async function publishCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  const certificationId = value(formData, "certificationId");
  try {
    await publishCertDrillAdminScenarioServer(value(formData, "scenarioId"));
    revalidateScenarioAdmin(certificationId);
    return { status: "success", message: "Scenario published." };
  } catch (error) {
    return actionError(error);
  }
}

export async function unpublishCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  const certificationId = value(formData, "certificationId");
  try {
    await updateCertDrillAdminScenarioStatusesServer({ scenarioIds: [value(formData, "scenarioId")], status: "draft" });
    revalidateScenarioAdmin(certificationId);
    return { status: "success", message: "Scenario returned to Draft." };
  } catch (error) {
    return actionError(error);
  }
}

async function updateSelectedScenarioStatus(formData: FormData, status: "draft" | "published") {
  const scenarioIds = [...new Set(formData.getAll("scenarioIds").filter((entry): entry is string => typeof entry === "string" && entry.length > 0))];
  await updateCertDrillAdminScenarioStatusesServer({ scenarioIds, status });
  revalidateScenarioAdmin(value(formData, "certificationId"));
}

export async function publishSelectedCertDrillScenariosAction(formData: FormData) {
  await updateSelectedScenarioStatus(formData, "published");
}

export async function unpublishSelectedCertDrillScenariosAction(formData: FormData) {
  await updateSelectedScenarioStatus(formData, "draft");
}

export async function archiveCertDrillScenarioAction(_state: ScenarioActionState, formData: FormData): Promise<ScenarioActionState> {
  const certificationId = value(formData, "certificationId");
  try {
    await archiveCertDrillAdminScenarioServer(value(formData, "scenarioId"));
    revalidateScenarioAdmin(certificationId);
    return { status: "success", message: "Scenario archived." };
  } catch (error) {
    return actionError(error);
  }
}
