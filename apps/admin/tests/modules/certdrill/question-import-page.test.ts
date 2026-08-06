import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { questionImportHref } from "@/modules/certdrill/question-editor-href";
import { QuestionImportForm } from "@/modules/certdrill/question-import-form";
import type { CertDrillQuestionImportPreviewActionResult } from "@/modules/certdrill/question-import-types";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const questionImportPageSource = readSource("../../../src/modules/certdrill/question-import-page.tsx");
const questionImportFormSource = readSource("../../../src/modules/certdrill/question-import-form.tsx");
const importRouteSource = readSource(
  "../../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/import/page.tsx",
);
const exampleJson = readSource("../../../public/question-import-example.json");

const certificationId = "22222222-2222-4222-8222-222222222222";

async function harmlessAction(): Promise<CertDrillQuestionImportPreviewActionResult> {
  return { status: "error", message: "not used" };
}

function renderForm() {
  return renderToStaticMarkup(
    createElement(QuestionImportForm, { certificationId, action: harmlessAction }),
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
    expect(questionImportPageSource).toContain("<QuestionImportForm certificationId={certificationId} action={previewCertDrillQuestionImportAction} />");
  });
});

describe("question import example document", () => {
  const example = JSON.parse(exampleJson) as {
    version: number;
    questions: Array<{
      categoryCode: string;
      difficulty: string;
      answers: Array<{ isCorrect: boolean; explanation: string; citationUrls: string[] }>;
    }>;
  };

  it("matches the canonical version 1 shape with one SEC-01, medium-difficulty question", () => {
    expect(example.version).toBe(1);
    expect(example.questions).toHaveLength(1);

    const [question] = example.questions;
    expect(question.categoryCode).toBe("SEC-01");
    expect(question.difficulty).toBe("medium");
    expect(question.answers).toHaveLength(2);
    expect(question.answers.filter((answer) => answer.isCorrect)).toHaveLength(1);
    for (const answer of question.answers) {
      expect(answer.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it("only includes safe http(s) citation URLs", () => {
    const [question] = example.questions;
    const citationUrls = question.answers.flatMap((answer) => answer.citationUrls);
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

  it("wires the validate-and-preview action with a pending, disabled submit state", () => {
    expect(questionImportFormSource).toContain("Validate and preview");
    expect(questionImportFormSource).toContain("disabled={pending}");
    expect(questionImportFormSource).toContain("if (pending) return;");
    expect(questionImportFormSource).toContain("setPending(true)");
    expect(questionImportFormSource).toContain("setPending(false)");
    expect(questionImportFormSource).toContain("await action({ certificationId, rawJson })");
  });

  it("shows preview totals after a successful validation without saving anything", () => {
    expect(questionImportFormSource).toContain("preview.totals.submitted");
    expect(questionImportFormSource).toContain("preview.totals.valid");
    expect(questionImportFormSource).toContain("preview.totals.invalid");
    expect(questionImportFormSource).toContain("preview.totals.duplicateExisting");
    expect(questionImportFormSource).toContain("preview.totals.duplicateBatch");
    expect(questionImportFormSource).toContain("Nothing has been imported yet.");
  });

  it("renders an accessible initial upload state via SSR markup", () => {
    const markup = renderForm();
    expect(markup).toContain("Upload JSON");
    expect(markup).toContain("Paste JSON");
    expect(markup).toContain('type="file"');
    expect(markup).toContain('accept=".json,application/json"');
    expect(markup).toContain("Validate and preview");
    expect(markup).not.toContain('disabled=""');
  });
});
