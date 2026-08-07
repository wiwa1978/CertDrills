import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const dialog = read("../../src/modules/certdrill/exam-form-create-dialog.tsx");
const list = read("../../src/modules/certdrill/exam-form-list.tsx");
const editor = read("../../src/modules/certdrill/exam-form-editor.tsx");
const route = read("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/exam-forms/[examFormId]/page.tsx");

describe("CertDrill exam form admin", () => {
  it("creates forms from focused metadata and lists canonical fields", () => {
    expect(dialog).toContain("Create Form");
    expect(dialog).toContain('name="targetQuestionCount"');
    expect(dialog).not.toContain('name="isActive"');
    expect(list).toContain("Target questions");
    expect(list).toContain("Duration");
    expect(list).toContain("Status");
    expect(list).toContain("examFormEditorHref");
    expect(list).toContain("Deactivate");
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
    expect(editor).toContain("current.archivedAt");
  });
});
