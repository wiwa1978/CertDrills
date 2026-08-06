import { readFileSync } from "node:fs";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// next-intl's `createNavigation()` eagerly imports `next/navigation` at module scope, which this
// workspace's installed `next` version does not expose under an extensionless specifier. Real
// Next.js builds resolve this fine through webpack, but a plain Node/Vitest module graph cannot -
// so real (non-mocked) rendering of anything importing "@/i18n/navigation" needs this stub.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { questionEditorHref, questionImportHref } from "@/modules/certdrill/question-editor-href";
import {
  QUESTION_IMPORT_GENERIC_ERROR_MESSAGE,
  questionImportErrorMessage,
} from "@/modules/certdrill/question-import-error";
import { QuestionImportErrorAlert, QuestionImportForm, QuestionImportPreviewDetails } from "@/modules/certdrill/question-import-form";
import type {
  CertDrillQuestionImportConfirmActionResult,
  CertDrillQuestionImportPreviewResult,
  CertDrillQuestionImportPreviewActionResult,
} from "@/modules/certdrill/question-import-types";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const questionImportPageSource = readSource("../../../src/modules/certdrill/question-import-page.tsx");
const questionImportFormSource = readSource("../../../src/modules/certdrill/question-import-form.tsx");
const questionImportSelectionSource = readSource("../../../src/modules/certdrill/question-import-selection.ts");
const importRouteSource = readSource(
  "../../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/import/page.tsx",
);
const exampleJson = readSource("../../../public/question-import-example.json");

const certificationId = "22222222-2222-4222-8222-222222222222";

type QuestionImportExampleDocument = {
  version: number;
  questions: Array<{
    categoryCode: string;
    stem: string;
    difficulty: string;
    answers: Array<{
      text: string;
      isCorrect: boolean;
      explanation: string;
      citationUrls: string[];
    }>;
  }>;
};

function assertQuestionImportExampleShape(document: unknown): asserts document is QuestionImportExampleDocument {
  if (typeof document !== "object" || document === null || Array.isArray(document)) {
    throw new Error("Question import example must be a document object.");
  }

  const { version, questions } = document as Record<string, unknown>;

  if (typeof version !== "number") {
    throw new Error("Question import example version must be a number.");
  }

  if (!Array.isArray(questions)) {
    throw new Error("Question import example questions must be an array.");
  }

  questions.forEach((question, questionIndex) => {
    if (typeof question !== "object" || question === null || Array.isArray(question)) {
      throw new Error(`Question ${questionIndex + 1} must be an object.`);
    }

    const { categoryCode, stem, difficulty, answers } = question as Record<string, unknown>;

    if (typeof categoryCode !== "string") {
      throw new Error(`Question ${questionIndex + 1} categoryCode must be a string.`);
    }

    if (typeof stem !== "string") {
      throw new Error(`Question ${questionIndex + 1} stem must be a string.`);
    }

    if (typeof difficulty !== "string") {
      throw new Error(`Question ${questionIndex + 1} difficulty must be a string.`);
    }

    if (!Array.isArray(answers)) {
      throw new Error(`Question ${questionIndex + 1} answers must be an array.`);
    }

    answers.forEach((answer, answerIndex) => {
      if (typeof answer !== "object" || answer === null || Array.isArray(answer)) {
        throw new Error(`Question ${questionIndex + 1} answer ${answerIndex + 1} must be an object.`);
      }

      const { text, isCorrect, explanation, citationUrls } = answer as Record<string, unknown>;

      if (typeof text !== "string") {
        throw new Error(`Question ${questionIndex + 1} answer ${answerIndex + 1} text must be a string.`);
      }

      if (typeof isCorrect !== "boolean") {
        throw new Error(`Question ${questionIndex + 1} answer ${answerIndex + 1} isCorrect must be a boolean.`);
      }

      if (typeof explanation !== "string") {
        throw new Error(`Question ${questionIndex + 1} answer ${answerIndex + 1} explanation must be a string.`);
      }

      if (!Array.isArray(citationUrls)) {
        throw new Error(`Question ${questionIndex + 1} answer ${answerIndex + 1} citationUrls must be an array.`);
      }

      citationUrls.forEach((citationUrl, citationIndex) => {
        if (typeof citationUrl !== "string") {
          throw new Error(
            `Question ${questionIndex + 1} answer ${answerIndex + 1} citationUrl ${citationIndex + 1} must be a string.`,
          );
        }
      });
    });
  });
}

async function harmlessPreviewAction(): Promise<CertDrillQuestionImportPreviewActionResult> {
  return { status: "error", message: "not used" };
}

async function harmlessConfirmAction(): Promise<CertDrillQuestionImportConfirmActionResult> {
  return { status: "error", message: "not used" };
}

function renderForm() {
  return renderToStaticMarkup(
    createElement(QuestionImportForm, {
      certificationId,
      previewAction: harmlessPreviewAction,
      confirmAction: harmlessConfirmAction,
    }),
  );
}

const previewMarkupFixture: CertDrillQuestionImportPreviewResult = {
  documentVersion: 1,
  documentHash: "a".repeat(64),
  totals: {
    submitted: 2,
    valid: 2,
    invalid: 0,
    duplicateExisting: 1,
    duplicateBatch: 0,
    selectedByDefault: 1,
  },
  rows: [
    {
      sourceIndex: 0,
      categoryCode: "SEC-01",
      categoryId: "33333333-3333-4333-8333-333333333333",
      stem: "Primary question",
      difficulty: "medium",
      answerCount: 2,
      valid: true,
      duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
      selectedByDefault: true,
      errors: [],
    },
    {
      sourceIndex: 1,
      categoryCode: "SEC-02",
      categoryId: "44444444-4444-4444-8444-444444444444",
      stem: "Duplicate question",
      difficulty: "hard",
      answerCount: 4,
      valid: true,
      duplicate: { existingQuestionIds: ["55555555-5555-4555-8555-555555555555"], earlierSourceIndexes: [] },
      selectedByDefault: false,
      errors: [],
    },
  ],
};

// Slices out one handler body from the client component source, so guard ordering inside the
// handler can be asserted without a DOM test runner.
function formFunctionBody(name: string) {
  const start = questionImportFormSource.indexOf(`async function ${name}(`);
  const end = questionImportFormSource.indexOf("\n  }", start);
  return questionImportFormSource.slice(start, end);
}

function renderPreviewDetails(pending: boolean) {
  return renderToStaticMarkup(
    createElement(QuestionImportPreviewDetails, {
      certificationId,
      preview: previewMarkupFixture,
      selection: { selected: [0], duplicateOverrides: [] },
      pending,
      onToggleDuplicatesIncluded: () => {},
      onToggleRow: () => {},
    }),
  );
}

describe("question import href", () => {
  it("builds the dedicated import route href", () => {
    expect(questionImportHref(certificationId)).toBe(`/admin/certdrill/${certificationId}/questions/import`);
  });
});

describe("question import route", () => {
  it("renders the import page inside the existing Container for the localized route", () => {
    expect(importRouteSource).toContain('import { Container } from "@/components/ui/container";');
    expect(importRouteSource).toContain('import { QuestionImportPage } from "@/modules/certdrill/question-import-page";');
    expect(importRouteSource).toContain('<Container className="py-6">');
    expect(importRouteSource).toContain("<QuestionImportPage certificationId={certificationId} />");
    expect(importRouteSource).toContain("params: Promise<{ certificationId: string }>");
  });
});

describe("question import page", () => {
  it("loads certifications from the existing server API and resolves the selected certification", () => {
    expect(questionImportPageSource).toContain("getCertDrillCertificationsServer");
    expect(questionImportPageSource).toContain("listCertDrillAdminCertificationsServer");
    expect(questionImportPageSource).toContain(
      "adminCertifications.find((certification) => certification.id === certificationId)",
    );
    expect(questionImportPageSource).toContain(
      "certifications.find((certification) => certification.id === certificationId)",
    );
  });

  it("shows an inline not-found alert with a back link when the certification is missing", () => {
    expect(questionImportPageSource).toContain("if (!selectedAdminCertification)");
    expect(questionImportPageSource).toContain('role="alert"');
    expect(questionImportPageSource).toContain("Certification not found.");
    expect(questionImportPageSource).toContain("Back to certifications");
  });

  it("shows the import heading, certification context, Draft/AI explanation, back link, and downloadable example", () => {
    expect(questionImportPageSource).toContain("Import questions");
    expect(questionImportPageSource).toContain("certificationContext.code");
    expect(questionImportPageSource).toContain("certificationContext.name");
    expect(questionImportPageSource).toContain("Draft question with source AI");
    expect(questionImportPageSource).toContain("Back to questions");
    expect(questionImportPageSource).toContain("?tab=questions");
    expect(questionImportPageSource).toContain('href="/question-import-example.json"');
    expect(questionImportPageSource).toContain("download");
    expect(questionImportPageSource).toContain('import { QuestionImportForm } from "./question-import-form";');
    expect(questionImportPageSource).toContain("previewCertDrillQuestionImportAction");
    expect(questionImportPageSource).toContain("confirmCertDrillQuestionImportAction");
    expect(questionImportPageSource).toContain("<QuestionImportForm");
    expect(questionImportPageSource).toContain("certificationId={certificationId}");
    expect(questionImportPageSource).toContain("previewAction={previewCertDrillQuestionImportAction}");
    expect(questionImportPageSource).toContain("confirmAction={confirmCertDrillQuestionImportAction}");
  });
});

describe("question import example document", () => {
  const example = JSON.parse(exampleJson) as QuestionImportExampleDocument;

  it("rejects answers whose citationUrls are not arrays before URL validation", () => {
    const mutated = JSON.parse(JSON.stringify(example)) as QuestionImportExampleDocument;
    mutated.questions[0].answers[0].citationUrls = "https://example.com/not-an-array" as unknown as string[];

    expect(() => assertQuestionImportExampleShape(mutated)).toThrow("citationUrls must be an array.");
  });

  it("matches the canonical version 1 shape with realistic AI-agent examples", () => {
    assertQuestionImportExampleShape(example);
    expect(example.version).toBe(1);
    expect(example.questions).toHaveLength(3);
    expect(new Set(example.questions.map((question) => question.difficulty))).toEqual(
      new Set(["easy", "medium", "hard"]),
    );
    expect(example.questions.some((question) => question.stem.includes("**"))).toBe(true);

    for (const question of example.questions) {
      expect(question.categoryCode.trim().length).toBeGreaterThan(0);
      expect(question.stem.trim().length).toBeGreaterThan(0);
      expect(question.answers.length).toBeGreaterThanOrEqual(2);
      expect(question.answers.filter((answer) => answer.isCorrect)).toHaveLength(1);
      for (const answer of question.answers) {
        expect(answer.text.trim().length).toBeGreaterThan(0);
        expect(answer.explanation.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("only includes safe http(s) citation URLs", () => {
    assertQuestionImportExampleShape(example);
    const citationUrls = example.questions.flatMap((question) =>
      question.answers.flatMap((answer) => answer.citationUrls),
    );
    expect(citationUrls.length).toBeGreaterThan(0);
    for (const url of citationUrls) {
      expect(new URL(url).protocol).toMatch(/^https?:$/);
    }
  });
});

describe("question import form", () => {
  it("is a client component with controlled, keyboard-accessible upload/paste tabs", () => {
    expect(questionImportFormSource).toContain('"use client"');
    expect(questionImportFormSource).toContain("Upload JSON");
    expect(questionImportFormSource).toContain("Paste JSON");
    expect(questionImportFormSource).toContain("value={activeTab}");
    expect(questionImportFormSource).toContain("onValueChange={(value) => setActiveTab(value as QuestionImportTab)}");
  });

  it("labels the file input, restricts its accepted types, and enforces the 5 MiB limit before reading", () => {
    expect(questionImportFormSource).toContain('<Label htmlFor="question-import-file">Upload JSON file</Label>');
    expect(questionImportFormSource).toContain('id="question-import-file"');
    expect(questionImportFormSource).toContain('type="file"');
    expect(questionImportFormSource).toContain('accept=".json,application/json"');
    expect(questionImportFormSource).toContain("MAX_QUESTION_IMPORT_BYTES");
    expect(questionImportFormSource).toContain("file.size > MAX_QUESTION_IMPORT_BYTES");

    const fileCaptureIndex = questionImportFormSource.indexOf("input.files?.[0]");
    const readIndex = questionImportFormSource.indexOf("await file.text()");
    expect(fileCaptureIndex).toBeGreaterThan(-1);
    expect(readIndex).toBeGreaterThan(fileCaptureIndex);
  });

  it("shares one editable, labelled textarea that clears stale preview and message state", () => {
    expect(questionImportFormSource).toContain('<Label htmlFor="question-import-json">Question import JSON</Label>');
    expect(questionImportFormSource).toContain('id="question-import-json"');
    expect(questionImportFormSource).toContain("function handleTextareaChange(");
    expect(questionImportFormSource).toContain("setPreview(null)");
    expect(questionImportFormSource).toContain("setMessage(null)");
  });

  it("checks the current raw JSON UTF-8 size before invoking either server action", () => {
    expect(questionImportFormSource).toContain('from "./question-import-size"');
    expect(questionImportFormSource).toContain("exceedsQuestionImportByteLimit");
    expect(questionImportFormSource).toContain("setMessage(QUESTION_IMPORT_TOO_LARGE_MESSAGE)");

    const validateBody = formFunctionBody("handleValidate");
    const validateGuardIndex = validateBody.indexOf("exceedsQuestionImportByteLimit(rawJson)");
    expect(validateGuardIndex).toBeGreaterThan(-1);
    expect(validateBody.indexOf("await previewAction(")).toBeGreaterThan(validateGuardIndex);
    // The pasted JSON is preserved: only the stale preview state is dropped.
    expect(validateBody).not.toContain("setRawJson(");

    const confirmBody = formFunctionBody("handleConfirm");
    const confirmGuardIndex = confirmBody.indexOf("exceedsQuestionImportByteLimit(rawJson)");
    expect(confirmGuardIndex).toBeGreaterThan(-1);
    expect(confirmBody.indexOf("await confirmAction({")).toBeGreaterThan(confirmGuardIndex);
    // Nothing was sent, so the confirmed preview and selection stay on screen for a retry.
    expect(confirmBody.slice(confirmGuardIndex, confirmBody.indexOf("await confirmAction({"))).not.toContain("setPreview(null)");
  });

  it("wires the validate-and-preview action with a pending, disabled submit state", () => {
    expect(questionImportFormSource).toContain("Validate and preview");
    expect(questionImportFormSource).toContain("disabled={pending}");
    expect(questionImportFormSource).toContain("if (pending) return;");
    expect(questionImportFormSource).toContain('setOperation("preview")');
    expect(questionImportFormSource).toContain("setOperation(null)");
    expect(questionImportFormSource).toContain("await previewAction({ certificationId, rawJson })");
  });

  it("shows preview totals, including the selected count, after a successful validation without saving anything", () => {
    expect(questionImportFormSource).toContain("preview.totals.submitted");
    expect(questionImportFormSource).toContain("preview.totals.valid");
    expect(questionImportFormSource).toContain("preview.totals.invalid");
    expect(questionImportFormSource).toContain("preview.totals.duplicateExisting");
    expect(questionImportFormSource).toContain("preview.totals.duplicateBatch");
    expect(questionImportFormSource).toContain("selection.selected.length");
    expect(questionImportFormSource).toContain("Nothing has been imported yet.");
  });

  it("initializes default selection from the preview rows and moves focus to the preview heading on success", () => {
    expect(questionImportFormSource).toContain("initialQuestionImportSelection(result.preview.rows)");
    expect(questionImportFormSource).toContain('setPendingFocus("preview")');
    expect(questionImportFormSource).toContain("previewHeadingRef.current?.focus()");
    expect(questionImportFormSource).toContain('<h2 ref={previewHeadingRef} tabIndex={-1}');
  });

  it("clears the preview, selection, and message together whenever the raw JSON changes", () => {
    expect(questionImportFormSource).toContain("function clearPreviewState()");
    expect(questionImportFormSource).toContain("setSelection(initialQuestionImportSelection([]))");

    const clearBodyStart = questionImportFormSource.indexOf("function clearPreviewState()");
    const clearBodyEnd = questionImportFormSource.indexOf("}", clearBodyStart);
    const clearBody = questionImportFormSource.slice(clearBodyStart, clearBodyEnd);
    expect(clearBody).toContain("setPreview(null)");
    expect(clearBody).toContain("setSelection(initialQuestionImportSelection([]))");
    expect(clearBody).toContain("setMessage(null)");

    expect(questionImportFormSource).toContain("clearPreviewState();\n\n    if (file.size > MAX_QUESTION_IMPORT_BYTES)");
    expect(questionImportFormSource).toContain("setRawJson(event.target.value);\n    clearPreviewState();");
  });

  it("renders every preview row with a checkbox, row number, category, stem, difficulty, answer count, validation, duplicate status, and errors", () => {
    expect(questionImportFormSource).toContain("preview.rows.map((row) =>");
    expect(questionImportFormSource).toContain("const rowNumber = row.sourceIndex + 1;");
    expect(questionImportFormSource).toContain('aria-label={`Import row ${rowNumber}`}');
    expect(questionImportFormSource).toContain("<TableCell>{rowNumber}</TableCell>");
    expect(questionImportFormSource).toContain("{row.categoryCode}</TableCell>");
    expect(questionImportFormSource).toContain("{row.stem}</TableCell>");
    expect(questionImportFormSource).toContain("<Badge variant=\"secondary\">{row.difficulty}</Badge>");
    expect(questionImportFormSource).toContain("<TableCell>{row.answerCount}</TableCell>");
    expect(questionImportFormSource).toContain("{row.valid ? \"Valid\" : \"Invalid\"}");
    expect(questionImportFormSource).toContain("row.errors.map((error, index) =>");
    expect(questionImportFormSource).toContain("${error.field}: ${error.message}");
  });

  it("disables the checkbox for invalid rows", () => {
    expect(questionImportFormSource).toContain("checked={selection.selected.includes(row.sourceIndex)}");
    expect(questionImportFormSource).toContain("disabled={pending || !row.valid}");
  });

  it("distinguishes existing certification duplicates from earlier source rows and links compact existing IDs", () => {
    expect(questionImportFormSource).toContain("isQuestionImportRowDuplicate(row)");
    expect(questionImportFormSource).toContain("Matches existing question(s): ");
    expect(questionImportFormSource).toContain("row.duplicate.existingQuestionIds.map((questionId, index) =>");
    expect(questionImportFormSource).toContain("questionEditorHref(certificationId, questionId)");
    expect(questionImportFormSource).toContain("compactQuestionId(questionId)");
    expect(questionImportFormSource).toContain("Duplicates earlier row(s) ");
    expect(questionImportFormSource).toContain("row.duplicate.earlierSourceIndexes.map((earlierIndex) => earlierIndex + 1)");
    expect(questionImportFormSource).toContain('import { Link as LocalizedLink, useRouter } from "@/i18n/navigation";');
  });

  it("wires a per-row duplicate checkbox as an explicit override via setQuestionImportRowSelected", () => {
    expect(questionImportFormSource).toContain("function handleToggleRow(sourceIndex: number, selected: boolean)");
    expect(questionImportFormSource).toContain("setQuestionImportRowSelected(current, preview.rows, sourceIndex, selected)");
    expect(questionImportFormSource).toContain("onCheckedChange={(checked) => onToggleRow(row.sourceIndex, checked === true)}");
  });

  it("wires a batch Include duplicates checkbox that explains it permits intentional duplicates", () => {
    expect(questionImportFormSource).toContain('aria-label="Include duplicates"');
    expect(questionImportFormSource).toContain("areAllQuestionImportDuplicatesIncluded(selection, preview.rows)");
    expect(questionImportFormSource).toContain("function handleToggleDuplicatesIncluded(included: boolean)");
    expect(questionImportFormSource).toContain("setQuestionImportDuplicatesIncluded(current, preview.rows, included)");
    expect(questionImportFormSource).toContain("onCheckedChange={(checked) => onToggleDuplicatesIncluded(checked === true)}");
    expect(questionImportFormSource).toContain("so you can intentionally import duplicate questions");
    expect(questionImportFormSource).toContain("disabled={pending || !hasDuplicateRows}");
  });

  it("disables the Import selected questions button when nothing is selected or an operation is pending, and shows a busy label", () => {
    expect(questionImportFormSource).toContain("Import selected questions");
    expect(questionImportFormSource).toContain("disabled={pending || selection.selected.length === 0}");
    expect(questionImportFormSource).toContain('operation === "confirm" ? "Importing..." : "Import selected questions"');
    expect(questionImportFormSource).toContain('aria-busy={pending}');
  });

  it("confirms with the same raw document, preview hash, selected indexes, and override indexes", () => {
    expect(questionImportFormSource).toContain("if (pending || !preview || selection.selected.length === 0) return;");
    expect(questionImportFormSource).toContain("await confirmAction({");
    expect(questionImportFormSource).toContain("certificationId,");
    expect(questionImportFormSource).toContain("rawJson,");
    expect(questionImportFormSource).toContain("previewDocumentHash: preview.documentHash,");
    expect(questionImportFormSource).toContain("selectedSourceIndexes: selection.selected,");
    expect(questionImportFormSource).toContain("duplicateOverrideSourceIndexes: selection.duplicateOverrides,");
  });

  it("pushes the localized imported-questions URL and refreshes on confirm success", () => {
    expect(questionImportFormSource).toContain('function importedQuestionsHref(certificationId: string, importedCount: number) {');
    expect(questionImportFormSource).toContain('return `/admin/certdrill/${certificationId}?tab=questions&imported=${importedCount}`;');
    expect(questionImportFormSource).toContain('router.push(importedQuestionsHref(certificationId, result.importedCount));');
    expect(questionImportFormSource).toContain("router.refresh();");
  });

  it("replaces the preview and reconciles the selection on a typed conflict, moving focus to the alert without touching the raw input", () => {
    const confirmBodyStart = questionImportFormSource.indexOf("async function handleConfirm()");
    const confirmBodyEnd = questionImportFormSource.indexOf("\n  function handleToggleRow(");
    const confirmBody = questionImportFormSource.slice(confirmBodyStart, confirmBodyEnd);

    expect(confirmBody).toContain('if (result.status === "conflict") {');
    expect(confirmBody).toContain("setPreview(result.preview);");
    expect(confirmBody).toContain("reconcileQuestionImportSelection(selection, result.preview.rows)");
    expect(confirmBody).toContain("setMessage(result.message);");
    expect(confirmBody).toContain('setPendingFocus("conflict");');
    expect(confirmBody).not.toContain("setRawJson");
    expect(questionImportFormSource).toContain("conflictAlertRef.current?.focus();");
    expect(questionImportFormSource).toContain("alertRef={conflictAlertRef}");
    expect(questionImportFormSource).toContain('ref={alertRef}\n      role="alert"\n      tabIndex={-1}');
  });

  it("shows a generic error message without redirecting, clearing input, or claiming success", () => {
    const confirmBodyStart = questionImportFormSource.indexOf("async function handleConfirm()");
    const confirmBodyEnd = questionImportFormSource.indexOf("\n  function handleToggleRow(");
    const confirmBody = questionImportFormSource.slice(confirmBodyStart, confirmBodyEnd);
    const conflictBranchStart = confirmBody.indexOf('if (result.status === "conflict")');
    const conflictBranchEnd = confirmBody.indexOf("}\n\n      setMessage(result.message);");
    const afterConflictBranch = confirmBody.slice(conflictBranchEnd);

    expect(afterConflictBranch).toContain("setMessage(result.message);");
    expect(afterConflictBranch).not.toContain("router.push");
    expect(afterConflictBranch).not.toContain("setRawJson");
    expect(conflictBranchStart).toBeGreaterThan(-1);
  });

  it("uses one pure selection module for default selection, row/batch toggles, and conflict reconciliation", () => {
    expect(questionImportFormSource).toContain('from "./question-import-selection"');
    expect(questionImportSelectionSource).toContain("export type QuestionImportSelectionState");
    expect(questionImportSelectionSource).toContain("export function initialQuestionImportSelection(");
    expect(questionImportSelectionSource).toContain("export function setQuestionImportRowSelected(");
    expect(questionImportSelectionSource).toContain("export function setQuestionImportDuplicatesIncluded(");
    expect(questionImportSelectionSource).toContain("export function reconcileQuestionImportSelection(");
  });

  it("renders an accessible initial upload state via SSR markup", () => {
    const markup = renderForm();
    expect(markup).toContain("Upload JSON");
    expect(markup).toContain("Paste JSON");
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept=".json,application/json"');
    expect(markup).toContain("Validate and preview");
    expect(markup).not.toContain('disabled=""');
    // No preview yet, so the confirm button, table, and batch checkbox must not render.
    expect(markup).not.toContain("Import selected questions");
    expect(markup).not.toContain("Include duplicates");
  });

  it("limits the live status region to the preview totals summary instead of wrapping controls and the table", () => {
    const markup = renderPreviewDetails(false);
    const statusRegion = markup.match(/<div role="status"[^>]*>[\s\S]*?<\/div>/)?.[0];

    expect(statusRegion).toBeDefined();
    expect(statusRegion).toContain("Submitted: 2");
    expect(statusRegion).toContain("Selected: 1");
    expect(statusRegion).not.toContain("Include duplicates");
    expect(statusRegion).not.toContain('data-slot="table"');
    expect(markup).toContain("Include duplicates");
    expect(markup).toContain('data-slot="table"');
  });

  it("renders the batch and row checkboxes disabled in preview markup while an operation is pending", () => {
    const markup = renderPreviewDetails(true);
    const disabledCheckboxCount = markup.match(/role="checkbox"[^>]*disabled=""/g)?.length ?? 0;

    expect(disabledCheckboxCount).toBe(3);
    expect(markup).toContain('aria-label="Include duplicates"');
    expect(markup).toContain('aria-label="Import row 1"');
    expect(markup).toContain('aria-label="Import row 2"');
  });
});

describe("question import transport failures", () => {
  function validateBody() {
    const start = questionImportFormSource.indexOf("async function handleValidate()");
    const end = questionImportFormSource.indexOf("async function handleConfirm()");
    return questionImportFormSource.slice(start, end);
  }

  function confirmBody() {
    const start = questionImportFormSource.indexOf("async function handleConfirm()");
    const end = questionImportFormSource.indexOf("\n  function handleToggleRow(");
    return questionImportFormSource.slice(start, end);
  }

  it("catches a rejected preview action, explains it, and always clears the pending state", () => {
    const body = validateBody();

    expect(body).toContain("} catch (error) {");
    expect(body).toContain("setMessage(questionImportErrorMessage(error));");
    expect(body).toContain("setPreview(null);");
    expect(body).toContain("} finally {");
    expect(body).toContain("setOperation(null);");
    // The typed raw JSON is never cleared, so the admin can fix and retry.
    expect(body).not.toContain("setRawJson");
  });

  it("catches a rejected confirm action without claiming success or dropping the preview", () => {
    const body = confirmBody();
    const catchIndex = body.indexOf("} catch (error) {");
    const catchBlock = body.slice(catchIndex);

    expect(catchIndex).toBeGreaterThan(-1);
    expect(catchBlock).toContain("setMessage(questionImportErrorMessage(error));");
    expect(catchBlock).not.toContain("router.push");
    expect(catchBlock).not.toContain("setRawJson");
    expect(catchBlock).not.toContain("setPreview(null)");
    expect(body).toContain("} finally {");
    expect(body).toContain("setOperation(null);");
  });

  it("maps thrown values to a user-facing message through the shared pure helper", () => {
    expect(questionImportErrorMessage(new Error("Failed to fetch"))).toBe("Failed to fetch");
    expect(questionImportErrorMessage(new Error("API request failed (400): Document is invalid.")))
      .toBe("Document is invalid.");
    expect(questionImportErrorMessage(new Error("   "))).toBe(QUESTION_IMPORT_GENERIC_ERROR_MESSAGE);
    expect(questionImportErrorMessage("boom")).toBe(QUESTION_IMPORT_GENERIC_ERROR_MESSAGE);
    expect(questionImportErrorMessage(undefined)).toBe(QUESTION_IMPORT_GENERIC_ERROR_MESSAGE);
    expect(questionImportErrorMessage(new Error(
      "An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.",
    ))).toBe(QUESTION_IMPORT_GENERIC_ERROR_MESSAGE);
    expect(questionImportErrorMessage(new Error("x".repeat(500)))).toBe(QUESTION_IMPORT_GENERIC_ERROR_MESSAGE);
  });
});

describe("question import error alert", () => {
  it("renders the document message on its own when there are no field errors", () => {
    const markup = renderToStaticMarkup(
      createElement(QuestionImportErrorAlert, {
        message: "Question import document is invalid.",
        documentErrors: [],
      }),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Question import document is invalid.");
    expect(markup).not.toContain("<ul");
  });

  it("renders every field-specific document error under the message", () => {
    const markup = renderToStaticMarkup(
      createElement(QuestionImportErrorAlert, {
        message: "Question import document is invalid.",
        documentErrors: [
          { field: "version", message: "Document version must be 1." },
          { field: "questions", message: "Must include at most 500 questions." },
          { field: "extra", message: "Unknown field." },
        ],
      }),
    );

    expect(markup).toContain("Question import document is invalid.");
    expect(markup).toContain("version: Document version must be 1.");
    expect(markup).toContain("questions: Must include at most 500 questions.");
    expect(markup).toContain("extra: Unknown field.");
    expect(markup.match(/<li[^>]*>/g)?.length).toBe(3);
  });

  it("renders the alert markup the form reuses for transport and document failures", () => {
    expect(questionImportFormSource).toContain("<QuestionImportErrorAlert message={message} documentErrors={documentErrors} alertRef={conflictAlertRef} />");
    expect(questionImportFormSource).toContain("setDocumentErrors(result.documentErrors ?? [])");
  });
});

describe("question editor href reused for import duplicate links", () => {
  it("builds a per-question editor href", () => {
    expect(questionEditorHref(certificationId, "33333333-3333-4333-8333-333333333333")).toBe(
      `/admin/certdrill/${certificationId}/questions/33333333-3333-4333-8333-333333333333`,
    );
  });
});
