import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCertDrillUserRouter } from "../src/modules/certdrill/routes";
import { CertDrillServiceError } from "../src/modules/certdrill/service";

const service = {
  listCertifications: vi.fn(),
  listMyCertifications: vi.fn(),
  listCategories: vi.fn(),
  createAttempt: vi.fn(),
  getAttemptForResume: vi.fn(),
  answerQuestion: vi.fn(),
  createQuestionFeedback: vi.fn(),
  submitAttempt: vi.fn(),
  reviewAttempt: vi.fn(),
  listAttempts: vi.fn(),
  getReadinessSummary: vi.fn(),
  listDueReviewQueue: vi.fn(),
};

const userId = "11111111-1111-4111-8111-111111111111";
const certificationId = "22222222-2222-4222-8222-222222222222";
const attemptId = "33333333-3333-4333-8333-333333333333";
const questionId = "44444444-4444-4444-8444-444444444444";
const selectedOptionId = "55555555-5555-4555-8555-555555555555";

const emptyAttemptResponse = {
  attemptId,
  feedbackMode: "practice",
  selectionMode: "weighted_random",
  testMode: "practice",
  testVariant: "quick_drill",
  confidenceEnabled: false,
  expiresAt: null,
  questions: [],
};

function createApp() {
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("authUser", { id: userId });
    await next();
  });
  app.route("/api/certdrill", createCertDrillUserRouter({ service: service as never }));
  return app;
}

describe("CertDrill routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates certification catalog requests with the authenticated user id", async () => {
    service.listCertifications.mockResolvedValueOnce([{ id: certificationId, accessStatus: "purchased" }]);

    const response = await createApp().request("/api/certdrill/certifications");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: [{ id: certificationId, accessStatus: "purchased" }],
    });
    expect(service.listCertifications).toHaveBeenCalledWith(userId);
  });

  it("delegates readiness summary requests with the authenticated user id", async () => {
    const readiness = {
      completedAttempts: 2,
      averageScorePct: 75,
      missedQuestionCount: 3,
      weakCategoryCount: 1,
    };
    service.getReadinessSummary.mockResolvedValueOnce(readiness);

    const response = await createApp().request("/api/certdrill/readiness");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: readiness });
    expect(service.getReadinessSummary).toHaveBeenCalledWith(userId);
  });

  it("delegates due review queue requests with the authenticated user id", async () => {
    const dueQueue = [{ id: "abababab-abab-4aba-8aba-abababababab", question: { id: questionId } }];
    service.listDueReviewQueue.mockResolvedValueOnce(dueQueue);

    const response = await createApp().request("/api/certdrill/review-queue/due");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: dueQueue });
    expect(service.listDueReviewQueue).toHaveBeenCalledWith(userId);
  });

  it("rejects invalid create attempt payloads", async () => {
    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectionMode: "weighted_random" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid create attempt payload",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "certificationId", message: "Certification ID is required." }),
        ]),
      },
    });
    expect(service.createAttempt).not.toHaveBeenCalled();
  });

  it("rejects invalid exam form practice attempts", async () => {
    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId,
        testMode: "practice",
        testVariant: "exam_form",
        examFormId: certificationId,
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createAttempt).not.toHaveBeenCalled();
  });

  it("delegates legacy-only create attempt payloads after deriving mode fields", async () => {
    const body = {
      certificationId,
      feedbackMode: "practice",
      selectionMode: "category_focus",
      categoryIds: [questionId],
    };
    service.createAttempt.mockResolvedValueOnce({
      ...emptyAttemptResponse,
      selectionMode: "category_focus",
      testVariant: "category_drill",
    });

    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(service.createAttempt).toHaveBeenCalledWith(userId, {
      ...body,
      testMode: "practice",
      testVariant: "category_drill",
      confidenceEnabled: false,
    });
  });

  it("normalizes legacy exam category payloads to exam simulation before delegation", async () => {
    const body = {
      certificationId,
      feedbackMode: "exam",
      selectionMode: "category_focus",
      categoryIds: [questionId],
    };
    service.createAttempt.mockResolvedValueOnce({
      ...emptyAttemptResponse,
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
    });

    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(service.createAttempt).toHaveBeenCalledWith(userId, {
      ...body,
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
      confidenceEnabled: false,
    });
  });

  it("rejects conflicting new and legacy create attempt modes", async () => {
    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId,
        testMode: "exam",
        testVariant: "exam_simulation",
        feedbackMode: "practice",
        selectionMode: "weighted_random",
      }),
    });

    expect(response.status).toBe(400);
    expect(service.createAttempt).not.toHaveBeenCalled();
  });

  it("delegates new-only create attempt payloads after deriving legacy fields", async () => {
    const body = {
      certificationId,
      testMode: "exam",
      testVariant: "exam_simulation",
    };
    service.createAttempt.mockResolvedValueOnce({
      ...emptyAttemptResponse,
      feedbackMode: "exam",
      testMode: "exam",
      testVariant: "exam_simulation",
    });

    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    expect(service.createAttempt).toHaveBeenCalledWith(userId, {
      ...body,
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      confidenceEnabled: false,
    });
  });

  it("delegates valid create attempt bodies with the authenticated user id", async () => {
    const body = {
      certificationId,
      testMode: "practice",
      testVariant: "quick_drill",
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      confidenceEnabled: false,
      questionCount: 10,
    };
    service.createAttempt.mockResolvedValueOnce(emptyAttemptResponse);

    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: emptyAttemptResponse,
    });
    expect(service.createAttempt).toHaveBeenCalledWith(userId, body);
  });

  it("delegates resume attempt requests with the authenticated user id and attempt id", async () => {
    const resumeResponse = {
      ...emptyAttemptResponse,
      recordedAnswers: [{ questionId, selectedOptionId }],
    };
    service.getAttemptForResume.mockResolvedValueOnce(resumeResponse);

    const response = await createApp().request(`/api/certdrill/exams/${attemptId}`);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: resumeResponse,
    });
    expect(service.getAttemptForResume).toHaveBeenCalledWith(userId, attemptId);
  });

  it("rejects invalid answer payloads", async () => {
    const response = await createApp().request(`/api/certdrill/exams/${attemptId}/answers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid answer payload",
        details: expect.arrayContaining([
          expect.objectContaining({ path: "selectedOptionId", message: "Selected option ID is required." }),
        ]),
      },
    });
    expect(service.answerQuestion).not.toHaveBeenCalled();
  });

  it("delegates valid answer bodies with the authenticated user id and attempt id", async () => {
    const body = { questionId, selectedOptionId };
    service.answerQuestion.mockResolvedValueOnce({ isCorrect: true });

    const response = await createApp().request(`/api/certdrill/exams/${attemptId}/answers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { isCorrect: true } });
    expect(service.answerQuestion).toHaveBeenCalledWith(userId, attemptId, body);
  });

  it("delegates question feedback with authenticated user id and path question id", async () => {
    const body = {
      questionId,
      attemptId,
      rating: 2,
      disputeCorrectAnswer: true,
      message: "The correct answer seems wrong.",
    };
    service.createQuestionFeedback.mockResolvedValueOnce({ id: "abababab-abab-4aba-8aba-abababababab" });

    const response = await createApp().request(`/api/certdrill/questions/${questionId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: { id: "abababab-abab-4aba-8aba-abababababab" } });
    expect(service.createQuestionFeedback).toHaveBeenCalledWith(userId, {
      questionId,
      attemptId,
      rating: 2,
      disputeCorrectAnswer: true,
      message: "The correct answer seems wrong.",
    });
  });

  it("rejects feedback when the body question id conflicts with the path", async () => {
    const response = await createApp().request(`/api/certdrill/questions/${questionId}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ questionId: certificationId, rating: 6 }),
    });

    expect(response.status).toBe(400);
    expect(service.createQuestionFeedback).not.toHaveBeenCalled();
  });

  it("returns CertDrill service codes in the shared error envelope", async () => {
    service.submitAttempt.mockRejectedValueOnce(new CertDrillServiceError(
      "CERTDRILL_ATTEMPT_INCOMPLETE",
      "All questions must be answered before submitting",
    ));

    const response = await createApp().request(`/api/certdrill/exams/${attemptId}/submit`, {
      method: "POST",
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_ATTEMPT_INCOMPLETE",
        message: "All questions must be answered before submitting",
      },
    });
  });

  it("returns adaptive empty-state service codes in the shared error envelope", async () => {
    service.createAttempt.mockRejectedValueOnce(new CertDrillServiceError(
      "CERTDRILL_NO_MISSED_QUESTIONS",
      "No missed questions are available yet. Answer questions incorrectly first, then try this review.",
    ));

    const response = await createApp().request("/api/certdrill/exams", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId,
        testMode: "practice",
        testVariant: "missed_review",
      }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: "CERTDRILL_NO_MISSED_QUESTIONS",
        message: "No missed questions are available yet. Answer questions incorrectly first, then try this review.",
      },
    });
  });
});
