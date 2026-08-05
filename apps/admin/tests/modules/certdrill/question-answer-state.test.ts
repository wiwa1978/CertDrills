import { describe, expect, it } from "vitest";

import type { CertDrillAdminQuestionOptionInput } from "@/lib/api/certdrill.server";
import {
  addQuestionAnswer,
  cancelQuestionAnswerRemoval,
  confirmQuestionAnswerRemoval,
  createQuestionAnswerState,
  updateQuestionAnswer,
  requestQuestionAnswerRemoval,
  type QuestionAnswerEditorState,
} from "@/modules/certdrill/question-answer-state";

function blankAnswer(key: string) {
  return {
    key,
    text: "",
    explanation: "",
    citationUrls: "",
  };
}

function option(
  value: Partial<CertDrillAdminQuestionOptionInput> & Pick<CertDrillAdminQuestionOptionInput, "text">,
): CertDrillAdminQuestionOptionInput {
  return {
    text: value.text,
    isCorrect: value.isCorrect ?? false,
    explanation: value.explanation,
    citationUrls: value.citationUrls,
    sortOrder: value.sortOrder,
  };
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

describe("question answer state", () => {
  it("creates a new state with two blank answers", () => {
    expect(createQuestionAnswerState()).toEqual({
      answers: [
        blankAnswer("answer-0"),
        blankAnswer("answer-1"),
      ],
      correctAnswerKey: "",
      nextAnswerNumber: 2,
    });
  });

  it("loads existing answers, normalizes order, and follows the normalized correct answer", () => {
    const twoAnswerState = createQuestionAnswerState([
      option({ text: "Second", isCorrect: true, explanation: "Because", citationUrls: ["https://b.test"] }),
      option({ text: "First", sortOrder: -1, citationUrls: ["https://a.test", "https://b.test"] }),
    ]);

    expect(twoAnswerState).toEqual({
      answers: [
        {
          key: "answer-0",
          text: "First",
          explanation: "",
          citationUrls: "https://a.test, https://b.test",
        },
        {
          key: "answer-1",
          text: "Second",
          explanation: "Because",
          citationUrls: "https://b.test",
        },
      ],
      correctAnswerKey: "answer-1",
      nextAnswerNumber: 2,
    });

    const nonCanonicalState = createQuestionAnswerState([
      option({ text: "Thirteen", sortOrder: 13 }),
      option({ text: "Ten", sortOrder: 10 }),
      option({ text: "Twelve", sortOrder: 12 }),
      option({ text: "Eleven", sortOrder: 11, isCorrect: true }),
    ]);

    expect(nonCanonicalState).toEqual({
      answers: [
        { key: "answer-0", text: "Ten", explanation: "", citationUrls: "" },
        { key: "answer-1", text: "Eleven", explanation: "", citationUrls: "" },
        { key: "answer-2", text: "Twelve", explanation: "", citationUrls: "" },
        { key: "answer-3", text: "Thirteen", explanation: "", citationUrls: "" },
      ],
      correctAnswerKey: "answer-1",
      nextAnswerNumber: 4,
    });

    const tenAnswerState = createQuestionAnswerState([
      option({ text: "Ignored", sortOrder: 10 }),
      ...Array.from({ length: 10 }, (_, index) => option({
        text: `Answer ${index}`,
        isCorrect: index === 9,
        sortOrder: index,
      })),
    ]);

    expect(tenAnswerState.answers).toHaveLength(10);
    expect(tenAnswerState.answers.at(-1)).toEqual({
      key: "answer-9",
      text: "Answer 9",
      explanation: "",
      citationUrls: "",
    });
    expect(tenAnswerState.correctAnswerKey).toBe("answer-9");
    expect(tenAnswerState.nextAnswerNumber).toBe(10);
  });

  it("pads fewer than two answers and ignores a correct option without text", () => {
    const state = createQuestionAnswerState([
      option({ text: "   ", isCorrect: true, explanation: "Blank correct" }),
    ]);

    expect(state).toEqual({
      answers: [
        {
          key: "answer-0",
          text: "   ",
          explanation: "Blank correct",
          citationUrls: "",
        },
        blankAnswer("answer-1"),
      ],
      correctAnswerKey: "",
      nextAnswerNumber: 2,
    });
  });

  it("adds blank answers through the maximum and then no-ops", () => {
    let state = createQuestionAnswerState();
    let lastAddedKey: string | undefined;

    for (let count = 2; count < 10; count += 1) {
      const result = addQuestionAnswer({
        ...state,
        pendingRemovalKey: count === 2 ? "answer-0" : state.pendingRemovalKey,
      });
      state = result.state;
      lastAddedKey = result.addedKey;
      expect(result.addedKey).toBe(`answer-${count}`);
    }

    expect(lastAddedKey).toBe("answer-9");
    expect(state.answers).toHaveLength(10);
    expect(state.nextAnswerNumber).toBe(10);
    expect(state.pendingRemovalKey).toBeUndefined();

    const noOp = addQuestionAnswer(state);

    expect(noOp.addedKey).toBeUndefined();
    expect(noOp.state).toBe(state);
  });

  it("removes empty answers immediately and requires confirmation for populated answers", () => {
    const withBlank = addQuestionAnswer(createQuestionAnswerState()).state;

    const emptyRemoval = requestQuestionAnswerRemoval(withBlank, "answer-2");

    expect(emptyRemoval).toEqual({
      removed: true,
      needsConfirmation: false,
      state: {
        answers: [
          blankAnswer("answer-0"),
          blankAnswer("answer-1"),
        ],
        correctAnswerKey: "",
        nextAnswerNumber: 3,
      },
    });

    const populatedState = createQuestionAnswerState([
      option({ text: "First" }),
      option({ text: "Second" }),
      option({ text: "Third", explanation: "Needs confirmation" }),
    ]);

    const confirmation = requestQuestionAnswerRemoval(populatedState, "answer-2");

    expect(confirmation.removed).toBe(false);
    expect(confirmation.needsConfirmation).toBe(true);
    expect(confirmation.state.pendingRemovalKey).toBe("answer-2");
    expect(confirmation.state.answers).toEqual(populatedState.answers);
  });

  it("cancels pending removal without changing answers", () => {
    const state = createQuestionAnswerState([
      option({ text: "First" }),
      option({ text: "Second" }),
      option({ text: "Third" }),
    ]);
    const requested = requestQuestionAnswerRemoval(state, "answer-1").state;

    expect(cancelQuestionAnswerRemoval(requested)).toEqual({
      answers: state.answers,
      correctAnswerKey: "",
      nextAnswerNumber: 3,
    });
  });

  it("cannot remove answers below the minimum or remove unknown answers", () => {
    const state = createQuestionAnswerState();

    expect(requestQuestionAnswerRemoval(state, "answer-0")).toEqual({
      state,
      removed: false,
      needsConfirmation: false,
    });
    expect(requestQuestionAnswerRemoval(addQuestionAnswer(state).state, "answer-99")).toEqual({
      state: addQuestionAnswer(state).state,
      removed: false,
      needsConfirmation: false,
    });
  });

  it("clears the selected correct answer when the answer is removed", () => {
    const state = createQuestionAnswerState([
      option({ text: "First" }),
      option({ text: "Second", isCorrect: true }),
      option({ text: "Third" }),
    ]);

    const requested = requestQuestionAnswerRemoval(state, "answer-1");
    const confirmed = confirmQuestionAnswerRemoval(requested.state, "answer-1");

    expect(confirmed).toEqual({
      answers: [
        { key: "answer-0", text: "First", explanation: "", citationUrls: "" },
        { key: "answer-2", text: "Third", explanation: "", citationUrls: "" },
      ],
      correctAnswerKey: "",
      nextAnswerNumber: 3,
    });
  });

  it("direct confirm removes the requested answer when more than two remain", () => {
    const state = createQuestionAnswerState([
      option({ text: "First" }),
      option({ text: "Second" }),
      option({ text: "Third" }),
    ]);

    expect(confirmQuestionAnswerRemoval({
      ...state,
      pendingRemovalKey: "answer-0",
    }, "answer-1")).toEqual({
      answers: [
        { key: "answer-0", text: "First", explanation: "", citationUrls: "" },
        { key: "answer-2", text: "Third", explanation: "", citationUrls: "" },
      ],
      correctAnswerKey: "",
      nextAnswerNumber: 3,
    });
  });

  it("clears the selected correct answer when its text becomes blank", () => {
    const state = createQuestionAnswerState([
      option({ text: "First" }),
      option({ text: "Second", isCorrect: true }),
    ]);

    expect(updateQuestionAnswer(state, "answer-1", "text", "   ")).toEqual({
      answers: [
        { key: "answer-0", text: "First", explanation: "", citationUrls: "" },
        { key: "answer-1", text: "   ", explanation: "", citationUrls: "" },
      ],
      correctAnswerKey: "",
      nextAnswerNumber: 2,
    });
  });

  it("uses a fresh key after removing and re-adding an answer", () => {
    const afterAdds = addQuestionAnswer(addQuestionAnswer(createQuestionAnswerState()).state).state;
    const afterRemoval = requestQuestionAnswerRemoval(afterAdds, "answer-2").state;
    const reAdded = addQuestionAnswer(afterRemoval);

    expect(afterRemoval.answers.map((answer) => answer.key)).toEqual([
      "answer-0",
      "answer-1",
      "answer-3",
    ]);
    expect(reAdded.addedKey).toBe("answer-4");
    expect(reAdded.state.answers.map((answer) => answer.key)).toEqual([
      "answer-0",
      "answer-1",
      "answer-3",
      "answer-4",
    ]);
    expect(reAdded.state.nextAnswerNumber).toBe(5);
  });

  it("does not mutate input options or prior state objects", () => {
    const options = deepFreeze<CertDrillAdminQuestionOptionInput[]>([
      option({ text: "Second", sortOrder: 2 }),
      option({ text: "First", sortOrder: 1, citationUrls: ["https://first.test"] }),
    ]);
    const optionsSnapshot = JSON.parse(JSON.stringify(options)) as CertDrillAdminQuestionOptionInput[];

    const created = createQuestionAnswerState(options);

    expect(options).toEqual(optionsSnapshot);

    const originalState = deepFreeze<QuestionAnswerEditorState>({
      answers: [
        { key: "answer-0", text: "First", explanation: "", citationUrls: "" },
        { key: "answer-1", text: "Second", explanation: "", citationUrls: "" },
        { key: "answer-2", text: "", explanation: "", citationUrls: "" },
      ],
      correctAnswerKey: "answer-1",
      pendingRemovalKey: "answer-0",
      nextAnswerNumber: 3,
    });
    const originalSnapshot = JSON.parse(JSON.stringify(originalState)) as QuestionAnswerEditorState;

    const updated = updateQuestionAnswer(originalState, "answer-1", "text", "Updated");
    const requested = requestQuestionAnswerRemoval(originalState, "answer-2").state;

    expect(originalState).toEqual(originalSnapshot);
    expect(updated).not.toBe(originalState);
    expect(requested).not.toBe(originalState);
    expect(created.answers.map((answer) => answer.key)).toEqual(["answer-0", "answer-1"]);
  });
});
