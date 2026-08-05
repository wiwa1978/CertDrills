import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownTextarea } from "@/modules/certdrill/markdown";
import {
  QuestionForm,
  questionFieldActivation,
} from "@/modules/certdrill/question-form";
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

function renderQuestionForm(
  overrides: Partial<Parameters<typeof QuestionForm>[0]> = {},
) {
  return renderToStaticMarkup(
    createElement(QuestionForm, {
      action: harmlessAction,
      submitLabel: "Create question",
      categories,
      selectedCertificationId: categories[0].certificationId,
      idPrefix: "question-create",
      ...overrides,
    }),
  );
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

  it("renders exactly two keyed answers for a new question", () => {
    const markup = renderQuestionForm();

    expect(markup).toContain("<form");
    expect(markup).toContain('name="certificationId"');
    expect(markup).toContain('name="categoryId"');
    expect(markup).toContain('name="stem"');
    expect(markup).toContain('name="difficulty"');
    expect(markup).toContain('name="status"');
    expect(markup).toContain("SEC - Security");
    expect(markup).toMatch(
      /<input(?=[^>]*name="answerKeys")(?=[^>]*value="answer-0,answer-1")[^>]*>/,
    );
    expect(markup.match(/name="answer\.answer-[01]\.text"/g)).toHaveLength(2);
    expect(markup.match(/name="answer\.answer-[01]\.explanation"/g)).toHaveLength(2);
    expect(markup.match(/name="answer\.answer-[01]\.citationUrls"/g)).toHaveLength(2);
    expect(markup.match(/name="correctAnswerKey"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="Answer [12] is the correct answer"/g)).toHaveLength(2);
    expect(
      markup.match(/<input(?=[^>]*name="correctAnswerKey")(?=[^>]*disabled="")[^>]*>/g),
    ).toHaveLength(2);
    expect(markup).toContain('role="tablist"');
    expect(markup.match(/role="tab"/g)).toHaveLength(3);
    expect(markup.match(/role="tabpanel"/g)).toHaveLength(3);
    expect(markup).toContain("Overview");
    expect(markup).toContain("Answer 1");
    expect(markup).toContain("Answer 2");
    expect(markup).not.toContain("Answer 3");
    expect(markup).toContain("Add answer");
    expect(markup).not.toContain("Source resource ID");
    expect(markup).not.toContain("Clear source resource");
    expect(markup).not.toContain("Stem preview");
    expect(markup).not.toContain("Explanation preview");
  });

  it("keeps inactive keyed answer panels mounted and hidden for submission", () => {
    const markup = renderQuestionForm();

    expect(questionFormSource.match(/\bforceMount\b/g)).toHaveLength(2);
    expect(questionFormSource.match(/data-\[state=inactive\]:hidden/g)).toHaveLength(2);
    expect(markup).toContain('data-state="inactive"');
    expect(markup).toContain('name="answer.answer-0.text"');
    expect(markup).toContain('name="answer.answer-0.explanation"');
    expect(markup).toContain('name="answer.answer-0.citationUrls"');
    expect(markup).toContain('name="answer.answer-1.text"');
    expect(markup).toContain('name="answer.answer-1.explanation"');
    expect(markup).toContain('name="answer.answer-1.citationUrls"');
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
    expect(questionFormSource).toContain("setAnswerState(createQuestionAnswerState())");
    expect(questionFormSource).not.toContain("setAnswers(initialAnswers())");
    expect(questionFormSource).not.toContain('setCorrectOption("")');
  });

  it("renders persisted sort-order gaps as contiguous keyed answers", () => {
    const markup = renderQuestionForm({
      submitLabel: "Update question",
      idPrefix: "question-update",
      selectedQuestion: {
        id: "33333333-3333-4333-8333-333333333333",
        certificationId: categories[0].certificationId,
        categoryId: categories[0].id,
        stem: "Saved question",
        options: [
          {
            text: "First answer",
            explanation: "First explanation",
            citationUrls: ["https://example.com/first"],
            isCorrect: false,
            sortOrder: 0,
          },
          {
            text: "Third answer",
            explanation: "Third explanation",
            citationUrls: ["https://example.com/third"],
            isCorrect: true,
            sortOrder: 2,
          },
        ],
      },
    });

    expect(markup).toContain('value="answer-0,answer-1"');
    expect(markup).toMatch(
      /<textarea[^>]+name="answer\.answer-0\.text"[^>]*>First answer<\/textarea>/,
    );
    expect(markup).toMatch(
      /<textarea[^>]+name="answer\.answer-1\.text"[^>]*>Third answer<\/textarea>/,
    );
    expect(markup).not.toContain('name="answer.answer-2.text"');
    expect(markup).toMatch(
      /<input(?=[^>]*name="correctAnswerKey")(?=[^>]*value="answer-1")(?=[^>]*checked="")[^>]*>/,
    );
  });

  it("sorts legacy noncanonical orders into stable contiguous keys", () => {
    const markup = renderQuestionForm({
      submitLabel: "Update question",
      idPrefix: "question-update",
      selectedQuestion: {
        id: "33333333-3333-4333-8333-333333333333",
        certificationId: categories[0].certificationId,
        categoryId: categories[0].id,
        stem: "Legacy ordered question",
        options: [13, 10, 12, 11].map((sortOrder) => {
          const answerNumber = sortOrder - 9;
          return {
            text: `Legacy answer ${answerNumber}`,
            explanation: `Legacy explanation ${answerNumber}`,
            citationUrls: [`https://example.com/legacy-${answerNumber}`],
            isCorrect: answerNumber === 3,
            sortOrder,
          };
        }),
      },
    });

    expect(markup).toContain('value="answer-0,answer-1,answer-2,answer-3"');
    for (const index of [0, 1, 2, 3]) {
      expect(markup).toMatch(
        new RegExp(
          `<textarea[^>]+name="answer\\.answer-${index}\\.text"[^>]*>`
          + `Legacy answer ${index + 1}</textarea>`,
        ),
      );
      expect(markup).toMatch(
        new RegExp(
          `<textarea[^>]+name="answer\\.answer-${index}\\.explanation"[^>]*>`
          + `Legacy explanation ${index + 1}</textarea>`,
        ),
      );
      expect(markup).toMatch(
        new RegExp(
          `<textarea[^>]+name="answer\\.answer-${index}\\.citationUrls"[^>]*>`
          + `https://example.com/legacy-${index + 1}</textarea>`,
        ),
      );
    }
    const correctRadio = markup.match(
      /<input(?=[^>]*name="correctAnswerKey")(?=[^>]*value="answer-2")[^>]*>/,
    )?.[0];
    expect(correctRadio).toContain('checked=""');
    expect(correctRadio).not.toContain("disabled");
  });

  it("renders all ten existing answers and disables adding", () => {
    const options = Array.from({ length: 10 }, (_, index) => ({
      text: `Saved answer ${index + 1}`,
      explanation: "",
      citationUrls: [],
      isCorrect: index === 9,
      sortOrder: index,
    }));
    const markup = renderQuestionForm({
      submitLabel: "Update question",
      idPrefix: "question-update",
      selectedQuestion: {
        id: "33333333-3333-4333-8333-333333333333",
        certificationId: categories[0].certificationId,
        categoryId: categories[0].id,
        stem: "Ten answers",
        options,
      },
    });

    expect(markup.match(/name="answer\.answer-\d+\.text"/g)).toHaveLength(10);
    expect(markup.match(/name="correctAnswerKey"/g)).toHaveLength(10);
    expect(markup).toContain("Answer 10");
    expect(markup).toMatch(/<button(?=[^>]*disabled="")[^>]*>Add answer<\/button>/);
  });

  it("wires dynamic add, removal, keyed fields, and nearest-tab activation", () => {
    expect(questionFormSource).toContain("addQuestionAnswer");
    expect(questionFormSource).toContain("requestQuestionAnswerRemoval");
    expect(questionFormSource).toContain("confirmQuestionAnswerRemoval");
    expect(questionFormSource).toContain("cancelQuestionAnswerRemoval");
    expect(questionFormSource).toContain("function handleAddAnswer()");
    expect(questionFormSource).toContain("function handleRemoveRequest(answerKey: string)");
    expect(questionFormSource).toContain("function nearestAnswerKey(");
    expect(questionFormSource).toContain('name="answerKeys"');
    expect(questionFormSource).toContain('name="correctAnswerKey"');
    expect(questionFormSource).toContain("pendingRemovalKey");
    expect(
      questionFormSource.match(/value=\{`answer:\$\{answer\.key\}`\}/g),
    ).toHaveLength(2);
    expect(questionFormSource).toMatch(
      /activateField\(\s+answerFieldName\(result\.addedKey, "text"\),\s+result\.state\.answers,\s+\)/,
    );
    expect(questionFormSource).toContain(
      'activateField(answerFieldName(answer.key, "text"))',
    );
    expect(questionFormSource).toContain(
      "const nextKey = nearestAnswerKey(answerState.answers, answerKey);",
    );
    expect(questionFormSource).toMatch(
      /function handleRemoveRequest\(answerKey: string\)[\s\S]*?if \(result\.removed && nextKey\) \{\s+activateField\(answerFieldName\(nextKey, "text"\)\)/,
    );
    expect(questionFormSource).toMatch(
      /function handleConfirmRemoval\(answerKey: string\)[\s\S]*?if \(nextKey\) \{\s+activateField\(answerFieldName\(nextKey, "text"\)\)/,
    );
    expect(questionFormSource).toMatch(
      /function handleCancelRemoval\(answerKey: string\)[\s\S]*?activateField\(answerFieldName\(answerKey, "text"\)\)/,
    );
    expect(questionFormSource).toContain(
      "onClick={() => handleCancelRemoval(answer.key)}",
    );
    expect(questionFormSource).toMatch(
      /const index = answers\.findIndex\(\(answer\) => answer\.key === removedKey\);\s+if \(index === -1\) return undefined;/,
    );
  });

  it("falls back stale keyed answer activations to the Overview answers target", () => {
    expect(
      questionFieldActivation(
        "answer.answer-1.explanation",
        ["answer-0", "answer-1"],
      ),
    ).toEqual({
      tab: "answer:answer-1",
      fieldName: "answer.answer-1.explanation",
    });
    expect(
      questionFieldActivation(
        "answer.removed-answer.text",
        ["answer-0", "answer-1"],
      ),
    ).toEqual({
      tab: "overview",
      fieldName: "options",
    });
  });

  it("keeps field activation stable while reading current answer keys", () => {
    expect(questionFormSource).toContain("useRef,");
    expect(questionFormSource).toContain(
      "const answerKeysRef = useRef(answerState.answers.map((answer) => answer.key));",
    );
    expect(questionFormSource).toContain(
      "answerKeysRef.current = answerState.answers.map((answer) => answer.key);",
    );
    expect(questionFormSource).toMatch(
      /const activateField = useCallback\(\([\s\S]*?explicitAnswers\?: QuestionAnswerEditorState\["answers"\],[\s\S]*?explicitAnswers\s+\? explicitAnswers\.map\(\(answer\) => answer\.key\)\s+: answerKeysRef\.current,[\s\S]*?\}, \[\]\);/,
    );
    expect(questionFormSource).not.toContain("}, [answerState.answers]);");
  });

  it("removes all fixed-four answer constructs", () => {
    expect(questionFormSource).not.toContain("answerIndexes");
    expect(questionFormSource).not.toContain("type AnswerIndex");
    expect(questionFormSource).not.toContain("type AnswerValue");
    expect(questionFormSource).not.toContain("type AnswerValues");
    expect(questionFormSource).not.toContain("initialAnswers");
    expect(questionFormSource).not.toContain("initialAnswerState");
    expect(questionFormSource).not.toContain("correctOption");
    expect(questionFormSource).not.toContain("setCorrectOption");
    expect(questionFormSource).not.toContain("option${index}Text");
    expect(questionFormSource).not.toContain("setAnswers(initialAnswers())");
  });

  it("uses Markdown for Stem and every dynamic answer text and explanation without previews", () => {
    expect(questionFormSource).toContain('label="Stem"');
    expect(questionFormSource).toContain('label={`Answer ${index + 1} text`}');
    expect(questionFormSource).toContain('label={`Answer ${index + 1} explanation`}');
    expect(questionFormSource).toContain("<MarkdownTextarea");
    expect(questionFormSource).not.toContain("MarkdownTextareaWithPreview");
    expect(questionFormSource).not.toContain("Stem preview");
    expect(questionFormSource).not.toContain("Explanation preview");
  });

  it("preserves source resources without showing source controls", () => {
    const markup = renderQuestionForm({
      selectedQuestion: {
        id: "33333333-3333-4333-8333-333333333333",
        certificationId: categories[0].certificationId,
        categoryId: categories[0].id,
        sourceResourceId: "44444444-4444-4444-8444-444444444444",
        stem: "Sourced question",
        options: [],
      },
    });

    expect(questionFormSource).toContain('type="hidden"');
    expect(questionFormSource).toContain('name="sourceResourceId"');
    expect(markup).toContain('name="sourceResourceId"');
    expect(markup).toContain('value="44444444-4444-4444-8444-444444444444"');
    expect(markup).not.toContain("Source resource ID");
    expect(markup).not.toContain("Clear source resource");
  });

  it("uses stable correct-answer keys and disables empty choices", () => {
    expect(questionFormSource).toContain('name="correctAnswerKey"');
    expect(questionFormSource).toContain(
      "checked={answerState.correctAnswerKey === answer.key}",
    );
    expect(questionFormSource).toContain("disabled={!answer.text.trim()}");
    expect(questionFormSource).toContain("correctAnswerKey: answer.key");
    expect(questionFormSource).not.toContain('name="correctOption"');
    expect(questionFormSource).not.toContain("selectedCorrectOption ?? 0");
  });

  it("marks invalid keyed tabs and focuses stable answer fields", () => {
    expect(questionFormSource).toContain("questionTabForField");
    expect(questionFormSource).toContain("firstQuestionFieldError");
    expect(questionFormSource).toContain(
      'fieldName.startsWith(`answer.${answer.key}.`)',
    );
    expect(questionFormSource).toContain(
      'aria-label={`Answer ${index + 1}${hasError ? " has errors" : ""}`}',
    );
    expect(questionFormSource).toContain(
      'activateField(answerFieldName(answer.key, "text"))',
    );
    expect(questionFormSource).toContain(
      "document.getElementById(questionFieldId(idPrefix, fieldToFocus))?.focus()",
    );
  });

  it("makes aggregate errors accessible and focuses enabled correct answers", () => {
    const checkedEnabledSelector =
      "'input[name=\"correctAnswerKey\"]:checked:not(:disabled)'";
    const firstEnabledSelector =
      "'input[name=\"correctAnswerKey\"]:not(:disabled)'";

    expect(questionFormSource).toContain('<Card id={`${idPrefix}-answers`} tabIndex={-1}>');
    expect(questionFormSource).toContain('id={`${idPrefix}-answer-errors`}');
    expect(questionFormSource).toContain('id={`${idPrefix}-correct-answer`}');
    expect(questionFormSource).toContain('<legend className="sr-only">Correct answer</legend>');
    expect(questionFormSource).toContain(
      'aria-describedby={overviewHasError ? `${idPrefix}-answer-errors` : undefined}',
    );
    expect(questionFormSource).toContain('fieldToFocus === "correctAnswerKey"');
    expect(questionFormSource).toContain(checkedEnabledSelector);
    expect(questionFormSource).toContain(firstEnabledSelector);
    expect(questionFormSource.indexOf(checkedEnabledSelector)).toBeLessThan(
      questionFormSource.indexOf(firstEnabledSelector),
    );
    expect(questionFormSource).toContain("`${idPrefix}-correct-answer`");
    expect(questionFormSource).not.toContain("target.disabled");
  });

  it("summarizes entered and empty answers on Overview", () => {
    const emptyMarkup = renderQuestionForm();
    const enteredMarkup = renderQuestionForm({
      selectedQuestion: {
        id: "33333333-3333-4333-8333-333333333333",
        certificationId: categories[0].certificationId,
        categoryId: categories[0].id,
        stem: "Saved question",
        options: [{
          text: "A sufficiently descriptive saved answer",
          explanation: "",
          citationUrls: [],
          isCorrect: true,
          sortOrder: 0,
        }],
      },
    });

    expect(emptyMarkup).toContain("Not entered");
    expect(emptyMarkup).toContain("Empty");
    expect(enteredMarkup).toContain("A sufficiently descriptive saved answer");
    expect(enteredMarkup).toContain("Entered");
  });

  it("renders bounded removal controls and inline confirmation wiring", () => {
    const markup = renderQuestionForm();

    expect(
      markup.match(/<button(?=[^>]*disabled="")[^>]*>Remove answer<\/button>/g),
    ).toHaveLength(2);
    expect(questionFormSource).toContain(
      "disabled={answerState.answers.length >= MAX_QUESTION_ANSWERS}",
    );
    expect(questionFormSource).toContain(
      "disabled={answerState.answers.length <= MIN_QUESTION_ANSWERS}",
    );
    expect(questionFormSource).toContain(
      "This answer contains content. Remove it permanently?",
    );
    expect(questionFormSource).toContain('variant="destructive"');
    expect(questionFormSource).toContain("Cancel");
    expect(questionFormSource).toContain('role="alert"');
  });

  it("merges question select classes with its base styles", () => {
    expect(questionFormSource).toContain('import { cn } from "@/lib/utils";');
    expect(questionFormSource).toContain(
      'className={cn(\n          "border-input',
    );
    expect(questionFormSource).toContain('shadow-xs",\n          className,');
  });
});
