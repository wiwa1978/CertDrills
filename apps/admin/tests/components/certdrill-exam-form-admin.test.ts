import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dialog = read("../../src/modules/certdrill/exam-form-create-dialog.tsx");
const list = read("../../src/modules/certdrill/exam-form-list.tsx");
const editor = read("../../src/modules/certdrill/exam-form-editor.tsx");
const distribution = read("../../src/modules/certdrill/exam-form-distribution.ts");
const route = read("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/exam-forms/[examFormId]/page.tsx");

describe("CertDrill exam form admin", () => {
  it("lists form metadata, drill counts, and category distribution", () => {
    expect(dialog).toContain("Create Form");
    expect(dialog).toContain('name="targetQuestionCount"');
    expect(dialog).not.toContain('name="isActive"');
    expect(list).toContain("assigned ·");
    expect(list).toContain("target ·");
    expect(list).toContain("scenarios ·");
    expect(list).toContain("Normal questions");
    expect(list).toContain("Drag and drop");
    expect(list).toContain("Fill in the gap");
    expect(list).toContain("Distribution per category");
    expect(list).toContain("examFormEditorHref");
    expect(list).toContain("Deactivate");
  });

  it("shows application validation instead of native browser popups", () => {
    expect(dialog).toContain("noValidate");
    expect(dialog).toContain("Exam form could not be created.");
    expect(dialog).toContain("Please correct the following:");
    expect(dialog).toContain('role="alert"');
    expect(dialog).toContain("aria-invalid={Boolean(error) || undefined}");
    expect(dialog).toContain("aria-describedby={error ? `${id}-error` : undefined}");
  });

  it("provides the versioned dedicated editor workflow", () => {
    expect(route).toContain("CertDrillExamFormEditorPage");
    expect(editor).toContain("Back to Exam Forms");
    expect(editor).toContain("Regenerate Questions");
    expect(editor).toContain("Changing the question count replaces all assigned questions");
    expect(editor).toContain("allocationSnapshot.map");
    expect(editor).toContain("assignedQuestionsByTopLevelCategory");
    expect(editor).toContain("Replace");
    expect(editor).toContain("expectedAssignmentVersion");
    expect(editor).toContain("window.confirm");
    expect(editor).toContain("No eligible replacement is available.");
    expect(editor).toContain("activeRootCategoryId");
    expect(distribution).toContain("current.archivedAt");
    expect(editor).toContain("Scenarios in this Final Mock Exam");
    expect(editor).toContain("Save scenario assignments");
    expect(editor).toContain("scenarioIds");
  });
});
