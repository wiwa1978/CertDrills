export const questionsPerPage = 50;

export type QuestionTableQuery = {
  [key: string]: string | string[] | undefined;
  questionPage?: string | string[];
  questionSort?: string | string[];
  tab?: string | string[];
  imported?: string | string[];
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

// `imported` is a one-shot cosmetic confirmation flag from a completed question import, so it is
// dropped from question table navigation instead of being carried into every later sort/page link.
export function buildQuestionSortQuery<T extends QuestionTableQuery>(currentQuery: T, questionSort: string) {
  return {
    ...currentQuery,
    questionSort,
    questionPage: undefined,
    imported: undefined,
    tab: "questions" as const,
  };
}

export function buildQuestionPageQuery<T extends QuestionTableQuery>(currentQuery: T, page: number) {
  return {
    ...currentQuery,
    questionPage: String(page),
    imported: undefined,
    tab: "questions" as const,
  };
}
