import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: "a",
}));

vi.mock("../../src/lib/api/certdrill", () => ({
  answerCertDrillQuestion: vi.fn(),
  submitCertDrillAttempt: vi.fn(),
}));

import { getResumeQuestionIndex, getResumeSelection, resolveAttemptForRunner } from "../../src/modules/certdrill/exam-runner";

import { readFileSync } from "node:fs";

const catalogSource = readFileSync(new URL("../../src/modules/certdrill/catalog-page.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../../src/modules/certdrill/attempt-history-page.tsx", import.meta.url), "utf8");
const examsPageSource = readFileSync(new URL("../../src/app/[locale]/(backend)/exams/page.tsx", import.meta.url), "utf8");

const attempt = {
  attemptId: "33333333-3333-4333-8333-333333333333",
  feedbackMode: "exam" as const,
  selectionMode: "weighted_random" as const,
  testMode: "exam" as const,
  testVariant: "exam_simulation" as const,
  confidenceEnabled: true,
  questions: [
    {
      id: "55555555-5555-4555-8555-555555555555",
      stem: "Question 1",
      mediaAssets: [],
      category: { id: "44444444-4444-4444-8444-444444444444", code: "D1", name: "Domain 1" },
      options: [{ id: "77777777-7777-4777-8777-777777777777", text: "Option 1", mediaAssets: [] }],
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      stem: "Question 2",
      mediaAssets: [],
      category: { id: "44444444-4444-4444-8444-444444444444", code: "D1", name: "Domain 1" },
      options: [{ id: "99999999-9999-4999-8999-999999999999", text: "Option 2", mediaAssets: [] }],
    },
  ],
  recordedAnswers: [
    {
      questionId: "55555555-5555-4555-8555-555555555555",
      selectedOptionId: "77777777-7777-4777-8777-777777777777",
      confidence: "guessed" as const,
    },
  ],
};

describe("CertDrill runner resume state", () => {
  it("starts resumed attempts at the first unanswered question", () => {
    expect(getResumeQuestionIndex(attempt)).toBe(1);
  });

  it("hydrates selected option and confidence for answered questions", () => {
    expect(getResumeSelection(attempt, 0)).toEqual({
      selectedOptionId: "77777777-7777-4777-8777-777777777777",
      confidence: "guessed",
    });
  });

  it("uses the server resume attempt while session storage is still unresolved", () => {
    expect(resolveAttemptForRunner(undefined, attempt)).toBe(attempt);
  });

  it("prefers server recorded answers over stale session storage attempts", () => {
    const staleStoredAttempt = {
      attemptId: attempt.attemptId,
      feedbackMode: attempt.feedbackMode,
      selectionMode: attempt.selectionMode,
      testMode: attempt.testMode,
      testVariant: attempt.testVariant,
      confidenceEnabled: attempt.confidenceEnabled,
      questions: attempt.questions,
    };

    const resolvedAttempt = resolveAttemptForRunner(staleStoredAttempt, attempt);

    expect(resolvedAttempt).toBe(attempt);
    expect(getResumeQuestionIndex(resolvedAttempt!)).toBe(1);
  });

  it("shows resume attempt copy for in-progress attempts in catalog and history", () => {
    expect(examsPageSource).toContain("getCertDrillAttemptsServer");
    expect(examsPageSource).toContain("attempts={attempts}");
    expect(catalogSource).toContain("inProgressAttempts");
    expect(catalogSource).toContain("Resume attempt");
    expect(catalogSource).toContain("/exams/${attempt.id}");
    expect(historySource).toContain("Resume attempt");
    expect(historySource).toContain("/exams/${attempt.id}");
  });

  it("keeps started timestamps separate from attempt history actions", () => {
    expect(historySource).toContain("Started");
    expect(historySource).toContain("Actions");
    expect(historySource).toContain("md:grid-cols-12");
    expect(historySource).toContain("md:col-span-3");
    expect(historySource).toContain("formatDateTime(attempt.startedAt)");
  });
});
