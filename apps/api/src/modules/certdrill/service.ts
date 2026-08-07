import { and, count, desc, eq, gt, isNull, lte, or } from "drizzle-orm";

import type {
  AnswerCertDrillQuestionRequest,
  AnswerCertDrillQuestionResponse,
  CertDrillAttemptHistoryItem,
  CertDrillAttemptSnapshot,
  CertDrillCategory,
  CertDrillCertificationListItem,
  CertDrillFeedbackMode,
  CertDrillQuestionSnapshot,
  CertDrillReadinessSummary,
  CertDrillResumeExamAttemptResponse,
  CertDrillSelectionMode,
  CertDrillTestMode,
  CertDrillTestVariant,
  CreateCertDrillExamAttemptParsed,
  CreateCertDrillExamAttemptResponse,
  CreateCertDrillQuestionFeedbackRequest,
  SubmitCertDrillExamAttemptResponse,
} from "@platform/contracts";
import { certdrillAttemptSnapshotSchema } from "@platform/contracts";
import {
  certdrillCertifications,
  certdrillExamForms,
  certdrillExamAttemptAnswers,
  certdrillExamAttempts,
  certdrillExamCategories,
  certdrillQuestionFeedback,
  certdrillQuestions,
  certdrillReviewQueue,
} from "@platform/platform-db";

import type { CertificationAccessProvider } from "./access";
import { selectQuestionIdsForVariant } from "./selection";
import {
  buildAttemptSnapshot,
  buildCategoryBreakdown,
  buildPracticeFeedback,
  buildReview,
  scoreAttempt,
  toExamQuestionPayload,
} from "./snapshot";

type CertDrillServiceDeps = {
  db: any;
  accessProvider: CertificationAccessProvider;
  rng?: () => number;
};

type AttemptAnswer = { questionId: string; selectedOptionId: string; isCorrect: boolean };
type AttemptAnswerWithConfidence = AttemptAnswer & { confidence?: "guessed" | "somewhat_sure" | "confident" | null };
type PracticeFeedback = Exclude<AnswerCertDrillQuestionResponse, { received: true }>;
type ReviewQueueReason = "incorrect" | "low_confidence" | "incorrect_low_confidence";
type QuestionFeedbackRow = {
  id: string;
  userId: string;
  questionId: string;
  examAttemptId: string | null;
  rating: number;
  disputeCorrectAnswer: boolean;
  message: string | null;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export type CertDrillServiceErrorCode =
  | "CERTDRILL_ATTEMPT_NOT_FOUND"
  | "CERTDRILL_ATTEMPT_NOT_IN_PROGRESS"
  | "CERTDRILL_ATTEMPT_EXPIRED"
  | "CERTDRILL_ATTEMPT_NOT_COMPLETED"
  | "CERTDRILL_ATTEMPT_INCOMPLETE"
  | "CERTDRILL_CERTIFICATION_NOT_FOUND"
  | "CERTDRILL_QUESTION_NOT_FOUND"
  | "CERTDRILL_NO_MISSED_QUESTIONS"
  | "CERTDRILL_NO_WEAK_AREAS"
  | "CERTDRILL_QUESTION_NOT_IN_ATTEMPT"
  | "CERTDRILL_OPTION_NOT_IN_QUESTION";

export class CertDrillServiceError extends Error {
  constructor(public readonly code: CertDrillServiceErrorCode, message: string) {
    super(message);
    this.name = "CertDrillServiceError";
  }
}

type QuestionRow = {
  id: string;
  stem: string;
  mediaAssets: CertDrillQuestionSnapshot["mediaAssets"] | null;
  difficulty: CertDrillQuestionSnapshot["difficulty"];
  categoryId: string;
  category: { id: string; code: string; name: string };
  options: Array<{
    id: string;
    text: string;
    mediaAssets: CertDrillQuestionSnapshot["options"][number]["mediaAssets"] | null;
    isCorrect: boolean;
    explanation: string;
    citationUrls: string[] | null;
    sortOrder: number;
  }>;
};

export function createCertDrillService(deps: CertDrillServiceDeps) {
  async function listCertifications(userId: string) {
    const now = new Date();
    const rows = await deps.db
      .select({
        id: certdrillCertifications.id,
        code: certdrillCertifications.code,
        name: certdrillCertifications.name,
        vendor: certdrillCertifications.vendor,
        logoUrl: certdrillCertifications.logoUrl,
        description: certdrillCertifications.description,
        enabledAt: certdrillCertifications.enabledAt,
        archivedAt: certdrillCertifications.archivedAt,
        questionCountDefault: certdrillCertifications.questionCountDefault,
        quickDrillQuestionCount: certdrillCertifications.quickDrillQuestionCount,
        categoryDrillQuestionCount: certdrillCertifications.categoryDrillQuestionCount,
        examSimulationQuestionCount: certdrillCertifications.examSimulationQuestionCount,
        examSimulationDurationMinutes: certdrillCertifications.examSimulationDurationMinutes,
        passThresholdPct: certdrillCertifications.passThresholdPct,
        publishedQuestionCount: count(certdrillQuestions.id),
      })
      .from(certdrillCertifications)
      .leftJoin(
        certdrillQuestions,
        and(
          eq(certdrillQuestions.certificationId, certdrillCertifications.id),
          eq(certdrillQuestions.status, "published"),
        ),
      )
      .where(and(
        userVisibleCertificationWhere(now),
      ))
      .groupBy(
        certdrillCertifications.id,
        certdrillCertifications.code,
        certdrillCertifications.name,
        certdrillCertifications.vendor,
        certdrillCertifications.logoUrl,
        certdrillCertifications.description,
        certdrillCertifications.enabledAt,
        certdrillCertifications.archivedAt,
        certdrillCertifications.questionCountDefault,
        certdrillCertifications.quickDrillQuestionCount,
        certdrillCertifications.categoryDrillQuestionCount,
        certdrillCertifications.examSimulationQuestionCount,
        certdrillCertifications.examSimulationDurationMinutes,
        certdrillCertifications.passThresholdPct,
      );

    const activeForms = typeof deps.db.query?.certdrillExamForms?.findMany === "function"
      ? await deps.db.query.certdrillExamForms.findMany({ where: eq(certdrillExamForms.isActive, true) })
      : [];
    const formsByCertification = groupExamFormsByCertification(activeForms);
    const access = await deps.accessProvider.getAccessForUser(userId, rows.map((row: { id: string }) => row.id));

    return rows.map((row: Record<string, unknown> & { id: string }) => ({
      id: row.id,
      code: String(row.code),
      name: String(row.name),
      vendor: String(row.vendor),
      logoUrl: row.logoUrl === null ? null : row.logoUrl ? String(row.logoUrl) : null,
      description: row.description === null ? null : String(row.description),
      enabledAt: row.enabledAt instanceof Date ? row.enabledAt.toISOString() : row.enabledAt ? String(row.enabledAt) : null,
      archivedAt: row.archivedAt instanceof Date ? row.archivedAt.toISOString() : row.archivedAt ? String(row.archivedAt) : null,
      questionCountDefault: Number(row.questionCountDefault),
      quickDrillQuestionCount: Number(row.quickDrillQuestionCount),
      categoryDrillQuestionCount: Number(row.categoryDrillQuestionCount),
      examSimulationQuestionCount: row.examSimulationQuestionCount === null ? null : Number(row.examSimulationQuestionCount),
      examSimulationDurationMinutes: Number(row.examSimulationDurationMinutes),
      examForms: (formsByCertification.get(row.id) ?? []).slice(0, 3).map(toExamFormListItem),
      passThresholdPct: Number(row.passThresholdPct),
      publishedQuestionCount: Number(row.publishedQuestionCount ?? 0),
      accessStatus: access.get(row.id) ?? "not_purchased",
    }));
  }

  async function listMyCertifications(userId: string) {
    const certifications = await listCertifications(userId);
    return certifications.filter((certification: CertDrillCertificationListItem) => certification.accessStatus === "purchased");
  }

  async function listCategories(certificationId: string): Promise<CertDrillCategory[]> {
    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: and(eq(certdrillCertifications.id, certificationId), userVisibleCertificationWhere()),
    });
    if (!certification) throw new CertDrillServiceError("CERTDRILL_CERTIFICATION_NOT_FOUND", "Certification not found");

    const [categoryRows, countRows] = await Promise.all([
      deps.db
        .select({
          id: certdrillExamCategories.id,
          parentCategoryId: certdrillExamCategories.parentCategoryId,
          code: certdrillExamCategories.code,
          name: certdrillExamCategories.name,
          weightPct: certdrillExamCategories.weightPct,
          sortOrder: certdrillExamCategories.sortOrder,
        })
        .from(certdrillExamCategories)
        .where(eq(certdrillExamCategories.certificationId, certificationId)),
      deps.db
        .select({
          categoryId: certdrillQuestions.categoryId,
          publishedQuestionCount: count(certdrillQuestions.id),
        })
        .from(certdrillQuestions)
        .where(and(eq(certdrillQuestions.certificationId, certificationId), eq(certdrillQuestions.status, "published")))
        .groupBy(certdrillQuestions.categoryId),
    ]);

    const questionCountByCategory = new Map<string, number>(
      countRows.map((row: { categoryId: string; publishedQuestionCount: unknown }) => [
        row.categoryId,
        Number(row.publishedQuestionCount ?? 0),
      ]),
    );
    const byParent = new Map<string | null, CertDrillCategory[]>();

    for (const row of categoryRows) {
      const category: CertDrillCategory = {
        id: row.id,
        parentCategoryId: row.parentCategoryId ?? null,
        code: row.code,
        name: row.name,
        weightPct: row.weightPct ?? null,
        sortOrder: row.sortOrder,
        publishedQuestionCount: questionCountByCategory.get(row.id) ?? 0,
        children: [],
      };
      const parentId = category.parentCategoryId;
      byParent.set(parentId, [...(byParent.get(parentId) ?? []), category]);
    }

    function build(parentId: string | null): CertDrillCategory[] {
      return (byParent.get(parentId) ?? [])
        .sort((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code))
        .map((category) => ({ ...category, children: build(category.id) }));
    }

    return build(null);
  }

  async function createAttempt(userId: string, input: CreateCertDrillExamAttemptParsed): Promise<CreateCertDrillExamAttemptResponse> {
    await deps.accessProvider.assertCanStartAttempt(userId, input.certificationId);

    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: and(eq(certdrillCertifications.id, input.certificationId), userVisibleCertificationWhere()),
    });
    if (!certification) throw new CertDrillServiceError("CERTDRILL_CERTIFICATION_NOT_FOUND", "Certification not found");

    const testVariant = input.testVariant ?? deriveTestVariantFromLegacy(input.feedbackMode, input.selectionMode, input.examFormId);
    const testMode = feedbackModeForTestVariant(testVariant);
    const feedbackMode = feedbackModeForTestVariant(testVariant);
    const selectionMode = selectionModeForTestVariant(testVariant);

    const [categories, questions, examForm, missedQuestionIds, weakCategoryIds] = await Promise.all([
      deps.db.query.certdrillExamCategories.findMany({
        where: eq(certdrillExamCategories.certificationId, input.certificationId),
      }),
      deps.db.query.certdrillQuestions.findMany({
        where: and(eq(certdrillQuestions.certificationId, input.certificationId), eq(certdrillQuestions.status, "published")),
        with: {
          category: true,
          options: true,
        },
      }),
      loadExamForm(input.certificationId, testVariant === "exam_form" ? input.examFormId : undefined),
      testVariant === "missed_review" ? loadMissedQuestionIds(userId, input.certificationId) : Promise.resolve<string[]>([]),
      testVariant === "weak_areas" ? loadWeakCategoryIds(userId, input.certificationId) : Promise.resolve<string[]>([]),
    ]);

    const selection = selectQuestionIdsForVariant({
      testVariant,
      selectedCategoryIds: input.categoryIds,
      examFormQuestionIds: examForm?.questionIds,
      missedQuestionIds,
      weakCategoryIds,
      categories,
      questions,
      quickDrillCount: input.questionCount ?? certification.quickDrillQuestionCount ?? certification.questionCountDefault,
      categoryDrillCount: input.questionCount ?? certification.categoryDrillQuestionCount ?? certification.questionCountDefault,
      examSimulationCount: input.questionCount ?? certification.examSimulationQuestionCount ?? certification.questionCountDefault,
      rng: deps.rng,
    });

    if (selection.questionIds.length === 0) {
      if (testVariant === "missed_review") {
        throw new CertDrillServiceError("CERTDRILL_NO_MISSED_QUESTIONS", "No missed questions are available yet. Answer questions incorrectly first, then try this review.");
      }

      if (testVariant === "weak_areas") {
        throw new CertDrillServiceError("CERTDRILL_NO_WEAK_AREAS", "No weak areas are available yet. Complete at least one attempt with answered questions first.");
      }

      throw new Error("No published questions available for this attempt");
    }

    const questionById = new Map<string, QuestionRow>(questions.map((question: QuestionRow) => [question.id, question]));
    const selectedQuestions = selection.questionIds.map((questionId) => {
      const question = questionById.get(questionId);
      if (!question) throw new Error("Selected question was not loaded");
      return question;
    });
    const snapshot = buildAttemptSnapshot(selectedQuestions.map(toQuestionSnapshot), { rng: deps.rng });
    const expiresAt = getAttemptExpiry(testVariant, certification, examForm);

    const [attempt] = await deps.db
      .insert(certdrillExamAttempts)
      .values({
        userId,
        certificationId: input.certificationId,
        feedbackMode,
        selectionMode,
        testMode,
        testVariant,
        examFormId: examForm?.id ?? null,
        confidenceEnabled: input.confidenceEnabled ?? false,
        categoryIds: input.categoryIds ?? null,
        questionIds: selection.questionIds,
        snapshotVersion: snapshot.version,
        questionSnapshotJson: snapshot,
        expiresAt,
      })
      .returning({ id: certdrillExamAttempts.id });

    return {
      attemptId: attempt.id,
      feedbackMode,
      selectionMode,
      testMode,
      testVariant,
      ...(examForm ? { examFormName: String(examForm.name) } : {}),
      confidenceEnabled: input.confidenceEnabled ?? false,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      questions: toExamQuestionPayload(snapshot),
      ...(selection.warnings.length > 0 ? { warnings: selection.warnings } : {}),
    };
  }

  async function answerQuestion(
    userId: string,
    attemptId: string,
    input: AnswerCertDrillQuestionRequest,
  ): Promise<AnswerCertDrillQuestionResponse> {
    const attempt = await loadOwnedAttempt(userId, attemptId);
    if (attempt.status !== "in_progress") throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");
    if (isExpiredInProgress(attempt)) throw new CertDrillServiceError("CERTDRILL_ATTEMPT_EXPIRED", "Attempt has expired");

    const snapshot = parseSnapshot(attempt.questionSnapshotJson);
    const feedback = withSnapshotErrorWrapping(() => buildPracticeFeedback(snapshot, input.questionId, input.selectedOptionId) as PracticeFeedback);
    const confidenceUpdate = attempt.confidenceEnabled && input.confidence !== undefined ? { confidence: input.confidence } : {};
    const writeAnswer = async (db: any) => {
      await assertAttemptStillInProgress(db, userId, attemptId);
      await db
        .insert(certdrillExamAttemptAnswers)
        .values({
          examAttemptId: attemptId,
          questionId: input.questionId,
          selectedOptionId: input.selectedOptionId,
          isCorrect: feedback.isCorrect,
          confidence: attempt.confidenceEnabled ? input.confidence ?? null : null,
        })
        .onConflictDoUpdate({
          target: [certdrillExamAttemptAnswers.examAttemptId, certdrillExamAttemptAnswers.questionId],
          set: {
            selectedOptionId: input.selectedOptionId,
            isCorrect: feedback.isCorrect,
            ...confidenceUpdate,
            answeredAt: new Date(),
            updatedAt: new Date(),
          },
        });
    };

    if (typeof deps.db.transaction === "function") {
      await deps.db.transaction(writeAnswer);
    } else {
      await writeAnswer(deps.db);
    }

    return attempt.feedbackMode === "practice" ? feedback : { received: true };
  }

  async function getAttemptForResume(userId: string, attemptId: string): Promise<CertDrillResumeExamAttemptResponse> {
    const attempt = await loadOwnedAttempt(userId, attemptId);
    if (attempt.status !== "in_progress") throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");

    const answers = await loadAttemptAnswers(deps.db, attemptId);
    return {
      attemptId,
      feedbackMode: attempt.feedbackMode as CertDrillFeedbackMode,
      selectionMode: attempt.selectionMode as CertDrillSelectionMode,
      ...attemptMetadata(attempt),
      questions: toExamQuestionPayload(parseSnapshot(attempt.questionSnapshotJson)),
      recordedAnswers: answers.map((answer) => ({
        questionId: answer.questionId,
        selectedOptionId: answer.selectedOptionId,
        ...(answer.confidence !== undefined && answer.confidence !== null ? { confidence: answer.confidence } : {}),
      })),
    };
  }

  async function submitAttempt(userId: string, attemptId: string): Promise<SubmitCertDrillExamAttemptResponse> {
    const attempt = await loadOwnedAttempt(userId, attemptId);
    if (attempt.status !== "in_progress") throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");

    if (typeof deps.db.transaction === "function") {
      return deps.db.transaction((tx: any) => submitAttemptInTransaction(tx, userId, attemptId));
    }

    return submitAttemptWithoutTransaction(userId, attemptId, attempt);
  }

  async function submitAttemptInTransaction(db: any, userId: string, attemptId: string): Promise<SubmitCertDrillExamAttemptResponse> {
    const [claimed] = await db
      .update(certdrillExamAttempts)
      .set({
        status: "completed",
        completedAt: null,
        scorePct: null,
        updatedAt: new Date(),
      })
      .where(and(
        eq(certdrillExamAttempts.id, attemptId),
        eq(certdrillExamAttempts.userId, userId),
        eq(certdrillExamAttempts.status, "in_progress"),
      ))
      .returning({
        id: certdrillExamAttempts.id,
        certificationId: certdrillExamAttempts.certificationId,
        questionSnapshotJson: certdrillExamAttempts.questionSnapshotJson,
        status: certdrillExamAttempts.status,
        expiresAt: certdrillExamAttempts.expiresAt,
      });

    if (!claimed) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");
    }

    const answers = await loadAttemptAnswers(db, attemptId);
    const snapshot = parseSnapshot(claimed.questionSnapshotJson);

    if (answers.length !== snapshot.questions.length && !isPastExpiresAt(claimed.expiresAt)) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_INCOMPLETE", "All questions must be answered before submitting");
    }

    const certification = await db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, claimed.certificationId),
    });
    if (!certification) throw new Error("Certification not found");

    const result = buildSubmitResult(snapshot, answers, Number(certification.passThresholdPct));

    const [completed] = await db
      .update(certdrillExamAttempts)
      .set({
        status: "completed",
        completedAt: new Date(),
        scorePct: result.scorePct.toFixed(2),
        updatedAt: new Date(),
      })
      .where(and(
        eq(certdrillExamAttempts.id, attemptId),
        eq(certdrillExamAttempts.userId, userId),
        eq(certdrillExamAttempts.status, "completed"),
      ))
      .returning({ id: certdrillExamAttempts.id });

    if (!completed) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");
    }

    await upsertReviewQueueRows(db, userId, claimed.certificationId, snapshot, answers);

    return result;
  }

  async function submitAttemptWithoutTransaction(
    userId: string,
    attemptId: string,
    attempt: { certificationId: string; questionSnapshotJson: unknown; expiresAt?: unknown; status?: unknown },
  ): Promise<SubmitCertDrillExamAttemptResponse> {
    const answers = await loadAttemptAnswers(deps.db, attemptId);
    const snapshot = parseSnapshot(attempt.questionSnapshotJson);

    if (answers.length !== snapshot.questions.length && !isExpiredInProgress(attempt)) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_INCOMPLETE", "All questions must be answered before submitting");
    }

    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, attempt.certificationId),
    });
    if (!certification) throw new Error("Certification not found");

    const result = buildSubmitResult(snapshot, answers, Number(certification.passThresholdPct));

    const [completed] = await deps.db
      .update(certdrillExamAttempts)
      .set({
        status: "completed",
        completedAt: new Date(),
        scorePct: result.scorePct.toFixed(2),
        updatedAt: new Date(),
      })
      .where(and(
        eq(certdrillExamAttempts.id, attemptId),
        eq(certdrillExamAttempts.userId, userId),
        eq(certdrillExamAttempts.status, "in_progress"),
      ))
      .returning({ id: certdrillExamAttempts.id });

    if (!completed) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");
    }

    await upsertReviewQueueRows(deps.db, userId, attempt.certificationId, snapshot, answers);

    return result;
  }

  async function reviewAttempt(userId: string, attemptId: string) {
    const attempt = await loadOwnedAttempt(userId, attemptId);
    if (attempt.status !== "completed") throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_COMPLETED", "Attempt is not completed");

    const answers = await loadAttemptAnswers(deps.db, attemptId);
    const review = withSnapshotErrorWrapping(() => buildReview(parseSnapshot(attempt.questionSnapshotJson), answers));
    return {
      ...review,
      questions: withAnswerConfidence(review.questions, answers),
      ...attemptMetadata(attempt),
    };
  }

  async function listAttempts(userId: string): Promise<CertDrillAttemptHistoryItem[]> {
    const rows = await deps.db
      .select({
        id: certdrillExamAttempts.id,
        certificationId: certdrillCertifications.id,
        certificationCode: certdrillCertifications.code,
        certificationName: certdrillCertifications.name,
        feedbackMode: certdrillExamAttempts.feedbackMode,
        selectionMode: certdrillExamAttempts.selectionMode,
        testMode: certdrillExamAttempts.testMode,
        testVariant: certdrillExamAttempts.testVariant,
        examFormName: certdrillExamForms.name,
        startedAt: certdrillExamAttempts.startedAt,
        completedAt: certdrillExamAttempts.completedAt,
        expiresAt: certdrillExamAttempts.expiresAt,
        scorePct: certdrillExamAttempts.scorePct,
        status: certdrillExamAttempts.status,
      })
      .from(certdrillExamAttempts)
      .innerJoin(certdrillCertifications, eq(certdrillExamAttempts.certificationId, certdrillCertifications.id))
      .leftJoin(certdrillExamForms, eq(certdrillExamAttempts.examFormId, certdrillExamForms.id))
      .where(eq(certdrillExamAttempts.userId, userId))
      .orderBy(desc(certdrillExamAttempts.startedAt));

    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      certification: {
        id: String(row.certificationId),
        code: String(row.certificationCode),
        name: String(row.certificationName),
      },
      feedbackMode: row.feedbackMode as CertDrillAttemptHistoryItem["feedbackMode"],
      selectionMode: row.selectionMode as CertDrillAttemptHistoryItem["selectionMode"],
      testMode: row.testMode as CertDrillAttemptHistoryItem["testMode"],
      testVariant: row.testVariant as CertDrillAttemptHistoryItem["testVariant"],
      ...(row.examFormName ? { examFormName: String(row.examFormName) } : {}),
      startedAt: toIsoString(row.startedAt),
      completedAt: row.completedAt === null ? null : toIsoString(row.completedAt),
      expiresAt: row.expiresAt === null ? null : toIsoString(row.expiresAt),
      scorePct: row.scorePct === null ? null : Number(row.scorePct),
      status: row.status as CertDrillAttemptHistoryItem["status"],
    }));
  }

  async function getReadinessSummary(userId: string): Promise<CertDrillReadinessSummary> {
    if (typeof deps.db.query?.certdrillExamAttempts?.findMany !== "function" || typeof deps.db.query?.certdrillExamAttemptAnswers?.findMany !== "function") {
      return emptyReadinessSummary();
    }

    const attempts = await deps.db.query.certdrillExamAttempts.findMany({
      where: and(eq(certdrillExamAttempts.userId, userId), eq(certdrillExamAttempts.status, "completed")),
      orderBy: desc(certdrillExamAttempts.completedAt),
    });
    const completedAttempts = attempts.filter((attempt: Record<string, unknown>) => attempt.status === "completed");
    const missedQuestionIds = new Set<string>();
    const categoryStats = new Map<string, { correct: number; total: number }>();
    let scoreTotal = 0;
    let scoredAttempts = 0;

    for (const attempt of completedAttempts) {
      if (attempt.scorePct !== null && attempt.scorePct !== undefined) {
        scoreTotal += Number(attempt.scorePct);
        scoredAttempts += 1;
      }

      const snapshot = parseSnapshot(attempt.questionSnapshotJson);
      const questionById = new Map(snapshot.questions.map((question) => [question.id, question]));
      const answers = await loadAttemptAnswers(deps.db, String(attempt.id));

      for (const answer of answers) {
        const question = questionById.get(answer.questionId);
        if (!question) {
          continue;
        }
        const isCorrect = isSnapshotCorrect(snapshot, answer);
        if (isCorrect === null) {
          continue;
        }

        if (!isCorrect) {
          missedQuestionIds.add(answer.questionId);
        }

        const stats = categoryStats.get(question.category.id) ?? { correct: 0, total: 0 };
        stats.total += 1;
        if (isCorrect) {
          stats.correct += 1;
        }
        categoryStats.set(question.category.id, stats);
      }
    }

    return {
      completedAttempts: completedAttempts.length,
      averageScorePct: scoredAttempts === 0 ? 0 : Number((scoreTotal / scoredAttempts).toFixed(2)),
      missedQuestionCount: missedQuestionIds.size,
      weakCategoryCount: [...categoryStats.values()].filter((stats) => stats.total > 0 && stats.correct / stats.total < 0.7).length,
    };
  }

  async function listDueReviewQueue(userId: string) {
    const rows = await deps.db
      .select({
        id: certdrillReviewQueue.id,
        certificationId: certdrillCertifications.id,
        certificationCode: certdrillCertifications.code,
        certificationName: certdrillCertifications.name,
        questionId: certdrillQuestions.id,
        stem: certdrillQuestions.stem,
        dueAt: certdrillReviewQueue.dueAt,
        reason: certdrillReviewQueue.reason,
        intervalDays: certdrillReviewQueue.intervalDays,
        ease: certdrillReviewQueue.ease,
        status: certdrillReviewQueue.status,
        createdAt: certdrillReviewQueue.createdAt,
        updatedAt: certdrillReviewQueue.updatedAt,
      })
      .from(certdrillReviewQueue)
      .innerJoin(certdrillCertifications, eq(certdrillReviewQueue.certificationId, certdrillCertifications.id))
      .innerJoin(certdrillQuestions, eq(certdrillReviewQueue.questionId, certdrillQuestions.id))
      .where(and(
        eq(certdrillReviewQueue.userId, userId),
        eq(certdrillReviewQueue.status, "active"),
        lte(certdrillReviewQueue.dueAt, new Date()),
      ))
      .orderBy(certdrillReviewQueue.dueAt);

    return rows.map((row: Record<string, unknown>) => ({
      id: String(row.id),
      certification: {
        id: String(row.certificationId),
        code: String(row.certificationCode),
        name: String(row.certificationName),
      },
      question: {
        id: String(row.questionId),
        stem: String(row.stem),
      },
      dueAt: toIsoString(row.dueAt),
      reason: row.reason as ReviewQueueReason,
      intervalDays: Number(row.intervalDays),
      ease: Number(row.ease),
      status: String(row.status),
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
    }));
  }

  async function createQuestionFeedback(userId: string, input: CreateCertDrillQuestionFeedbackRequest) {
    await assertCanCreateQuestionFeedback(userId, input);

    const [row] = await deps.db
      .insert(certdrillQuestionFeedback)
      .values({
        userId,
        questionId: input.questionId,
        examAttemptId: input.attemptId ?? null,
        rating: input.rating,
        disputeCorrectAnswer: input.disputeCorrectAnswer ?? false,
        message: input.message ?? null,
      })
      .returning();

    return toQuestionFeedback(row);
  }

  async function assertCanCreateQuestionFeedback(userId: string, input: CreateCertDrillQuestionFeedbackRequest) {
    if (input.attemptId) {
      const attempt = await loadOwnedAttempt(userId, input.attemptId);
      const attemptQuestionIds = Array.isArray(attempt.questionIds) ? attempt.questionIds : [];
      const snapshotQuestionIds = parseSnapshot(attempt.questionSnapshotJson).questions.map((question) => question.id);
      if (!attemptQuestionIds.includes(input.questionId) && !snapshotQuestionIds.includes(input.questionId)) {
        throw new CertDrillServiceError("CERTDRILL_QUESTION_NOT_IN_ATTEMPT", "Question is not part of this attempt");
      }

      return;
    }

    const question = await deps.db.query.certdrillQuestions.findFirst({
      where: eq(certdrillQuestions.id, input.questionId),
    });
    if (!question) {
      throw new CertDrillServiceError("CERTDRILL_QUESTION_NOT_FOUND", "Question not found");
    }

    await deps.accessProvider.assertCanStartAttempt(userId, question.certificationId);
  }

  async function listQuestionFeedbackForAdmin() {
    const rows = await deps.db.query.certdrillQuestionFeedback.findMany({
      orderBy: [desc(certdrillQuestionFeedback.createdAt)],
    });
    return rows.map(toQuestionFeedback);
  }

  async function loadOwnedAttempt(userId: string, attemptId: string) {
    const attempt = await deps.db.query.certdrillExamAttempts.findFirst({
      where: and(eq(certdrillExamAttempts.id, attemptId), eq(certdrillExamAttempts.userId, userId)),
      with: { examForm: true },
    });
    if (!attempt) throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_FOUND", "Attempt not found");

    return attempt;
  }

  async function assertAttemptStillInProgress(db: any, userId: string, attemptId: string) {
    const [updated] = await db
      .update(certdrillExamAttempts)
      .set({ updatedAt: new Date() })
      .where(and(
        eq(certdrillExamAttempts.id, attemptId),
        eq(certdrillExamAttempts.userId, userId),
        eq(certdrillExamAttempts.status, "in_progress"),
        or(isNull(certdrillExamAttempts.expiresAt), gt(certdrillExamAttempts.expiresAt, new Date())),
      ))
      .returning({ id: certdrillExamAttempts.id });

    if (!updated) {
      throw new CertDrillServiceError("CERTDRILL_ATTEMPT_NOT_IN_PROGRESS", "Attempt is not in progress");
    }
  }

  async function loadAttemptAnswers(db: any, attemptId: string): Promise<AttemptAnswerWithConfidence[]> {
    return db.query.certdrillExamAttemptAnswers.findMany({
      where: eq(certdrillExamAttemptAnswers.examAttemptId, attemptId),
    });
  }

  async function loadExamForm(certificationId: string, examFormId: string | undefined) {
    if (!examFormId) {
      return null;
    }

    const forms = await deps.db.query.certdrillExamForms.findMany({
      where: and(
        eq(certdrillExamForms.id, examFormId),
        eq(certdrillExamForms.certificationId, certificationId),
        eq(certdrillExamForms.isActive, true),
      ),
    });

    return forms[0] ?? null;
  }

  async function loadMissedQuestionIds(userId: string, certificationId: string) {
    if (typeof deps.db.query?.certdrillExamAttempts?.findMany !== "function" || typeof deps.db.query?.certdrillExamAttemptAnswers?.findMany !== "function") {
      return [];
    }

    const attempts = await deps.db.query.certdrillExamAttempts.findMany({
      where: and(eq(certdrillExamAttempts.userId, userId), eq(certdrillExamAttempts.certificationId, certificationId)),
      orderBy: desc(certdrillExamAttempts.completedAt),
    });
    const missedQuestionIds: string[] = [];
    const seen = new Set<string>();

    for (const attempt of attempts) {
      const snapshot = parseSnapshot(attempt.questionSnapshotJson);
      const answers = await deps.db.query.certdrillExamAttemptAnswers.findMany({
        where: eq(certdrillExamAttemptAnswers.examAttemptId, attempt.id),
      });
      for (const answer of answers) {
        if (isSnapshotCorrect(snapshot, answer) === false && !seen.has(answer.questionId)) {
          seen.add(answer.questionId);
          missedQuestionIds.push(answer.questionId);
        }
      }
    }

    return missedQuestionIds;
  }

  async function loadWeakCategoryIds(userId: string, certificationId: string) {
    if (typeof deps.db.query?.certdrillExamAttempts?.findMany !== "function" || typeof deps.db.query?.certdrillExamAttemptAnswers?.findMany !== "function") {
      return [];
    }

    const attempts = await deps.db.query.certdrillExamAttempts.findMany({
      where: and(
        eq(certdrillExamAttempts.userId, userId),
        eq(certdrillExamAttempts.certificationId, certificationId),
        eq(certdrillExamAttempts.status, "completed"),
      ),
      orderBy: desc(certdrillExamAttempts.completedAt),
    });
    const categoryStats = new Map<string, { correct: number; total: number }>();

    for (const attempt of attempts) {
      const snapshot = parseSnapshot(attempt.questionSnapshotJson);
      const questionCategory = new Map(snapshot.questions.map((question) => [question.id, question.category.id]));
      const answers = await deps.db.query.certdrillExamAttemptAnswers.findMany({
        where: eq(certdrillExamAttemptAnswers.examAttemptId, attempt.id),
      });

      for (const answer of answers) {
        const categoryId = questionCategory.get(answer.questionId);
        if (!categoryId) {
          continue;
        }
        const isCorrect = isSnapshotCorrect(snapshot, answer);
        if (isCorrect === null) {
          continue;
        }
        const stats = categoryStats.get(categoryId) ?? { correct: 0, total: 0 };
        stats.total += 1;
        if (isCorrect) {
          stats.correct += 1;
        }
        categoryStats.set(categoryId, stats);
      }
    }

    return [...categoryStats.entries()]
      .sort((left, right) => (left[1].correct / left[1].total) - (right[1].correct / right[1].total) || right[1].total - left[1].total || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([categoryId]) => categoryId);
  }

  return {
    listCertifications,
    listMyCertifications,
    listCategories,
    createAttempt,
    getAttemptForResume,
    answerQuestion,
    submitAttempt,
    reviewAttempt,
    listAttempts,
    getReadinessSummary,
    listDueReviewQueue,
    createQuestionFeedback,
    listQuestionFeedbackForAdmin,
  };
}

function userVisibleCertificationWhere(now = new Date()) {
  return and(
    eq(certdrillCertifications.isActive, true),
    isNull(certdrillCertifications.archivedAt),
    or(isNull(certdrillCertifications.enabledAt), lte(certdrillCertifications.enabledAt, now)),
  );
}

function toQuestionFeedback(row: QuestionFeedbackRow) {
  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    examAttemptId: row.examAttemptId ?? null,
    rating: Number(row.rating),
    disputeCorrectAnswer: Boolean(row.disputeCorrectAnswer),
    message: row.message ?? null,
    status: String(row.status),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function emptyReadinessSummary(): CertDrillReadinessSummary {
  return {
    completedAttempts: 0,
    averageScorePct: 0,
    missedQuestionCount: 0,
    weakCategoryCount: 0,
  };
}

function parseSnapshot(value: unknown): CertDrillAttemptSnapshot {
  return certdrillAttemptSnapshotSchema.parse(typeof value === "string" ? JSON.parse(value) : value);
}

function toQuestionSnapshot(question: QuestionRow): CertDrillQuestionSnapshot {
  return {
    id: question.id,
    stem: question.stem,
    mediaAssets: question.mediaAssets ?? [],
    category: {
      id: question.category.id,
      code: question.category.code,
      name: question.category.name,
    },
    difficulty: question.difficulty,
    options: [...question.options]
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map((option) => ({
        id: option.id,
        text: option.text,
        mediaAssets: option.mediaAssets ?? [],
        isCorrect: option.isCorrect,
        explanation: option.explanation,
        citationUrls: option.citationUrls ?? [],
        sortOrder: option.sortOrder,
      })),
  };
}

function isSnapshotCorrect(
  snapshot: CertDrillAttemptSnapshot,
  answer: { questionId: string; selectedOptionId?: string | null },
) {
  const question = snapshot.questions.find((item) => item.id === answer.questionId);
  const selectedOption = question?.options.find((option) => option.id === answer.selectedOptionId);
  return selectedOption?.isCorrect ?? null;
}

async function upsertReviewQueueRows(
  db: any,
  userId: string,
  certificationId: string,
  snapshot: CertDrillAttemptSnapshot,
  answers: AttemptAnswerWithConfidence[],
) {
  const dueAt = new Date();

  for (const answer of answers) {
    const isCorrect = isSnapshotCorrect(snapshot, answer);
    const lowConfidence = answer.confidence === "guessed" || answer.confidence === "somewhat_sure";
    const reason = getReviewQueueReason(isCorrect === false, lowConfidence);
    if (!reason) {
      continue;
    }

    await db
      .insert(certdrillReviewQueue)
      .values({
        userId,
        certificationId,
        questionId: answer.questionId,
        dueAt,
        reason,
        intervalDays: 1,
        ease: "2.50",
        status: "active",
      })
      .onConflictDoUpdate({
        target: [certdrillReviewQueue.userId, certdrillReviewQueue.certificationId, certdrillReviewQueue.questionId],
        set: {
          dueAt,
          reason,
          intervalDays: 1,
          ease: "2.50",
          status: "active",
          updatedAt: new Date(),
        },
      });
  }
}

function getReviewQueueReason(incorrect: boolean, lowConfidence: boolean): ReviewQueueReason | null {
  if (incorrect && lowConfidence) {
    return "incorrect_low_confidence";
  }

  if (incorrect) {
    return "incorrect";
  }

  if (lowConfidence) {
    return "low_confidence";
  }

  return null;
}

function buildSubmitResult(
  snapshot: CertDrillAttemptSnapshot,
  answers: AttemptAnswerWithConfidence[],
  passThresholdPct: number,
): SubmitCertDrillExamAttemptResponse {
  return withSnapshotErrorWrapping(() => {
    const score = scoreAttempt(snapshot, answers);
    const review = buildReview(snapshot, answers);

    return {
      scorePct: score.scorePct,
      passed: score.scorePct >= passThresholdPct,
      categoryBreakdown: buildCategoryBreakdown(snapshot, answers),
      questions: withAnswerConfidence(review.questions, answers),
    };
  });
}

function deriveTestVariantFromLegacy(
  feedbackMode: CertDrillFeedbackMode | undefined,
  selectionMode: CertDrillSelectionMode | undefined,
  examFormId: string | undefined,
): CertDrillTestVariant {
  if (feedbackMode === "exam") {
    return examFormId ? "exam_form" : "exam_simulation";
  }

  if (selectionMode === "category_focus") {
    return "category_drill";
  }

  return "quick_drill";
}

function feedbackModeForTestVariant(testVariant: CertDrillTestVariant): CertDrillFeedbackMode {
  return testVariant === "exam_simulation" || testVariant === "exam_form" ? "exam" : "practice";
}

function selectionModeForTestVariant(testVariant: CertDrillTestVariant): CertDrillSelectionMode {
  return testVariant === "category_drill" ? "category_focus" : "weighted_random";
}

function getAttemptExpiry(testVariant: CertDrillTestVariant, certification: Record<string, unknown>, examForm: Record<string, unknown> | null) {
  if (testVariant === "exam_simulation") {
    return addMinutes(new Date(), Number(certification.examSimulationDurationMinutes ?? 120));
  }

  if (testVariant === "exam_form" && examForm) {
    return addMinutes(new Date(), Number(examForm.durationMinutes ?? 120));
  }

  return null;
}

function addMinutes(date: Date, minutes: number) {
  return new Date(date.getTime() + minutes * 60_000);
}

function isExpiredInProgress(attempt: { status?: unknown; expiresAt?: unknown }) {
  return attempt.status === "in_progress" && isPastExpiresAt(attempt.expiresAt);
}

function isPastExpiresAt(expiresAt: unknown) {
  return expiresAt !== null && expiresAt !== undefined && new Date(String(expiresAt)).getTime() <= Date.now();
}

function groupExamFormsByCertification(forms: Array<Record<string, unknown>>) {
  const grouped = new Map<string, Array<Record<string, unknown>>>();

  for (const form of forms) {
    if (form.isActive !== true) {
      continue;
    }
    const certificationId = String(form.certificationId);
    grouped.set(certificationId, [...(grouped.get(certificationId) ?? []), form]);
  }

  for (const formsForCertification of grouped.values()) {
    formsForCertification.sort((left, right) => Number(left.sortOrder ?? 0) - Number(right.sortOrder ?? 0) || String(left.name).localeCompare(String(right.name)));
  }

  return grouped;
}

function toExamFormListItem(form: Record<string, unknown>) {
  return {
    id: String(form.id),
    name: String(form.name),
    description: form.description === null || form.description === undefined ? null : String(form.description),
    sortOrder: Number(form.sortOrder),
    isActive: Boolean(form.isActive),
    durationMinutes: Number(form.durationMinutes),
    questionCount: Number(form.targetQuestionCount),
  };
}

function withAnswerConfidence<T extends Array<{ id: string; confidence?: unknown }>>(questions: T, answers: AttemptAnswerWithConfidence[]): T {
  const confidenceByQuestion = new Map(answers.map((answer) => [answer.questionId, answer.confidence ?? null]));
  return questions.map((question) => ({
    ...question,
    ...(confidenceByQuestion.has(question.id) ? { confidence: confidenceByQuestion.get(question.id) } : {}),
  })) as T;
}

function attemptMetadata(attempt: Record<string, unknown>) {
  const examForm = attempt.examForm as { name?: unknown } | null | undefined;

  return {
    ...(attempt.testMode ? { testMode: attempt.testMode as CertDrillTestMode } : {}),
    ...(attempt.testVariant ? { testVariant: attempt.testVariant as CertDrillTestVariant } : {}),
    ...(examForm?.name ? { examFormName: String(examForm.name) } : {}),
    ...(typeof attempt.confidenceEnabled === "boolean" ? { confidenceEnabled: attempt.confidenceEnabled } : {}),
    ...("expiresAt" in attempt ? { expiresAt: attempt.expiresAt === null || attempt.expiresAt === undefined ? null : toIsoString(attempt.expiresAt) } : {}),
  };
}

function withSnapshotErrorWrapping<T>(callback: () => T): T {
  try {
    return callback();
  } catch (error) {
    if (error instanceof CertDrillServiceError) {
      throw error;
    }

    if (error instanceof Error) {
      if (error.message === "Question is not part of this attempt") {
        throw new CertDrillServiceError("CERTDRILL_QUESTION_NOT_IN_ATTEMPT", error.message);
      }

      if (error.message === "Selected option is not part of this question") {
        throw new CertDrillServiceError("CERTDRILL_OPTION_NOT_IN_QUESTION", error.message);
      }
    }

    throw error;
  }
}

function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}
