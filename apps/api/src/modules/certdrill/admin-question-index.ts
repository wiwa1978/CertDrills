import { and, asc, count, desc, eq, exists, inArray, or, sql, type SQLWrapper } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillExamCategories,
  certdrillQuestions,
  type CertDrillDifficulty,
  type CertDrillQuestionStatus,
} from "@platform/platform-db";

export const ADMIN_QUESTION_INDEX_PAGE_SIZE = 50;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_STATUSES = new Set<CertDrillQuestionStatus>(["draft", "published", "archived"]);
const QUESTION_DIFFICULTIES = new Set<CertDrillDifficulty>(["easy", "medium", "hard"]);
const QUESTION_SORTS = new Set<AdminQuestionIndexSort>(["stem-asc", "stem-desc"]);
const LIKE_ESCAPE_CHARACTER = "\\";
const LIKE_META_CHARACTERS = /[%_\\]/g;

export type AdminQuestionIndexSort = "stem-asc" | "stem-desc";

export type AdminQuestionIndexQueryInput = {
  search?: string | null;
  certificationId?: string | null;
  categoryId?: string | null;
  status?: CertDrillQuestionStatus | string | null;
  difficulty?: CertDrillDifficulty | string | null;
  sort?: AdminQuestionIndexSort | string | null;
  page?: number | string | null;
};

export type AdminQuestionIndexQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: CertDrillQuestionStatus;
  difficulty?: CertDrillDifficulty;
  sort: AdminQuestionIndexSort;
  page: number;
};

export type AdminQuestionIndexCertificationFilterOption = {
  id: string;
  code: string;
  name: string;
};

export type AdminQuestionIndexCategoryFilterOption = {
  id: string;
  certificationId: string;
  code: string;
  name: string;
};

export type AdminQuestionIndexFilterOptions = {
  certifications: AdminQuestionIndexCertificationFilterOption[];
  categories: AdminQuestionIndexCategoryFilterOption[];
};

export type AdminQuestionIndexAnswerOptionRecord = {
  id: string;
  questionId: string;
  text: string;
  isCorrect: boolean;
  explanation: string;
  sortOrder: number;
};

export type AdminQuestionIndexQuestionRecord = {
  questionId: string;
  stem: string;
  status: CertDrillQuestionStatus;
  difficulty: CertDrillDifficulty;
  certificationId: string;
  certificationCode: string;
  certificationName: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
};

export type AdminQuestionIndexRow = AdminQuestionIndexQuestionRecord & {
  answerOptions: AdminQuestionIndexAnswerOptionRecord[];
};

export type AdminQuestionIndexResult = {
  query: AdminQuestionIndexQuery;
  items: AdminQuestionIndexRow[];
  filterOptions: AdminQuestionIndexFilterOptions;
  pagination: {
    page: number;
    pageSize: number;
    pageCount: number;
    totalItems: number;
  };
};

export type AdminQuestionIndexRepository = {
  listFilterOptions: () => Promise<AdminQuestionIndexFilterOptions>;
  countQuestions: (query: AdminQuestionIndexQuery) => Promise<number>;
  listQuestions: (query: AdminQuestionIndexQuery) => Promise<AdminQuestionIndexQuestionRecord[]>;
  listQuestionAnswerOptions: (questionIds: string[]) => Promise<AdminQuestionIndexAnswerOptionRecord[]>;
};

type AdminQuestionIndexDeps = {
  repository: AdminQuestionIndexRepository;
};

type DrizzleAdminQuestionIndexRepositoryDeps = {
  db: any;
};

export function normalizeAdminQuestionIndexQuery(input: AdminQuestionIndexQueryInput = {}): AdminQuestionIndexQuery {
  const search = input.search?.trim() || undefined;
  const certificationId = normalizeUuid(input.certificationId);
  const categoryId = normalizeUuid(input.categoryId);
  const status = QUESTION_STATUSES.has(input.status as CertDrillQuestionStatus)
    ? input.status as CertDrillQuestionStatus
    : undefined;
  const difficulty = QUESTION_DIFFICULTIES.has(input.difficulty as CertDrillDifficulty)
    ? input.difficulty as CertDrillDifficulty
    : undefined;
  const sort = QUESTION_SORTS.has(input.sort as AdminQuestionIndexSort)
    ? input.sort as AdminQuestionIndexSort
    : "stem-asc";

  return {
    search,
    certificationId,
    categoryId,
    status,
    difficulty,
    sort,
    page: normalizePage(input.page),
  };
}

export function createCertDrillAdminQuestionIndex(deps: AdminQuestionIndexDeps) {
  async function query(input: AdminQuestionIndexQueryInput = {}): Promise<AdminQuestionIndexResult> {
    const filterOptions = await deps.repository.listFilterOptions();
    const normalizedQuery = normalizeAdminQuestionIndexQuery(input);
    const effectiveQuery = {
      ...normalizedQuery,
      categoryId: resolveCompatibleCategoryId(
        normalizedQuery.categoryId,
        normalizedQuery.certificationId,
        filterOptions.categories,
      ),
    };

    const totalItems = await deps.repository.countQuestions(effectiveQuery);
    const pageCount = Math.max(1, Math.ceil(totalItems / ADMIN_QUESTION_INDEX_PAGE_SIZE));
    let page = totalItems === 0 ? 1 : effectiveQuery.page;
    let questionRecords = await deps.repository.listQuestions({ ...effectiveQuery, page });

    if (questionRecords.length === 0 && totalItems > 0 && page > pageCount) {
      page = pageCount;
      questionRecords = await deps.repository.listQuestions({ ...effectiveQuery, page });
    }

    if (page > pageCount) {
      page = pageCount;
    }

    const questionIds = questionRecords.map((record) => record.questionId);
    const answerOptionRecords = questionIds.length > 0
      ? await deps.repository.listQuestionAnswerOptions(questionIds)
      : [];

    return {
      query: { ...effectiveQuery, page },
      items: groupAnswerOptions(questionRecords, answerOptionRecords),
      filterOptions,
      pagination: {
        page,
        pageSize: ADMIN_QUESTION_INDEX_PAGE_SIZE,
        pageCount,
        totalItems,
      },
    };
  }

  return { query };
}

export function createDrizzleAdminQuestionIndexRepository(
  deps: DrizzleAdminQuestionIndexRepositoryDeps,
): AdminQuestionIndexRepository {
  async function listFilterOptions(): Promise<AdminQuestionIndexFilterOptions> {
    const [certifications, categories] = await Promise.all([
      deps.db
        .select({
          id: certdrillCertifications.id,
          code: certdrillCertifications.code,
          name: certdrillCertifications.name,
        })
        .from(certdrillCertifications)
        .orderBy(
          asc(certdrillCertifications.code),
          asc(certdrillCertifications.name),
          asc(certdrillCertifications.id),
        ),
      deps.db
        .select({
          id: certdrillExamCategories.id,
          certificationId: certdrillExamCategories.certificationId,
          code: certdrillExamCategories.code,
          name: certdrillExamCategories.name,
        })
        .from(certdrillExamCategories)
        .innerJoin(
          certdrillCertifications,
          eq(certdrillExamCategories.certificationId, certdrillCertifications.id),
        )
        .orderBy(
          asc(certdrillCertifications.code),
          asc(certdrillExamCategories.code),
          asc(certdrillExamCategories.name),
          asc(certdrillExamCategories.id),
        ),
    ]);

    return { certifications, categories };
  }

  async function countQuestions(query: AdminQuestionIndexQuery): Promise<number> {
    const rows = await deps.db
      .select({ count: count() })
      .from(certdrillQuestions)
      .innerJoin(
        certdrillCertifications,
        eq(certdrillQuestions.certificationId, certdrillCertifications.id),
      )
      .innerJoin(
        certdrillExamCategories,
        eq(certdrillQuestions.categoryId, certdrillExamCategories.id),
      )
      .where(buildWhere(query, deps.db));

    return Number(rows[0]?.count ?? 0);
  }

  async function listQuestions(query: AdminQuestionIndexQuery): Promise<AdminQuestionIndexQuestionRecord[]> {
    return deps.db
      .select({
        questionId: certdrillQuestions.id,
        stem: certdrillQuestions.stem,
        status: certdrillQuestions.status,
        difficulty: certdrillQuestions.difficulty,
        certificationId: certdrillCertifications.id,
        certificationCode: certdrillCertifications.code,
        certificationName: certdrillCertifications.name,
        categoryId: certdrillExamCategories.id,
        categoryCode: certdrillExamCategories.code,
        categoryName: certdrillExamCategories.name,
      })
      .from(certdrillQuestions)
      .innerJoin(
        certdrillCertifications,
        eq(certdrillQuestions.certificationId, certdrillCertifications.id),
      )
      .innerJoin(
        certdrillExamCategories,
        eq(certdrillQuestions.categoryId, certdrillExamCategories.id),
      )
      .where(buildWhere(query, deps.db))
      .orderBy(
        asc(certdrillCertifications.code),
        asc(certdrillExamCategories.code),
        query.sort === "stem-desc" ? desc(certdrillQuestions.stem) : asc(certdrillQuestions.stem),
        asc(certdrillQuestions.id),
      )
      .limit(ADMIN_QUESTION_INDEX_PAGE_SIZE)
      .offset((query.page - 1) * ADMIN_QUESTION_INDEX_PAGE_SIZE);
  }

  async function listQuestionAnswerOptions(questionIds: string[]): Promise<AdminQuestionIndexAnswerOptionRecord[]> {
    if (questionIds.length === 0) {
      return [];
    }

    return deps.db
      .select({
        id: certdrillAnswerOptions.id,
        questionId: certdrillAnswerOptions.questionId,
        text: certdrillAnswerOptions.text,
        isCorrect: certdrillAnswerOptions.isCorrect,
        explanation: certdrillAnswerOptions.explanation,
        sortOrder: certdrillAnswerOptions.sortOrder,
      })
      .from(certdrillAnswerOptions)
      .where(inArray(certdrillAnswerOptions.questionId, questionIds))
      .orderBy(
        asc(certdrillAnswerOptions.questionId),
        asc(certdrillAnswerOptions.sortOrder),
        asc(certdrillAnswerOptions.id),
      );
  }

  return {
    listFilterOptions,
    countQuestions,
    listQuestions,
    listQuestionAnswerOptions,
  };
}

function buildWhere(query: AdminQuestionIndexQuery, db: any) {
  const conditions = [];

  if (query.certificationId) {
    conditions.push(eq(certdrillQuestions.certificationId, query.certificationId));
  }
  if (query.categoryId) {
    conditions.push(eq(certdrillQuestions.categoryId, query.categoryId));
  }
  if (query.status) {
    conditions.push(eq(certdrillQuestions.status, query.status));
  }
  if (query.difficulty) {
    conditions.push(eq(certdrillQuestions.difficulty, query.difficulty));
  }
  if (query.search) {
    conditions.push(buildSearchCondition(query.search, db));
  }

  return conditions.length > 0 ? and(...conditions) : undefined;
}

function buildSearchCondition(search: string, db: any) {
  const pattern = escapeAdminQuestionIndexLikePattern(search);

  return or(
    buildEscapedIlikeCondition(sql`${certdrillQuestions.id}::text`, pattern),
    buildEscapedIlikeCondition(certdrillQuestions.stem, pattern),
    buildEscapedIlikeCondition(certdrillCertifications.code, pattern),
    buildEscapedIlikeCondition(certdrillCertifications.name, pattern),
    buildEscapedIlikeCondition(certdrillExamCategories.code, pattern),
    buildEscapedIlikeCondition(certdrillExamCategories.name, pattern),
    buildEscapedIlikeCondition(certdrillQuestions.status, pattern),
    buildEscapedIlikeCondition(certdrillQuestions.difficulty, pattern),
    exists(
      db
        .select({ id: certdrillAnswerOptions.id })
        .from(certdrillAnswerOptions)
        .where(and(
          eq(certdrillAnswerOptions.questionId, certdrillQuestions.id),
          or(
            buildEscapedIlikeCondition(certdrillAnswerOptions.text, pattern),
            buildEscapedIlikeCondition(certdrillAnswerOptions.explanation, pattern),
          ),
        )),
    ),
  );
}

export function escapeAdminQuestionIndexLikePattern(search: string) {
  return `%${search.replace(LIKE_META_CHARACTERS, (character) => `${LIKE_ESCAPE_CHARACTER}${character}`)}%`;
}

function buildEscapedIlikeCondition(column: SQLWrapper, pattern: string) {
  return sql<boolean>`${column} ILIKE ${pattern} ESCAPE ${sql.raw(`'${LIKE_ESCAPE_CHARACTER}'`)}`;
}

function groupAnswerOptions(
  questionRecords: AdminQuestionIndexQuestionRecord[],
  answerOptionRecords: AdminQuestionIndexAnswerOptionRecord[],
): AdminQuestionIndexRow[] {
  const optionsByQuestionId = new Map<string, AdminQuestionIndexAnswerOptionRecord[]>();

  for (const answerOption of answerOptionRecords) {
    const current = optionsByQuestionId.get(answerOption.questionId);
    if (current) {
      current.push(answerOption);
      continue;
    }
    optionsByQuestionId.set(answerOption.questionId, [answerOption]);
  }

  return questionRecords.map((questionRecord) => ({
    ...questionRecord,
    answerOptions: optionsByQuestionId.get(questionRecord.questionId) ?? [],
  }));
}

function normalizeUuid(value: string | null | undefined) {
  if (!value) {
    return undefined;
  }

  return UUID_PATTERN.test(value) ? value : undefined;
}

function normalizePage(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0 ? value : 1;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  }

  return 1;
}

function resolveCompatibleCategoryId(
  categoryId: string | undefined,
  certificationId: string | undefined,
  categories: AdminQuestionIndexCategoryFilterOption[],
) {
  if (!categoryId || !certificationId) {
    return categoryId;
  }

  const category = categories.find((entry) => entry.id === categoryId);
  return category?.certificationId === certificationId ? categoryId : undefined;
}
