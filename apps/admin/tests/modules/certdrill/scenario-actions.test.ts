import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  validate: vi.fn(),
  publish: vi.fn(),
  updateStatuses: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/api/certdrill.server", () => ({
  createCertDrillAdminScenarioServer: mocks.create,
  updateCertDrillAdminScenarioServer: mocks.update,
  archiveCertDrillAdminScenarioServer: mocks.archive,
  validateCertDrillAdminScenarioServer: mocks.validate,
  publishCertDrillAdminScenarioServer: mocks.publish,
  updateCertDrillAdminScenarioStatusesServer: mocks.updateStatuses,
}));

import {
  createCertDrillScenarioAction,
  archiveCertDrillScenarioAction,
  publishCertDrillScenarioAction,
  publishSelectedCertDrillScenariosAction,
  updateCertDrillScenarioAction,
  validateCertDrillScenarioAction,
  unpublishCertDrillScenarioAction,
  unpublishSelectedCertDrillScenariosAction,
} from "@/modules/certdrill/scenario-actions";
import { initialScenarioActionState } from "@/modules/certdrill/scenario-action-state";

const certificationId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";
const contentJson = {
  initialNodeKey: "start",
  nodes: [{
    key: "start",
    title: "Start",
    situation: "Choose.",
    evidence: [],
    options: [
      { key: "a", title: "A", description: "A", consequence: "A", nextNodeKey: null },
      { key: "b", title: "B", description: "B", consequence: "B", nextNodeKey: null },
    ],
  }],
};

function scenarioForm(includeId = false) {
  const formData = new FormData();
  formData.set("certificationId", certificationId);
  if (includeId) formData.set("scenarioId", scenarioId);
  formData.set("title", "Incident response");
  formData.set("description", "Branching scenario");
  formData.set("difficulty", "hard");
  formData.set("estimatedMinutes", "20");
  formData.set("contentJson", JSON.stringify(contentJson));
  return formData;
}

beforeEach(() => vi.clearAllMocks());

describe("scenario admin actions", () => {
  it("creates and updates scenario definitions", async () => {
    mocks.create.mockResolvedValue({ id: scenarioId });
    mocks.update.mockResolvedValue({ id: scenarioId });

    await expect(createCertDrillScenarioAction(initialScenarioActionState, scenarioForm())).resolves.toMatchObject({ status: "success" });
    await expect(updateCertDrillScenarioAction(initialScenarioActionState, scenarioForm(true))).resolves.toMatchObject({ status: "success" });

    const payload = { certificationId, title: "Incident response", description: "Branching scenario", difficulty: "hard", estimatedMinutes: 20, contentJson };
    expect(mocks.create).toHaveBeenCalledWith(payload);
    const updatePayload = { title: payload.title, description: payload.description, difficulty: payload.difficulty, estimatedMinutes: payload.estimatedMinutes, contentJson: payload.contentJson };
    expect(mocks.update).toHaveBeenCalledWith(scenarioId, updatePayload);
  });

  it("validates and archives scenarios", async () => {
    const base = new FormData();
    base.set("certificationId", certificationId);
    base.set("scenarioId", scenarioId);
    await expect(validateCertDrillScenarioAction(initialScenarioActionState, base)).resolves.toMatchObject({ status: "success" });
    await expect(archiveCertDrillScenarioAction(initialScenarioActionState, base)).resolves.toMatchObject({ status: "success", message: "Scenario archived." });


    expect(mocks.validate).toHaveBeenCalledWith(scenarioId);
    expect(mocks.archive).toHaveBeenCalledWith(scenarioId);
    expect(mocks.revalidatePath).toHaveBeenCalled();
  });

  it("publishes and unpublishes individual and selected scenarios", async () => {
    const single = new FormData();
    single.set("certificationId", certificationId);
    single.set("scenarioId", scenarioId);
    await expect(publishCertDrillScenarioAction(initialScenarioActionState, single)).resolves.toMatchObject({ status: "success" });
    await expect(unpublishCertDrillScenarioAction(initialScenarioActionState, single)).resolves.toMatchObject({ status: "success" });

    const selected = new FormData();
    selected.set("certificationId", certificationId);
    selected.append("scenarioIds", scenarioId);
    selected.append("scenarioIds", scenarioId);
    await publishSelectedCertDrillScenariosAction(selected);
    await unpublishSelectedCertDrillScenariosAction(selected);

    expect(mocks.publish).toHaveBeenCalledWith(scenarioId);
    expect(mocks.updateStatuses).toHaveBeenCalledWith({ scenarioIds: [scenarioId], status: "published" });
    expect(mocks.updateStatuses).toHaveBeenCalledWith({ scenarioIds: [scenarioId], status: "draft" });
  });

  it("returns an actionable error for malformed scenario JSON", async () => {
    const formData = scenarioForm();
    formData.set("contentJson", "not-json");
    await expect(createCertDrillScenarioAction(initialScenarioActionState, formData)).resolves.toEqual({
      status: "error",
      message: "Scenario definition must be valid JSON.",
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
