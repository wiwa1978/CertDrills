import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";


vi.mock("@/modules/certdrill/scenario-actions", () => ({
  createCertDrillScenarioAction: vi.fn(),
  updateCertDrillScenarioAction: vi.fn(),
  archiveCertDrillScenarioAction: vi.fn(),
  publishSelectedCertDrillScenariosAction: vi.fn(),
  unpublishSelectedCertDrillScenariosAction: vi.fn(),
  initialScenarioActionState: { status: "idle" },
}));
vi.mock("@/modules/certdrill/scenario-generation-control", () => ({
  ScenarioGenerationControl: () => createElement("button", null, "Generate Scenarios with AI"),
  ScenarioGenerationStatusBanner: () => null,
}));
import { ScenarioAdmin } from "@/modules/certdrill/scenario-admin";

const certificationId = "11111111-1111-4111-8111-111111111111";
const scenarioId = "22222222-2222-4222-8222-222222222222";
const examFormId = "33333333-3333-4333-8333-333333333333";
const contentJson = {
  initialNodeKey: "start",
  nodes: [{
    key: "start",
    title: "Start",
    situation: "Choose a response.",
    evidence: ["Signal"],
    options: [
      { key: "a", title: "A", description: "Action A", consequence: "Outcome A", nextNodeKey: null },
      { key: "b", title: "B", description: "Action B", consequence: "Outcome B", nextNodeKey: null },
    ],
  }],
};

describe("ScenarioAdmin", () => {
  it("renders scenario administration with a question-style row actions menu", () => {
    const markup = renderToStaticMarkup(createElement(ScenarioAdmin, {
      certificationId,
      scenarios: [{
        id: scenarioId,
        certificationId,
        title: "Privilege escalation response",
        description: "Validate the incident response path.",
        difficulty: "medium",
        estimatedMinutes: 15,
        status: "validated",
        contentJson,
        validatedAt: "2026-08-10T10:00:00.000Z",
        examFormIds: [examFormId],
        createdAt: "2026-08-10T09:00:00.000Z",
        updatedAt: "2026-08-10T10:00:00.000Z",
      }],
      examForms: [{
        id: examFormId,
        certificationId,
        name: "Exam Form A",
        description: null,
        sortOrder: 1,
        isActive: false,
        durationMinutes: 120,
        targetQuestionCount: 60,
        questionIds: [],
        assignmentVersion: 1,
        allocationSnapshot: [],
        scenarioIds: [scenarioId],
        generatedAt: "2026-08-10T09:00:00.000Z",
      }],
    }));

    expect(markup).toContain("Create scenario");
    expect(markup).toContain("Privilege escalation response");
    expect(markup).toContain("Validated");
    expect(markup).toContain(`aria-label="Actions for ${scenarioId}"`);
    expect(markup).not.toContain(`id="validate-scenario-${scenarioId}"`);
    expect(markup).not.toContain(`id="publish-scenario-${scenarioId}"`);
    expect(markup).toContain(`aria-label="Select scenario ${scenarioId}"`);
    expect(markup).toContain('aria-controls="scenario-new-dialog"');
    expect(markup).not.toContain(`aria-controls="scenario-${scenarioId}-dialog"`);
    expect(markup).not.toContain(`aria-controls="scenario-${scenarioId}-archive-dialog"`);
    expect(markup).toContain("Search scenarios");
    expect(markup).toContain("Filter by status");
    expect(markup).toContain("Filter by difficulty");
    expect(markup).toContain("Archived");
    expect(markup).toContain("Select all");
    expect(markup).toContain("0 selected");
    expect(markup).toContain("Publish");
    expect(markup).toContain("Unpublish");
  });
});
