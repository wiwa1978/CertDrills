import type { CertDrillAdminQuestionOptionInput } from "@/lib/api/certdrill.server";

import { MAX_QUESTION_ANSWERS, MIN_QUESTION_ANSWERS } from "./question-answer-fields";

export type QuestionAnswerDraft = {
  key: string;
  text: string;
  explanation: string;
  citationUrls: string;
};

export type QuestionAnswerEditorState = {
  answers: QuestionAnswerDraft[];
  correctAnswerKey: string;
  pendingRemovalKey?: string;
  nextAnswerNumber: number;
};

type EditableQuestionAnswerField = Exclude<keyof QuestionAnswerDraft, "key">;

function blankAnswer(key: string): QuestionAnswerDraft {
  return {
    key,
    text: "",
    explanation: "",
    citationUrls: "",
  };
}

function citationEditorValue(citationUrls?: string[]) {
  return (citationUrls ?? []).join(", ");
}

function hasContent(answer: QuestionAnswerDraft) {
  return (
    answer.text.trim() !== ""
    || answer.explanation.trim() !== ""
    || answer.citationUrls.trim() !== ""
  );
}

function orderedOptions(options?: CertDrillAdminQuestionOptionInput[]) {
  return (options ?? [])
    .map((option, originalPosition) => ({
      option,
      originalPosition,
      sortOrder: option.sortOrder ?? originalPosition,
    }))
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.originalPosition - right.originalPosition
    ))
    .slice(0, MAX_QUESTION_ANSWERS);
}

function removeQuestionAnswer(state: QuestionAnswerEditorState, answerKey: string): QuestionAnswerEditorState {
  return {
    ...state,
    answers: state.answers.filter((answer) => answer.key !== answerKey),
    correctAnswerKey: state.correctAnswerKey === answerKey ? "" : state.correctAnswerKey,
    pendingRemovalKey: undefined,
  };
}

export function createQuestionAnswerState(options?: CertDrillAdminQuestionOptionInput[]): QuestionAnswerEditorState {
  const answers: QuestionAnswerDraft[] = [];
  let correctAnswerKey = "";

  orderedOptions(options).forEach(({ option }, index) => {
    const key = `answer-${index}`;
    answers.push({
      key,
      text: option.text,
      explanation: option.explanation ?? "",
      citationUrls: citationEditorValue(option.citationUrls),
    });

    if (!correctAnswerKey && option.isCorrect && option.text.trim() !== "") {
      correctAnswerKey = key;
    }
  });

  while (answers.length < MIN_QUESTION_ANSWERS) {
    answers.push(blankAnswer(`answer-${answers.length}`));
  }

  return {
    answers,
    correctAnswerKey,
    nextAnswerNumber: answers.length,
  };
}

export function addQuestionAnswer(state: QuestionAnswerEditorState) {
  if (state.answers.length >= MAX_QUESTION_ANSWERS) {
    return { state };
  }

  const addedKey = `answer-${state.nextAnswerNumber}`;

  return {
    addedKey,
    state: {
      ...state,
      answers: [...state.answers, blankAnswer(addedKey)],
      pendingRemovalKey: undefined,
      nextAnswerNumber: state.nextAnswerNumber + 1,
    },
  };
}

export function updateQuestionAnswer(
  state: QuestionAnswerEditorState,
  answerKey: string,
  field: EditableQuestionAnswerField,
  value: string,
) {
  const answerIndex = state.answers.findIndex((answer) => answer.key === answerKey);
  if (answerIndex === -1) {
    return state;
  }

  const answers = state.answers.map((answer) => (
    answer.key === answerKey
      ? { ...answer, [field]: value }
      : answer
  ));

  return {
    ...state,
    answers,
    correctAnswerKey: (
      field === "text"
      && state.correctAnswerKey === answerKey
      && value.trim() === ""
    )
      ? ""
      : state.correctAnswerKey,
  };
}

export function requestQuestionAnswerRemoval(state: QuestionAnswerEditorState, answerKey: string) {
  if (state.answers.length <= MIN_QUESTION_ANSWERS) {
    return { state, removed: false, needsConfirmation: false };
  }

  const answer = state.answers.find((candidate) => candidate.key === answerKey);
  if (!answer) {
    return { state, removed: false, needsConfirmation: false };
  }

  if (!hasContent(answer)) {
    return {
      state: removeQuestionAnswer(state, answerKey),
      removed: true,
      needsConfirmation: false,
    };
  }

  return {
    state: {
      ...state,
      pendingRemovalKey: answerKey,
    },
    removed: false,
    needsConfirmation: true,
  };
}

export function confirmQuestionAnswerRemoval(state: QuestionAnswerEditorState, answerKey: string) {
  if (state.answers.length <= MIN_QUESTION_ANSWERS || !state.answers.some((answer) => answer.key === answerKey)) {
    return state;
  }

  return removeQuestionAnswer(state, answerKey);
}

export function cancelQuestionAnswerRemoval(state: QuestionAnswerEditorState) {
  return state.pendingRemovalKey
    ? { ...state, pendingRemovalKey: undefined }
    : state;
}
