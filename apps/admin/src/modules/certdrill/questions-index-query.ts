import type {
  CertDrillAdminQuestion,
  CertDrillAdminQuestionIndexQuery,
  CertDrillAdminQuestionIndexResult,
  CertDrillAdminQuestionIndexSort,
} from "@/lib/api/certdrill.server";

export type QuestionsIndexSearchParamValue = string | string[] | undefined;

export type QuestionsIndexQuery = {
  [key: string]: QuestionsIndexSearchParamValue;
  search?: QuestionsIndexSearchParamValue;
  certificationId?: QuestionsIndexSearchParamValue;
  categoryId?: QuestionsIndexSearchParamValue;
  status?: QuestionsIndexSearchParamValue;
  difficulty?: QuestionsIndexSearchParamValue;
  sort?: QuestionsIndexSearchParamValue;
  page?: QuestionsIndexSearchParamValue;
};

export type QuestionsIndexCertificationOption = CertDrillAdminQuestionIndexResult["certifications"][number];
export type QuestionsIndexCategoryOption = CertDrillAdminQuestionIndexResult["categories"][number];
export type QuestionsIndexStatus = NonNullable<CertDrillAdminQuestion["status"]>;
export type QuestionsIndexDifficulty = NonNullable<CertDrillAdminQuestionIndexQuery["difficulty"]>;

export type NormalizedQuestionsIndexQuery = {
  search?: string;
  certificationId?: string;
  categoryId?: string;
  status?: QuestionsIndexStatus;
  difficulty?: QuestionsIndexDifficulty;
  sort: CertDrillAdminQuestionIndexSort;
  page: number;
};

const allowedStatuses: QuestionsIndexStatus[] = ["draft", "published", "archived"];
const allowedDifficulties: QuestionsIndexDifficulty[] = ["easy", "medium", "hard"];
const allowedSorts: CertDrillAdminQuestionIndexSort[] = ["stem-asc", "stem-desc"];
const filterKeys = ["search", "certificationId", "categoryId", "status", "difficulty", "sort", "page"] as const;
const managedKeySet = new Set<string>(filterKeys);

function firstSearchParamString(value: QuestionsIndexSearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function trimSearchParamValue(value: QuestionsIndexSearchParamValue) {
  const normalizedValue = firstSearchParamString(value)?.trim();
  return normalizedValue ? normalizedValue : undefined;
}

function normalizeEnumValue<TValue extends string>(
  value: QuestionsIndexSearchParamValue,
  allowedValues: readonly TValue[],
) {
  const normalizedValue = trimSearchParamValue(value);
  return normalizedValue && allowedValues.includes(normalizedValue as TValue) ? normalizedValue as TValue : undefined;
}

export function normalizeQuestionsIndexPage(value: QuestionsIndexSearchParamValue) {
  const normalizedValue = trimSearchParamValue(value);
  if (!normalizedValue) return 1;
  if (!/^[1-9]\d*$/.test(normalizedValue)) return 1;

  const page = Number(normalizedValue);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function isQuestionsIndexCategoryCompatible(
  certificationId: string | undefined,
  categoryId: string | undefined,
  categories: readonly QuestionsIndexCategoryOption[],
) {
  if (!certificationId || !categoryId) return true;
  if (categories.length === 0) return true;

  return categories.some((category) => category.id === categoryId && category.certificationId === certificationId);
}

export function getQuestionsIndexCategoryOptions(
  certificationId: string | undefined,
  categories: readonly QuestionsIndexCategoryOption[],
) {
  if (!certificationId) return [...categories];
  return categories.filter((category) => category.certificationId === certificationId);
}

export function normalizeQuestionsIndexQuery(
  query: QuestionsIndexQuery,
  categories: readonly QuestionsIndexCategoryOption[] = [],
): NormalizedQuestionsIndexQuery {
  const search = trimSearchParamValue(query.search);
  const certificationId = trimSearchParamValue(query.certificationId);
  const normalizedCategoryId = trimSearchParamValue(query.categoryId);
  const categoryId = isQuestionsIndexCategoryCompatible(certificationId, normalizedCategoryId, categories)
    ? normalizedCategoryId
    : undefined;

  return {
    search,
    certificationId,
    categoryId,
    status: normalizeEnumValue(query.status, allowedStatuses),
    difficulty: normalizeEnumValue(query.difficulty, allowedDifficulties),
    sort: normalizeEnumValue(query.sort, allowedSorts) ?? "stem-asc",
    page: normalizeQuestionsIndexPage(query.page),
  };
}

function cloneQuery(query: QuestionsIndexQuery) {
  return { ...query };
}

function splitQuestionsIndexQuery(query: QuestionsIndexQuery) {
  const unrelatedQuery: QuestionsIndexQuery = {};

  for (const [key, value] of Object.entries(query)) {
    if (!managedKeySet.has(key)) unrelatedQuery[key] = value;
  }

  const normalizedQuery = normalizeQuestionsIndexQuery(query);
  const managedQuery: QuestionsIndexQuery = {
    search: normalizedQuery.search,
    certificationId: normalizedQuery.certificationId,
    categoryId: normalizedQuery.categoryId,
    status: normalizedQuery.status,
    difficulty: normalizedQuery.difficulty,
    sort: normalizeEnumValue(query.sort, allowedSorts),
    page: trimSearchParamValue(query.page) ? String(normalizedQuery.page) : undefined,
  };

  return { unrelatedQuery, managedQuery };
}

function applyKnownQuestionIndexValue(
  nextQuery: QuestionsIndexQuery,
  key: keyof QuestionsIndexQuery,
  value: QuestionsIndexSearchParamValue,
) {
  if (key === "search" || key === "certificationId" || key === "categoryId") {
    nextQuery[key] = trimSearchParamValue(value);
    return;
  }
  if (key === "status") {
    nextQuery[key] = normalizeEnumValue(value, allowedStatuses);
    return;
  }
  if (key === "difficulty") {
    nextQuery[key] = normalizeEnumValue(value, allowedDifficulties);
    return;
  }
  if (key === "sort") {
    nextQuery[key] = normalizeEnumValue(value, allowedSorts);
    return;
  }
  if (key === "page") {
    nextQuery[key] = String(normalizeQuestionsIndexPage(value));
  }
}

export function buildQuestionsIndexFilterQuery(
  currentQuery: QuestionsIndexQuery,
  updates: Partial<Pick<QuestionsIndexQuery, "search" | "certificationId" | "categoryId" | "status" | "difficulty">>,
  categories: readonly QuestionsIndexCategoryOption[] = [],
): QuestionsIndexQuery {
  const { unrelatedQuery, managedQuery } = splitQuestionsIndexQuery(currentQuery);
  const nextQuery = cloneQuery(managedQuery);

  for (const [key, value] of Object.entries(updates)) {
    applyKnownQuestionIndexValue(nextQuery, key as keyof QuestionsIndexQuery, value);
  }

  const certificationId = trimSearchParamValue(nextQuery.certificationId);
  const categoryId = trimSearchParamValue(nextQuery.categoryId);
  if (!isQuestionsIndexCategoryCompatible(certificationId, categoryId, categories)) {
    nextQuery.categoryId = undefined;
  }

  nextQuery.page = undefined;
  return { ...unrelatedQuery, ...nextQuery };
}

export function buildQuestionsIndexSortQuery(
  currentQuery: QuestionsIndexQuery,
  sort: QuestionsIndexSearchParamValue,
): QuestionsIndexQuery {
  const { unrelatedQuery, managedQuery } = splitQuestionsIndexQuery(currentQuery);
  const nextQuery = cloneQuery(managedQuery);
  applyKnownQuestionIndexValue(nextQuery, "sort", sort);
  nextQuery.page = undefined;
  return { ...unrelatedQuery, ...nextQuery };
}

export function buildQuestionsIndexPageQuery(
  currentQuery: QuestionsIndexQuery,
  page: number,
): QuestionsIndexQuery {
  const { unrelatedQuery, managedQuery } = splitQuestionsIndexQuery(currentQuery);
  const nextQuery = cloneQuery(managedQuery);
  nextQuery.page = String(normalizeQuestionsIndexPage(String(page)));
  return { ...unrelatedQuery, ...nextQuery };
}

export function buildQuestionsIndexClearQuery(currentQuery: QuestionsIndexQuery): QuestionsIndexQuery {
  const { unrelatedQuery } = splitQuestionsIndexQuery(currentQuery);
  const clearedManagedQuery = Object.fromEntries(filterKeys.map((key) => [key, undefined])) as QuestionsIndexQuery;
  return { ...unrelatedQuery, ...clearedManagedQuery };
}

export function buildQuestionsIndexHref(pathname: string, query: QuestionsIndexQuery) {
  const { unrelatedQuery, managedQuery } = splitQuestionsIndexQuery(query);
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(unrelatedQuery)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) searchParams.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") searchParams.set(key, value);
  }

  for (const key of filterKeys) {
    const value = managedQuery[key];
    if (typeof value === "string") searchParams.set(key, value);
  }

  const queryString = searchParams.toString();
  return queryString ? `${pathname}?${queryString}` : pathname;
}
