import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownTextarea } from "@/modules/certdrill/markdown";

function readSource(relativePath: string) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

const markdownSource = readSource("../../../src/modules/certdrill/markdown.tsx");
const questionFormSource = readSource("../../../src/modules/certdrill/question-form.tsx");

describe("Question form editor", () => {
  it("exports a preview-free markdown textarea with markdown guidance", () => {
    expect(markdownSource).toContain("export function MarkdownTextarea(");
    expect(markdownSource).toContain("Markdown supported");
    expect(markdownSource).toContain("aria-invalid={errorMessages.length > 0 || undefined}");
    expect(markdownSource).toContain("errorMessages.map((message, index) => (");
    expect(typeof questionFormSource).toBe("string");
  });

  it("renders markdown textarea accessibility affordances at the markup level", () => {
    const id = "question-stem";
    const markup = renderToStaticMarkup(
      createElement(MarkdownTextarea, {
        id,
        name: "stem",
        label: "Stem",
        helperText: "Provide the full prompt.",
        errorMessages: ["Stem is required."],
        required: true,
      }),
    );

    expect(markup).toContain(">Stem");
    expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('name="stem"');
    expect(markup).toContain("required");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain(`aria-describedby="${id}-error ${id}-helper"`);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Stem is required.");
    expect(markup).toContain("Provide the full prompt.");
    expect(markup).toContain("Markdown supported");
  });

  it("omits aria-invalid when there are no markdown textarea errors", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownTextarea, {
        id: "question-notes",
        name: "notes",
        label: "Notes",
      }),
    );

    expect(markup).not.toContain("aria-invalid=");
  });

  it("renders overview and four answer tabs", () => {
    expect(questionFormSource).toContain('"use client"');
    expect(questionFormSource).toContain('useState<QuestionAnswerTab>("overview")');
    expect(questionFormSource).toContain("Overview");
    expect(questionFormSource).toContain("Answer {index + 1}");
    expect(questionFormSource).toContain("TabsContent");
    expect(questionFormSource.match(/\bforceMount\b/g)).toHaveLength(2);
    expect(questionFormSource.match(/data-\[state=inactive\]:hidden/g)).toHaveLength(2);
  });

  it("keeps question details controlled across failed form actions", () => {
    expect(questionFormSource).toContain("const [categoryId, setCategoryId] = useState");
    expect(questionFormSource).toContain("const [stem, setStem] = useState");
    expect(questionFormSource).toContain("const [difficulty, setDifficulty] = useState");
    expect(questionFormSource).toContain("const [status, setStatus] = useState");
    expect(questionFormSource).toContain("value={categoryId}");
    expect(questionFormSource).toContain("value={stem}");
    expect(questionFormSource).toContain("value={difficulty}");
    expect(questionFormSource).toContain("value={status}");
    expect(questionFormSource).toContain("setCategoryId(event.currentTarget.value)");
    expect(questionFormSource).toContain("setStem(event.currentTarget.value)");
    expect(questionFormSource).toContain("setDifficulty(event.currentTarget.value)");
    expect(questionFormSource).toContain("setStatus(event.currentTarget.value)");
    expect(questionFormSource).not.toContain("defaultValue={selectedQuestion?.categoryId");
    expect(questionFormSource).not.toContain("defaultValue={selectedQuestion?.stem");
    expect(questionFormSource).not.toContain("defaultValue={selectedQuestion?.difficulty");
    expect(questionFormSource).not.toContain("defaultValue={selectedQuestion?.status");
  });

  it("uses Markdown for Stem, answer text, and explanation without previews", () => {
    expect(questionFormSource).toContain('label="Stem"');
    expect(questionFormSource).toContain('label={`Answer ${index + 1} text`}');
    expect(questionFormSource).toContain('label={`Answer ${index + 1} explanation`}');
    expect(questionFormSource).toContain("<MarkdownTextarea");
    expect(questionFormSource).not.toContain("MarkdownTextareaWithPreview");
    expect(questionFormSource).not.toContain("Stem preview");
    expect(questionFormSource).not.toContain("Explanation preview");
  });

  it("preserves source resources without showing source controls", () => {
    expect(questionFormSource).toContain('type="hidden"');
    expect(questionFormSource).toContain('name="sourceResourceId"');
    expect(questionFormSource).not.toContain("Source resource ID");
    expect(questionFormSource).not.toContain("Clear source resource");
  });

  it("keeps one optional correct answer and disables empty choices", () => {
    expect(questionFormSource).toContain('name="correctOption"');
    expect(questionFormSource).toContain("checked={correctOption === String(index)}");
    expect(questionFormSource).toContain("disabled={!answer.text.trim()}");
    expect(questionFormSource).toContain("option.isCorrect && option.text.trim()");
    expect(questionFormSource).not.toContain("selectedCorrectOption ?? 0");
  });

  it("marks invalid answer tabs and activates the first invalid field", () => {
    expect(questionFormSource).toContain("questionTabForField");
    expect(questionFormSource).toContain("firstQuestionFieldError");
    expect(questionFormSource).toContain('aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}');
    expect(questionFormSource).toContain("document.getElementById");
    expect(questionFormSource).toContain(".focus()");
  });

  it("makes aggregate errors focusable and falls back from a disabled correct option", () => {
    expect(questionFormSource).toContain('<Card id={`${idPrefix}-answers`} tabIndex={-1}>');
    expect(questionFormSource).toContain('input[name="correctOption"]:not(:disabled)');
    expect(questionFormSource).toContain("target.disabled");
  });
});
