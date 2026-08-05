import { beforeEach, describe, expect, it, vi } from "vitest";

const { createQuestion, updateQuestion, revalidatePath } = vi.hoisted(() => ({
  createQuestion: vi.fn(),
  updateQuestion: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/api/certdrill.server", () => ({
  createCertDrillAdminQuestionServer: createQuestion,
  updateCertDrillAdminQuestionServer: updateQuestion,
}));

import {
  createCertDrillQuestionAction,
  updateCertDrillQuestionAction,
} from "@/modules/certdrill/admin-actions";
import { answerFieldName } from "@/modules/certdrill/question-answer-fields";
import { initialQuestionFormActionState } from "@/modules/certdrill/question-form-state";

const certificationId = "22222222-2222-4222-8222-222222222222";
const categoryId = "11111111-1111-4111-8111-111111111111";
const questionId = "44444444-4444-4444-8444-444444444444";
const sourceResourceId = "55555555-5555-4555-8555-555555555555";

function formData(entries: Record<string, string>) {
  const data = new FormData();
  Object.entries(entries).forEach(([name, value]) => data.set(name, value));
  return data;
}

function answerEntries(
  answers: Array<{
    key: string;
    text?: string;
    explanation?: string;
    citationUrls?: string;
  }>,
  correctAnswerKey = "",
) {
  return Object.fromEntries([
    ["answerKeys", answers.map((answer) => answer.key).join(",")],
    ["correctAnswerKey", correctAnswerKey],
    ...answers.flatMap((answer) => [
      [answerFieldName(answer.key, "text"), answer.text ?? ""],
      [answerFieldName(answer.key, "explanation"), answer.explanation ?? ""],
      [answerFieldName(answer.key, "citationUrls"), answer.citationUrls ?? ""],
    ]),
  ]);
}

const validDraft = {
  certificationId,
  categoryId,
  stem: "Question?",
  status: "draft",
  ...answerEntries([
    { key: "answer-a", text: "First answer" },
    { key: "answer-b", text: "Second answer" },
  ]),
};

describe("question form actions", () => {
  beforeEach(() => {
    createQuestion.mockReset();
    updateQuestion.mockReset();
    revalidatePath.mockReset();
  });

  it("returns field errors without calling the API for invalid submissions", async () => {
    const result = await createCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData({ certificationId, categoryId, stem: " " }),
    );

    expect(result.status).toBe("error");
    expect(result.fieldErrors.stem).toEqual(["Enter a question stem."]);
    expect(createQuestion).not.toHaveBeenCalled();
  });

  it("returns a form error when the API rejects a valid submission", async () => {
    createQuestion.mockRejectedValueOnce(new Error("Question could not be saved"));

    const result = await createCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData(validDraft),
    );

    expect(result).toMatchObject({
      status: "error",
      formError: "Question could not be saved",
    });
  });

  it("creates a valid draft and returns a success message", async () => {
    createQuestion.mockResolvedValueOnce({});

    const result = await createCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData(validDraft),
    );

    expect(createQuestion).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "success",
      fieldErrors: {},
      message: "Question created.",
    });
  });

  it("creates draft options as incorrect when no correct option is submitted", async () => {
    createQuestion.mockResolvedValueOnce({});

    await createCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData(validDraft),
    );

    expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
      options: [
        expect.objectContaining({ text: "First answer", isCorrect: false, sortOrder: 0 }),
        expect.objectContaining({ text: "Second answer", isCorrect: false, sortOrder: 1 }),
      ],
    }));
  });

  it("preserves keyed answer order and correct selection when creating", async () => {
    createQuestion.mockResolvedValueOnce({});

    await createCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData({
        certificationId,
        categoryId,
        stem: "Ordered question?",
        status: "draft",
        ...answerEntries([
          { key: "answer-z", text: "Z answer" },
          { key: "answer-a", text: "A answer" },
          { key: "answer-q", text: "Q answer" },
        ], "answer-a"),
      }),
    );

    expect(createQuestion).toHaveBeenCalledWith(expect.objectContaining({
      options: [
        expect.objectContaining({ text: "Z answer", isCorrect: false, sortOrder: 0 }),
        expect.objectContaining({ text: "A answer", isCorrect: true, sortOrder: 1 }),
        expect.objectContaining({ text: "Q answer", isCorrect: false, sortOrder: 2 }),
      ],
    }));
  });

  it("preserves a submitted source resource id when updating", async () => {
    updateQuestion.mockResolvedValueOnce({});

    const result = await updateCertDrillQuestionAction(
      initialQuestionFormActionState,
      formData({ questionId, sourceResourceId, ...validDraft }),
    );

    expect(updateQuestion).toHaveBeenCalledWith(questionId, expect.objectContaining({
      sourceResourceId,
    }));
    expect(result).toEqual({
      status: "success",
      fieldErrors: {},
      message: "Question updated.",
    });
  });
});
