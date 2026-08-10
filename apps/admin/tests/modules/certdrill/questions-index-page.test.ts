import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { listCertDrillAdminQuestionIndexServer } = vi.hoisted(() => ({
  listCertDrillAdminQuestionIndexServer: vi.fn(),
}));

vi.mock("@/lib/api/certdrill.server", () => ({
  listCertDrillAdminQuestionIndexServer,
}));

vi.mock("@/modules/certdrill/admin-actions", () => ({
  archiveCertDrillQuestionAction: vi.fn(),
  publishCertDrillQuestionAction: vi.fn(),
  publishSelectedCertDrillQuestionsAction: vi.fn(),
  unpublishSelectedCertDrillQuestionsAction: vi.fn(),
  setSelectedCertDrillQuestionsPracticeAction: vi.fn(),
  setSelectedCertDrillQuestionsAssessmentAction: vi.fn(),
}));

vi.mock("@/modules/certdrill/questions-index-filter-bar", () => ({
  QuestionsIndexFilterBar: ({ query }: { query: Record<string, string | number | undefined> }) => createElement("div", {
    "data-testid": "filter-bar",
    "data-search": query.search ?? "",
    "data-certification-id": query.certificationId ?? "",
    "data-category-id": query.categoryId ?? "",
    "data-status": query.status ?? "",
    "data-difficulty": query.difficulty ?? "",
    "data-sort": query.sort ?? "",
    "data-page": String(query.page ?? ""),
  }),
}));

vi.mock("@/modules/certdrill/questions-index-table", () => ({
  QuestionsIndexTable: ({
    sort,
    sortHref,
    previousHref,
    nextHref,
  }: {
    sort: string;
    sortHref?: string;
    previousHref?: string;
    nextHref?: string;
  }) => createElement("div", {
    "data-testid": "questions-table",
    "data-sort": sort,
    "data-sort-href": sortHref ?? "",
    "data-previous-href": previousHref ?? "",
    "data-next-href": nextHref ?? "",
  }),
}));

import { QuestionsIndexPage } from "@/modules/certdrill/questions-index-page";

describe("QuestionsIndexPage", () => {
  beforeEach(() => {
    listCertDrillAdminQuestionIndexServer.mockReset();
  });

  it("uses the server-authoritative query for displayed filters, sort, and hrefs while preserving unrelated params", async () => {
    listCertDrillAdminQuestionIndexServer.mockResolvedValueOnce({
      query: {
        search: "zero trust",
        certificationId: "cert-1",
        categoryId: undefined,
        status: undefined,
        difficulty: undefined,
        sort: "stem-asc",
        page: 2,
      },
      items: [
        {
          questionId: "question-1",
          stem: "Question",
          status: "draft",
          difficulty: "easy",
          certificationId: "cert-1",
          certificationCode: "AZ-104",
          certificationName: "Azure Administrator",
          categoryId: "category-1",
          categoryCode: "identity",
          categoryName: "Identity",
          options: [],
        },
      ],
      certifications: [{ id: "cert-1", code: "AZ-104", name: "Azure Administrator" }],
      categories: [{ id: "category-1", certificationId: "cert-1", code: "identity", name: "Identity" }],
      page: 2,
      pageCount: 4,
      pageSize: 50,
      total: 151,
    });

    const markup = renderToStaticMarkup(await QuestionsIndexPage({
      searchParams: {
        search: [" zero trust ", "ignored"],
        certificationId: " cert-1 ",
        categoryId: "category-2",
        status: "retired",
        difficulty: "expert",
        sort: "recent",
        page: "0",
        foo: "bar",
        multi: ["first", "second"],
      },
    }));

    expect(listCertDrillAdminQuestionIndexServer).toHaveBeenCalledWith({
      search: "zero trust",
      certificationId: "cert-1",
      categoryId: "category-2",
      status: "retired",
      difficulty: "expert",
      sort: "recent",
      page: "0",
    });
    expect(markup).toContain('data-testid="filter-bar"');
    expect(markup).toContain('data-search="zero trust"');
    expect(markup).toContain('data-certification-id="cert-1"');
    expect(markup).toContain('data-category-id=""');
    expect(markup).toContain('data-status=""');
    expect(markup).toContain('data-difficulty=""');
    expect(markup).toContain('data-sort="stem-asc"');
    expect(markup).toContain('data-page="2"');
    expect(markup).toContain('data-testid="questions-table"');
    expect(markup).toContain('data-sort="stem-asc"');
    expect(markup).toContain('data-sort-href="/admin/questions?foo=bar&amp;multi=first&amp;multi=second&amp;search=zero+trust&amp;certificationId=cert-1&amp;sort=stem-desc"');
    expect(markup).toContain('data-previous-href="/admin/questions?foo=bar&amp;multi=first&amp;multi=second&amp;search=zero+trust&amp;certificationId=cert-1&amp;sort=stem-asc&amp;page=1"');
    expect(markup).toContain('data-next-href="/admin/questions?foo=bar&amp;multi=first&amp;multi=second&amp;search=zero+trust&amp;certificationId=cert-1&amp;sort=stem-asc&amp;page=3"');
    expect(markup).not.toContain("status=retired");
    expect(markup).not.toContain("difficulty=expert");
    expect(markup).not.toContain("sort=recent");
    expect(markup).not.toContain("categoryId=category-2");
  });
});
