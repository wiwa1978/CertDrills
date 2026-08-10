import type {
  AnswerCertDrillQuestionRequest,
  AnswerCertDrillQuestionResponse,
  CertDrillAttemptSnapshot,
  CertDrillMediaAsset,
  CertDrillQuestionSnapshot,
  CertDrillQuestionResponse,
  CertDrillReviewExamAttemptResponse,
  CertDrillScenarioDecision,
  CertDrillScenarioSnapshot,
  CreateCertDrillExamAttemptResponse,
  SubmitCertDrillExamAttemptResponse,
} from "@platform/contracts";

type AttemptAnswer = { questionId: string; selectedOptionId: string | null; responseJson?: CertDrillQuestionResponse | null; isCorrect: boolean };
type ScenarioResponse = { scenarioId: string; decisionsJson: CertDrillScenarioDecision[]; earnedPoints: number; maxPoints: number; scorePct: string | number };
type OptionFeedback = NonNullable<Exclude<AnswerCertDrillQuestionResponse, { received: true }>["correctOption"]>;
type ExamQuestionPayload = CreateCertDrillExamAttemptResponse["questions"];
type ExamScenarioPayload = NonNullable<CreateCertDrillExamAttemptResponse["scenarios"]>;
type CategoryBreakdown = SubmitCertDrillExamAttemptResponse["categoryBreakdown"];
type SnapshotOption = CertDrillQuestionSnapshot["options"][number];
type SnapshotAnswer = AttemptAnswer & { response: CertDrillQuestionResponse; isCorrect: boolean };
type BuildAttemptSnapshotOptions = { rng?: () => number; shuffleOptions?: boolean };
type LooseMediaAsset = Partial<CertDrillMediaAsset> & { url: string; mime_type?: string };

export function buildAttemptSnapshot(
  questions: CertDrillQuestionSnapshot[],
  scenariosOrOptions: CertDrillScenarioSnapshot[] | BuildAttemptSnapshotOptions = [],
  explicitOptions: BuildAttemptSnapshotOptions = {},
): CertDrillAttemptSnapshot {
  const scenarios = Array.isArray(scenariosOrOptions) ? scenariosOrOptions : [];
  const options = Array.isArray(scenariosOrOptions) ? explicitOptions : scenariosOrOptions;
  const shouldShuffleOptions = options.shuffleOptions !== false;
  const rng = options.rng ?? Math.random;
  const snapshotQuestions = clone(questions).map((question) => ({
    ...question,
    mediaAssets: normalizeMediaAssets(question.mediaAssets, "Question image"),
    interaction: question.interaction?.type === "matching"
      ? { ...question.interaction, targetOrder: fisherYates(question.interaction.pairs.map((pair) => pair.targetId), rng) }
      : question.interaction,
    options: question.questionType === "single_choice" && shouldShuffleOptions ? fisherYates(question.options, rng) : question.options,
  })).map((question) => ({
    ...question,
    options: question.options.map((option) => ({ ...option, mediaAssets: normalizeMediaAssets(option.mediaAssets, "Answer option image") })),
  }));

  return scenarios.length > 0 ? { version: 2, questions: snapshotQuestions, scenarios: clone(scenarios) } : { version: 1, questions: snapshotQuestions };
}

export function snapshotScenarios(snapshot: CertDrillAttemptSnapshot): CertDrillScenarioSnapshot[] {
  return snapshot.version === 2 ? snapshot.scenarios : [];
}

export function toExamQuestionPayload(snapshot: CertDrillAttemptSnapshot): ExamQuestionPayload {
  return snapshot.questions.map((question) => ({
    id: question.id,
    stem: question.stem,
    mediaAssets: clone(question.mediaAssets),
    questionType: question.questionType,
    interaction: publicInteraction(question),
    category: { ...question.category },
    options: question.options.map((option) => ({ id: option.id, text: option.text, mediaAssets: clone(option.mediaAssets) })),
  }));
}

export function toExamScenarioPayload(snapshot: CertDrillAttemptSnapshot): ExamScenarioPayload {
  return snapshotScenarios(snapshot).map((scenario) => ({
    ...clone(scenario),
    nodes: scenario.nodes.map((node) => ({
      ...clone(node),
      options: node.options.map(({ points: _points, ...option }) => clone(option)),
    })),
  }));
}

export function buildPracticeFeedback(snapshot: CertDrillAttemptSnapshot, request: AnswerCertDrillQuestionRequest | string, legacySelectedOptionId?: string): Exclude<AnswerCertDrillQuestionResponse, { received: true }> & { response: CertDrillQuestionResponse } {
  const input: AnswerCertDrillQuestionRequest = typeof request === "string"
    ? { questionId: request, selectedOptionId: legacySelectedOptionId ?? "" }
    : request;
  const question = findQuestion(snapshot, input.questionId);
  const response = normalizeQuestionResponse(input);
  const detail = evaluateQuestion(question, response);
  return { ...detail, response };
}

export function scoreScenario(snapshot: CertDrillAttemptSnapshot, scenarioId: string, decisions: CertDrillScenarioDecision[]) {
  const scenario = snapshotScenarios(snapshot).find((item) => item.id === scenarioId);
  if (!scenario) throw new Error("Scenario is not part of this attempt");
  const nodes = new Map(scenario.nodes.map((node) => [node.key, node]));
  let currentNodeKey: string | null = scenario.initialNodeKey;
  let earnedPoints = 0;
  let maxPoints = 0;

  for (const decision of decisions) {
    if (currentNodeKey === null || decision.nodeKey !== currentNodeKey) throw new Error("Scenario decisions do not follow the assigned path");
    const node = nodes.get(currentNodeKey);
    if (!node) throw new Error("Scenario decision references an unknown node");
    const option = node.options.find((item) => item.key === decision.optionKey);
    if (!option) throw new Error("Scenario decision references an unknown option");
    earnedPoints += option.points;
    maxPoints += Math.max(...node.options.map((item) => item.points));
    currentNodeKey = option.nextNodeKey;
  }

  if (currentNodeKey !== null) throw new Error("Scenario response must reach an ending");
  if (maxPoints <= 0) throw new Error("Scenario has no available points");
  const scorePct = Number(((earnedPoints / maxPoints) * 100).toFixed(2));
  return { scenarioId, decisions: clone(decisions), earnedPoints, maxPoints, scorePct };
}

export function scoreAttempt(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[], scenarioResponses: ScenarioResponse[] = []) {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const scenarioById = new Map(scenarioResponses.map((response) => [response.scenarioId, response]));
  const correct = snapshot.questions.filter((question) => answerByQuestion.get(question.id)?.isCorrect === true).length;
  const scenarios = snapshotScenarios(snapshot);
  const scenarioCredit = scenarios.reduce((sum, scenario) => sum + Number(scenarioById.get(scenario.id)?.scorePct ?? 0) / 100, 0);
  const total = snapshot.questions.length + scenarios.length;
  const scorePct = total === 0 ? 0 : Number((((correct + scenarioCredit) / total) * 100).toFixed(2));
  return { correct, total, scorePct };
}

export function buildCategoryBreakdown(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]): CategoryBreakdown {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const rows = new Map<string, CategoryBreakdown[number]>();
  for (const question of snapshot.questions) {
    const existing = rows.get(question.category.id) ?? { categoryId: question.category.id, code: question.category.code, name: question.category.name, correct: 0, total: 0, scorePct: 0 };
    existing.total += 1;
    if (answerByQuestion.get(question.id)?.isCorrect === true) existing.correct += 1;
    existing.scorePct = Number(((existing.correct / existing.total) * 100).toFixed(2));
    rows.set(question.category.id, existing);
  }
  return [...rows.values()];
}

export function buildReview(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[], scenarioResponses: ScenarioResponse[] = []): CertDrillReviewExamAttemptResponse {
  const answerByQuestion = buildAnswerMap(snapshot, answers);
  const scenarioById = new Map(scenarioResponses.map((response) => [response.scenarioId, response]));
  const questions = snapshot.questions.map((question) => {
    const answer = answerByQuestion.get(question.id);
    const detail = answer ? evaluateQuestion(question, answer.response) : unansweredDetail(question);
    return {
      ...clone(question),
      yourAnswer: answer ? detail.submittedAnswer : null,
      correctAnswer: detail.correctAnswer,
      explanation: detail.explanation,
      citationUrls: detail.citationUrls,
      ...(question.questionType === "single_choice" ? { yourOption: "selectedOptionFeedback" in detail ? detail.selectedOptionFeedback as OptionFeedback : null } : {}),
      ...(question.questionType === "single_choice" && "correctOption" in detail ? { correctOption: detail.correctOption as OptionFeedback } : {}),
      isCorrect: answer?.isCorrect ?? false,
    };
  });
  const scenarios = snapshotScenarios(snapshot).map((scenario) => {
    const response = scenarioById.get(scenario.id);
    return { ...clone(scenario), decisions: clone(response?.decisionsJson ?? []), earnedPoints: response?.earnedPoints ?? 0, maxPoints: response?.maxPoints ?? 1, scorePct: Number(response?.scorePct ?? 0) };
  });
  return { questions, scenarios };
}

function buildAnswerMap(snapshot: CertDrillAttemptSnapshot, answers: AttemptAnswer[]) {
  const questionsById = new Map(snapshot.questions.map((question) => [question.id, question]));
  const answerByQuestion = new Map<string, SnapshotAnswer>();
  for (const answer of answers) {
    const question = questionsById.get(answer.questionId);
    if (!question) throw new Error("Question is not part of this attempt");
    const response = answer.responseJson ?? (answer.selectedOptionId ? { type: "single_choice" as const, selectedOptionId: answer.selectedOptionId } : null);
    if (!response) throw new Error("Recorded answer has no response");
    const detail = evaluateQuestion(question, response);
    answerByQuestion.set(answer.questionId, { ...answer, response, isCorrect: detail.isCorrect });
  }
  return answerByQuestion;
}

function publicInteraction(question: CertDrillQuestionSnapshot): ExamQuestionPayload[number]["interaction"] {
  if (question.questionType === "fill_blank") return { type: "fill_blank" };
  if (question.questionType !== "matching" || question.interaction?.type !== "matching") return null;
  const targetById = new Map(question.interaction.pairs.map((pair) => [pair.targetId, pair.target]));
  const targetOrder = question.interaction.targetOrder ?? question.interaction.pairs.map((pair) => pair.targetId);
  return {
    type: "matching",
    prompts: question.interaction.pairs.map((pair) => ({ id: pair.promptId, text: pair.prompt })),
    targets: targetOrder.map((id) => ({ id, text: targetById.get(id)! })),
  };
}

function normalizeQuestionResponse(input: AnswerCertDrillQuestionRequest): CertDrillQuestionResponse {
  if (input.type === "fill_blank") return { type: "fill_blank", text: input.text };
  if (input.type === "matching") return { type: "matching", matches: input.matches };
  return { type: "single_choice", selectedOptionId: input.selectedOptionId };
}

function evaluateQuestion(question: CertDrillQuestionSnapshot, response: CertDrillQuestionResponse) {
  if (question.questionType !== response.type) throw new Error("Answer type does not match the question type");
  if (response.type === "single_choice") {
    const selectedOption = question.options.find((option) => option.id === response.selectedOptionId);
    if (!selectedOption) throw new Error("Selected option is not part of this question");
    const correctOption = findCorrectOption(question);
    return {
      isCorrect: selectedOption.isCorrect,
      questionType: "single_choice" as const,
      submittedAnswer: selectedOption.text,
      correctAnswer: correctOption.text,
      explanation: selectedOption.explanation,
      citationUrls: [...selectedOption.citationUrls],
      selectedOptionFeedback: toOptionFeedback(selectedOption),
      correctOption: toOptionFeedback(correctOption),
    };
  }

  if (response.type === "fill_blank") {
    if (question.interaction?.type !== "fill_blank") throw new Error("Fill-in question has no answer configuration");
    const isCorrect = question.interaction.acceptedAnswers.some((answer) => normalizeTextAnswer(answer) === normalizeTextAnswer(response.text));
    return {
      isCorrect,
      questionType: "fill_blank" as const,
      submittedAnswer: response.text.trim(),
      correctAnswer: question.interaction.acceptedAnswers.join(" / "),
      explanation: question.interaction.explanation,
      citationUrls: [...question.interaction.citationUrls],
    };
  }

  if (question.interaction?.type !== "matching") throw new Error("Matching question has no pair configuration");
  const pairByPrompt = new Map(question.interaction.pairs.map((pair) => [pair.promptId, pair]));
  if (response.matches.length !== question.interaction.pairs.length || new Set(response.matches.map((match) => match.promptId)).size !== response.matches.length || new Set(response.matches.map((match) => match.targetId)).size !== response.matches.length) throw new Error("Matching response must assign every prompt and target exactly once");
  for (const match of response.matches) {
    if (!pairByPrompt.has(match.promptId) || !question.interaction.pairs.some((pair) => pair.targetId === match.targetId)) throw new Error("Matching response contains an unknown prompt or target");
  }
  const targetById = new Map(question.interaction.pairs.map((pair) => [pair.targetId, pair.target]));
  const isCorrect = response.matches.every((match) => pairByPrompt.get(match.promptId)?.targetId === match.targetId);
  const submittedAnswer = response.matches.map((match) => `${pairByPrompt.get(match.promptId)!.prompt} → ${targetById.get(match.targetId)!}`).join("; ");
  const correctAnswer = question.interaction.pairs.map((pair) => `${pair.prompt} → ${pair.target}`).join("; ");
  return {
    isCorrect,
    questionType: "matching" as const,
    submittedAnswer,
    correctAnswer,
    explanation: question.interaction.pairs.map((pair) => pair.explanation).join(" "),
    citationUrls: [...new Set(question.interaction.pairs.flatMap((pair) => pair.citationUrls))],
  };
}

function unansweredDetail(question: CertDrillQuestionSnapshot) {
  if (question.questionType === "single_choice") {
    const correctOption = findCorrectOption(question);
    return { isCorrect: false, questionType: "single_choice" as const, submittedAnswer: "", correctAnswer: correctOption.text, explanation: correctOption.explanation, citationUrls: [...correctOption.citationUrls], correctOption: toOptionFeedback(correctOption) };
  }
  if (question.questionType === "fill_blank" && question.interaction?.type === "fill_blank") {
    return { isCorrect: false, questionType: "fill_blank" as const, submittedAnswer: "", correctAnswer: question.interaction.acceptedAnswers.join(" / "), explanation: question.interaction.explanation, citationUrls: [...question.interaction.citationUrls] };
  }
  if (question.interaction?.type !== "matching") throw new Error("Matching question has no pair configuration");
  return { isCorrect: false, questionType: "matching" as const, submittedAnswer: "", correctAnswer: question.interaction.pairs.map((pair) => `${pair.prompt} → ${pair.target}`).join("; "), explanation: question.interaction.pairs.map((pair) => pair.explanation).join(" "), citationUrls: [...new Set(question.interaction.pairs.flatMap((pair) => pair.citationUrls))] };
}

function normalizeTextAnswer(value: string) {
  return value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
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
  return { id: option.id, text: option.text, mediaAssets: clone(option.mediaAssets), explanation: option.explanation, citationUrls: [...option.citationUrls] };
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
  if (normalized === "image/png" || normalized === "image/jpeg") return normalized;
  const pathname = getUrlPathname(url).toLowerCase();
  return pathname.endsWith(".jpg") || pathname.endsWith(".jpeg") ? "image/jpeg" : "image/png";
}

function normalizeSortOrder(sortOrder: number | undefined, fallback: number) {
  return typeof sortOrder === "number" && Number.isInteger(sortOrder) && sortOrder >= 0 ? sortOrder : fallback;
}

function getUrlPathname(url: string) {
  try { return new URL(url).pathname; } catch { return url.split(/[?#]/, 1)[0] ?? ""; }
}

function fisherYates<T>(items: T[], rng: () => number): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
