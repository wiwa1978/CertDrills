import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownTextarea } from "@/modules/certdrill/markdown";
import { QuestionForm } from "@/modules/certdrill/question-form";
import { initialQuestionFormActionState } from "@/modules/certdrill/question-form-state";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const markdownSource = readSource("../../../src/modules/certdrill/markdown.tsx");
const questionFormSource = readSource("../../../src/modules/certdrill/question-form.tsx");
const categories = [{
  id: "11111111-1111-4111-8111-111111111111",
  certificationId: "22222222-2222-4222-8222-222222222222",
  code: "SEC",
  name: "Security",
}];

async function harmlessAction() {
  return initialQuestionFormActionState;
}

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
    const markup = renderToStaticMarkup(
      createElement(QuestionForm, {
        action: harmlessAction,
        submitLabel: "Create question",
        categories,
        selectedCertificationId: categories[0].certificationId,
        idPrefix: "question-create",
      }),
    );

    expect(markup).toContain("<form");
    expect(markup).toContain('name="certificationId"');
    expect(markup).toContain('name="categoryId"');
    expect(markup).toContain('name="stem"');
    expect(markup).toContain('name="difficulty"');
    expect(markup).toContain('name="status"');
    expect(markup).toContain("SEC - Security");
    expect(markup.match(/name="option[0-3]Text"/g)).toHaveLength(4);
    expect(markup.match(/name="option[0-3]Explanation"/g)).toHaveLength(4);
    expect(markup.match(/name="option[0-3]CitationUrls"/g)).toHaveLength(4);
    expect(markup.match(/name="correctOption"/g)).toHaveLength(4);
    expect(markup.match(/aria-label="Answer [1-4] is the correct answer"/g)).toHaveLength(4);
    expect(
      markup.match(/<input(?=[^>]*name="correctOption")(?=[^>]*disabled="")[^>]*>/g),
    ).toHaveLength(4);
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(5);
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(5);
    expect(markup).toContain("Overview");
    expect(markup).toContain("Answer 1");
    expect(markup).toContain("Answer 4");
    expect(markup).not.toContain("Source resource ID");
    expect(markup).not.toContain("Clear source resource");
    expect(markup).not.toContain("Stem preview");
    expect(markup).not.toContain("Explanation preview");
  });

  it("keeps inactive answer panels mounted but hidden", () => {
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

  it("remounts state for question identity changes and resets successful creates", () => {
    expect(questionFormSource).toContain('key={selectedQuestion?.id ?? "new"}');
    expect(questionFormSource).toContain("const resetNewQuestion = useCallback");
    expect(questionFormSource).toContain('if (selectedQuestion || state.status !== "success") return;');
    expect(questionFormSource).toContain("resetNewQuestion();");
    expect(questionFormSource).toContain('setActiveTab("overview")');
    expect(questionFormSource).toContain('setCategoryId("")');
    expect(questionFormSource).toContain('setStem("")');
    expect(questionFormSource).toContain('setDifficulty("medium")');
    expect(questionFormSource).toContain('setStatus("draft")');
    expect(questionFormSource).toContain("setAnswers(initialAnswers())");
    expect(questionFormSource).toContain('setCorrectOption("")');
  });

  it("restores saved answers to slots using sort order", () => {
    const markup = renderToStaticMarkup(
      createElement(QuestionForm, {
        action: harmlessAction,
        submitLabel: "Update question",
        categories,
        selectedCertificationId: categories[0].certificationId,
        idPrefix: "question-update",
        selectedQuestion: {
          id: "33333333-3333-4333-8333-333333333333",
          certificationId: categories[0].certificationId,
          categoryId: categories[0].id,
          stem: "Saved question",
          options: [
            {
              text: "Fourth answer",
              explanation: "Fourth explanation",
              citationUrls: ["https://example.com/fourth"],
              isCorrect: true,
              sortOrder: 3,
            },
            {
              text: "Second answer",
              explanation: "Second explanation",
              citationUrls: ["https://example.com/second"],
              isCorrect: false,
            },
          ],
        },
      }),
    );

    expect(markup).toMatch(/<textarea[^>]+name="option3Text"[^>]*>Fourth answer<\/textarea>/);
    expect(markup).toMatch(/<textarea[^>]+name="option1Text"[^>]*>Second answer<\/textarea>/);
    expect(markup).toMatch(
      /<input(?=[^>]*aria-label="Answer 4 is the correct answer")(?=[^>]*checked="")[^>]*>/,
    );
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
    expect(questionFormSource).toContain("option?.isCorrect && option.text.trim()");
    expect(questionFormSource).not.toContain("selectedCorrectOption ?? 0");
  });

  it("marks invalid answer tabs and activates the first invalid field", () => {
    expect(questionFormSource).toContain("questionTabForField");
    expect(questionFormSource).toContain("firstQuestionFieldError");
    expect(questionFormSource).toContain('aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}');
    expect(questionFormSource).toContain('activateField(`option${index}Text`)');
    expect(questionFormSource).toContain("document.getElementById");
    expect(questionFormSource).toContain(".focus()");
  });

  it("makes aggregate errors accessible and falls back from disabled correct options", () => {
    expect(questionFormSource).toContain('<Card id={`${idPrefix}-answers`} tabIndex={-1}>');
    expect(questionFormSource).toContain('id={`${idPrefix}-answer-errors`}');
    expect(questionFormSource).toContain(
      'aria-describedby={overviewHasError ? `${idPrefix}-answer-errors` : undefined}',
    );
    expect(questionFormSource).toContain('input[name="correctOption"]:not(:disabled)');
    expect(questionFormSource).toContain('?? document.getElementById(`${idPrefix}-answers`)');
    expect(questionFormSource).toContain("target.disabled");
  });

  it("merges question select classes with its base styles", () => {
    expect(questionFormSource).toContain('import { cn } from "@/lib/utils";');
    expect(questionFormSource).toContain(
      'className={cn(\n          className,\n          "border-input',
    );
  });
});
