import type {
  AnswerCertDrillQuestionResponse,
  CertDrillAttemptSnapshot,
  CertDrillMediaAsset,
  CertDrillQuestionSnapshot,
  CertDrillReviewExamAttemptResponse,
  CreateCertDrillExamAttemptResponse,
  SubmitCertDrillExamAttemptResponse,
} from "@platform/contracts";

type AttemptAnswer = { questionId: string; selectedOptionId: string; isCorrect: boolean };
type OptionFeedback = Exclude<AnswerCertDrillQuestionResponse, { received: true }>["correctOption"];
type ExamQuestionPayload = CreateCertDrillExamAttemptResponse["questions"];
type CategoryBreakdown = SubmitCertDrillExamAttemptResponse["categoryBreakdown"];
type SnapshotOption = CertDrillQuestionSnapshot["options"][number];
type SnapshotAnswer = AttemptAnswer & { selectedOption: SnapshotOption; isCorrect: boolean };
type BuildAttemptSnapshotOptions = { rng?: () => number; shuffleOptions?: boolean };
type LooseMediaAsset = Partial<CertDrillMediaAsset> & { url: string; mime_type?: string };

export function buildAttemptSnapshot(questions: CertDrillQuestionSnapshot[], options: BuildAttemptSnapshotOptions = {}): CertDrillAttemptSnapshot {
  const shouldShuffleOptions = options.shuffleOptions !== false;
  const rng = options.rng ?? Math.random;
  const snapshotQuestions = clone(questions).map((question) => ({
    ...question,
    mediaAssets: normalizeMediaAssets(question.mediaAssets, "Question image"),
    options: shouldShuffleOptions ? fisherYates(question.options, rng) : question.options,
  })).map((question) => ({
    ...question,
    options: question.options.map((option) => ({
      ...option,
      mediaAssets: normalizeMediaAssets(option.mediaAssets, "Answer option image"),
    })),
  }));

  return { version: 1, questions: snapshotQuestions };
}

export function toExamQuestionPayload(snapshot: CertDrillAttemptSnapshot): ExamQuestionPayload {
  return snapshot.questions.map((question) => ({
    id: question.id,
    stem: question.stem,
    mediaAssets: clone(question.mediaAssets),
    category: { ...question.category },
    options: question.options.map((option) => ({
      id: option.id,
      text: option.text,
      mediaAssets: clone(option.mediaAssets),
    })),
  }));
}

export function buildPracticeFeedback(snapshot: CertDrillAttemptSnapshot, questionId: string, selectedOptionId: string): AnswerCertDrillQuestionResponse {
  const question = findQuestion(snapshot, questionId);
  const selectedOption = question.options.find((option) => option.id === selectedOptionId);
  if (!selectedOption) throw new Error("Selected option is not part of this question");

  const correctOption = findCorrectOption(question);

  return {
    isCorrect: selectedOption.isCorrect,
    selectedOptionFeedback: toOptionFeedback(selectedOption),
    correctOption: toOptionFeedback(correctOption),
  };
}

export function scoreAttempt(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]) {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const total = snapshot.questions.length;
  const correct = snapshot.questions.filter((question) => answerByQuestion.get(question.id)?.selectedOption.isCorrect === true).length;
  const scorePct = total === 0 ? 0 : Number(((correct / total) * 100).toFixed(2));

  return { correct, total, scorePct };
}

export function buildCategoryBreakdown(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]): CategoryBreakdown {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const rows = new Map<string, CategoryBreakdown[number]>();

  for (const question of snapshot.questions) {
    const existing = rows.get(question.category.id) ?? {
      categoryId: question.category.id,
      code: question.category.code,
      name: question.category.name,
      correct: 0,
      total: 0,
      scorePct: 0,
    };

    existing.total += 1;
    if (answerByQuestion.get(question.id)?.selectedOption.isCorrect === true) {
      existing.correct += 1;
    }
    existing.scorePct = Number(((existing.correct / existing.total) * 100).toFixed(2));
    rows.set(question.category.id, existing);
  }

  return [...rows.values()];
}

export function buildReview(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]): CertDrillReviewExamAttemptResponse {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const questions = snapshot.questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const correctOption = findCorrectOption(question);

    return {
      ...clone(question),
      yourOption: answer ? toOptionFeedback(answer.selectedOption) : null,
      correctOption: toOptionFeedback(correctOption),
      isCorrect: answer?.selectedOption.isCorrect ?? false,
    };
  });

  return { questions };
}

function buildAnswerMap(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]) {
  const questionsById = new Map(snapshot.questions.map((question) => [question.id, question]));
  const answerByQuestion = new Map<string, SnapshotAnswer>();

  for (const answer of answers) {
    const question = questionsById.get(answer.questionId);
    if (!question) throw new Error("Question is not part of this attempt");
    const selectedOption = question.options.find((option) => option.id === answer.selectedOptionId);
    if (!selectedOption) {
      throw new Error("Selected option is not part of this question");
    }
    answerByQuestion.set(answer.questionId, { ...answer, selectedOption, isCorrect: selectedOption.isCorrect });
  }

  return answerByQuestion;
}

function findQuestion(snapshot: CertDrillAttemptSnapshot, questionId: string) {
  const question = snapshot.questions.find((item) => item.id === questionId);
  if (!question) throw new Error("Question is not part of this attempt");

  return question;
}

function findCorrectOption(question: CertDrillQuestionSnapshot) {
  const correctOption = question.options.find((option) => option.isCorrect);
  if (!correctOption) throw new Error("Snapshot question has no correct option");

  return correctOption;
}

function toOptionFeedback(option: SnapshotOption): OptionFeedback {
  return {
    id: option.id,
    text: option.text,
    mediaAssets: clone(option.mediaAssets),
    explanation: option.explanation,
    citationUrls: [...option.citationUrls],
  };
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function normalizeMediaAssets(mediaAssets: CertDrillMediaAsset[], defaultAltText: string): CertDrillMediaAsset[] {
  return mediaAssets.map((asset, index) => {
    const looseAsset = asset as LooseMediaAsset;
    const caption = looseAsset.caption?.trim();
    return {
      url: looseAsset.url,
      mimeType: normalizeMimeType(looseAsset.mimeType ?? looseAsset.mime_type, looseAsset.url),
      altText: looseAsset.altText?.trim() || defaultAltText,
      ...(caption ? { caption } : {}),
      sortOrder: normalizeSortOrder(looseAsset.sortOrder, index),
    };
  });
}

function normalizeMimeType(mimeType: string | undefined, url: string): CertDrillMediaAsset["mimeType"] {
  const normalized = mimeType?.toLowerCase();
  if (normalized === "image/png" || normalized === "image/jpeg") {
    return normalized;
  }

  const pathname = getUrlPathname(url).toLowerCase();
  return pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") ? "image/jpeg" : "image/png";
}

function normalizeSortOrder(sortOrder: number | undefined, fallback: number) {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : fallback;
}

function getUrlPathname(url: string) {
  try {
    return new URL(url).pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] ?? "";
  }
}

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}
