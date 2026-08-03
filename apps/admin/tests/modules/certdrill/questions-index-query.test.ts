import { describe, expect, it } from "vitest";

import {
  buildQuestionsIndexClearQuery,
  buildQuestionsIndexFilterQuery,
  buildQuestionsIndexHref,
  buildQuestionsIndexPageQuery,
  buildQuestionsIndexSortQuery,
  getQuestionsIndexCategoryOptions,
  normalizeQuestionsIndexQuery,
} from "../../../src/modules/certdrill/questions-index-query";

const categories = [
  { id: "category-1", certificationId: "cert-1", code: "identity", name: "Identity" },
  { id: "category-2", certificationId: "cert-2", code: "storage", name: "Storage" },
] as const;

describe("questions index query", () => {
  it("normalizes array search params by trimming strings and using the first value", () => {
    expect(normalizeQuestionsIndexQuery({
      search: [" zero trust ", "ignored"],
      certificationId: [" cert-1 ", "cert-2"],
      categoryId: [" category-1 ", "category-2"],
      status: ["published", "draft"],
      difficulty: ["hard", "easy"],
      sort: ["stem-desc", "stem-asc"],
      page: [" 7 ", "8"],
    }, categories)).toEqual({
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: 7,
    });
  });

  it("ignores invalid values and falls back to the default first page and stem sort", () => {
    expect(normalizeQuestionsIndexQuery({
      search: "   ",
      certificationId: "   ",
      categoryId: "   ",
      status: "retired",
      difficulty: "expert",
      sort: "recent",
      page: "0",
    }, categories)).toEqual({
      search: undefined,
      certificationId: undefined,
      categoryId: undefined,
      status: undefined,
      difficulty: undefined,
      sort: "stem-asc",
      page: 1,
    });
  });

  it("normalizes missing, non-numeric, decimal, and non-positive pages to 1", () => {
    expect(normalizeQuestionsIndexQuery({}, categories).page).toBe(1);
    expect(normalizeQuestionsIndexQuery({ page: "not-a-page" }, categories).page).toBe(1);
    expect(normalizeQuestionsIndexQuery({ page: "-3" }, categories).page).toBe(1);
    expect(normalizeQuestionsIndexQuery({ page: "2.5" }, categories).page).toBe(1);
    expect(normalizeQuestionsIndexQuery({ page: "1e3" }, categories).page).toBe(1);
    expect(normalizeQuestionsIndexQuery({ page: "0x10" }, categories).page).toBe(1);
  });

  it("clears incompatible categories for a selected certification while keeping compatible ones", () => {
    expect(normalizeQuestionsIndexQuery({
      certificationId: "cert-1",
      categoryId: "category-2",
    }, categories)).toMatchObject({
      certificationId: "cert-1",
      categoryId: undefined,
    });
    expect(normalizeQuestionsIndexQuery({
      certificationId: "cert-1",
      categoryId: "category-1",
    }, categories)).toMatchObject({
      certificationId: "cert-1",
      categoryId: "category-1",
    });
    expect(normalizeQuestionsIndexQuery({
      categoryId: "category-2",
    }, categories)).toMatchObject({
      certificationId: undefined,
      categoryId: "category-2",
    });
  });

  it("filters category options by certification only when a certification is selected", () => {
    expect(getQuestionsIndexCategoryOptions(undefined, [...categories])).toEqual([...categories]);
    expect(getQuestionsIndexCategoryOptions("cert-1", [...categories])).toEqual([categories[0]]);
  });

  it("resets page on filter and sort changes while preserving unrelated query params", () => {
    const currentQuery = {
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "draft",
      difficulty: "medium",
      sort: "stem-asc",
      page: "4",
      tab: "feedback",
      foo: "bar",
      multi: ["first", "second"],
    };

    expect(buildQuestionsIndexFilterQuery(
      currentQuery,
      { certificationId: "cert-2" },
      categories,
    )).toEqual({
      search: "zero trust",
      certificationId: "cert-2",
      categoryId: undefined,
      status: "draft",
      difficulty: "medium",
      sort: "stem-asc",
      page: undefined,
      tab: "feedback",
      foo: "bar",
      multi: ["first", "second"],
    });

    expect(buildQuestionsIndexSortQuery(currentQuery, "stem-desc")).toEqual({
      ...currentQuery,
      sort: "stem-desc",
      page: undefined,
    });
  });

  it("canonicalizes managed params during builder updates without mutating unrelated params", () => {
    const currentQuery = {
      search: [" zero trust ", "ignored"],
      certificationId: [" cert-1 ", "ignored"],
      categoryId: [" category-1 ", "ignored"],
      status: ["published", "draft"],
      difficulty: ["hard", "easy"],
      sort: ["bad-sort", "stem-desc"],
      page: [" 7 ", "8"],
      foo: "  keep spacing  ",
      empty: "",
      multi: ["", " second "],
    };

    expect(buildQuestionsIndexFilterQuery(currentQuery, { status: "draft" }, categories)).toEqual({
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "draft",
      difficulty: "hard",
      sort: undefined,
      page: undefined,
      foo: "  keep spacing  ",
      empty: "",
      multi: ["", " second "],
    });
  });

  it("preserves page state on pagination and preserves unrelated query params", () => {
    const currentQuery = {
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: "2",
      foo: "bar",
    };

    expect(buildQuestionsIndexPageQuery(currentQuery, 5)).toEqual({
      ...currentQuery,
      page: "5",
    });
  });

  it("clears only centralized filters while preserving unrelated query params", () => {
    expect(buildQuestionsIndexClearQuery({
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-1",
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: "3",
      foo: "bar",
      multi: ["first", "second"],
    })).toEqual({
      search: undefined,
      certificationId: undefined,
      categoryId: undefined,
      status: undefined,
      difficulty: undefined,
      sort: undefined,
      page: undefined,
      foo: "bar",
      multi: ["first", "second"],
    });
  });

  it("serializes hrefs without leaking empty params or a trailing question mark", () => {
    expect(buildQuestionsIndexHref("/admin/questions", {
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: undefined,
      status: "published",
      difficulty: "hard",
      sort: "stem-desc",
      page: "3",
      foo: "bar baz",
      multi: ["first value", "second value"],
    })).toBe(
      "/admin/questions?foo=bar+baz&multi=first+value&multi=second+value&search=zero+trust&certificationId=cert-1&status=published&difficulty=hard&sort=stem-desc&page=3",
    );

    expect(buildQuestionsIndexHref("/admin/questions", {
      search: undefined,
      page: undefined,
    })).toBe("/admin/questions");
  });

  it("preserves unrelated params verbatim during href serialization", () => {
    expect(buildQuestionsIndexHref("/admin/questions", {
      search: [" zero trust ", "ignored"],
      certificationId: " cert-1 ",
      page: [" 5 ", "7"],
      foo: "  keep spacing  ",
      empty: "",
      multi: ["", " second "],
    })).toBe(
      "/admin/questions?foo=++keep+spacing++&empty=&multi=&multi=+second+&search=zero+trust&certificationId=cert-1&page=5",
    );
  });
});
