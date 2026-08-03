export const questionsPerPage = 50;

type QuestionTableQuery = {
  questionPage?: string;
  questionSort?: string;
  tab?: string;
};

export function normalizeQuestionPage(value?: string) {
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function paginateQuestions<T>(questions: T[], requestedPage?: string) {
  const pageCount = Math.max(1, Math.ceil(questions.length / questionsPerPage));
  const page = Math.min(normalizeQuestionPage(requestedPage), pageCount);
  const offset = (page - 1) * questionsPerPage;

  return {
    items: questions.slice(offset, offset + questionsPerPage),
    page,
    pageCount,
  };
}

export function buildQuestionSortQuery<T extends QuestionTableQuery>(currentQuery: T, questionSort: string) {
  return {
    ...currentQuery,
    questionSort,
    questionPage: undefined,
    tab: "questions" as const,
  };
}

export function buildQuestionPageQuery<T extends QuestionTableQuery>(currentQuery: T, page: number) {
  return {
    ...currentQuery,
    questionPage: String(page),
    tab: "questions" as const,
  };
}
