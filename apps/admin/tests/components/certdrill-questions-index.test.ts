import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch {
    return "";
  }
}

const tableSource = readSource("../../src/modules/certdrill/questions-index-table.tsx");
const helperSource = readSource("../../src/modules/certdrill/question-editor-href.ts");
const adminPageSource = readSource("../../src/modules/certdrill/admin-page.tsx");
const questionsIndexPageSource = readSource("../../src/modules/certdrill/questions-index-page.tsx");
const questionsRouteSource = readSource("../../src/app/[locale]/(backend)/(admin)/admin/questions/page.tsx");

describe("questions index table source", () => {
  it("defines a focused client component around the centralized question index result", () => {
    expect(tableSource).toContain('"use client"');
    expect(tableSource).toContain("export function QuestionsIndexTable(");
    expect(tableSource).toContain("result?: Pick<CertDrillAdminQuestionIndexResult");
    expect(tableSource).toContain("items?: CertDrillAdminQuestionIndexItem[];");
    expect(tableSource).toContain("sort: CertDrillAdminQuestionIndexSort;");
    expect(tableSource).toContain("sortHref?: string;");
    expect(tableSource).toContain("previousHref?: string;");
    expect(tableSource).toContain("nextHref?: string;");
    expect(tableSource).toContain("publishAction: (formData: FormData) => void | Promise<void>;");
    expect(tableSource).toContain("archiveAction: (formData: FormData) => void | Promise<void>;");
  });

  it("renders exactly the required columns and a sortable question header", () => {
    expect(tableSource).toContain("<TableHead>Certification</TableHead>");
    expect(tableSource).toContain("<TableHead>Category</TableHead>");
    expect(tableSource).toContain('<TableHead aria-sort={sortHref ? (sort === "stem-desc" ? "descending" : "ascending") : "none"}>');
    expect(tableSource).toContain("Question");
    expect(tableSource).toContain("<TableHead>Status</TableHead>");
    expect(tableSource).toContain("<TableHead>Difficulty</TableHead>");
    expect(tableSource).toContain('className="text-right">Actions</TableHead>');
    expect(tableSource).toContain('{sort === "stem-desc" ? "↓" : "↑"}');
    expect(tableSource).not.toContain("<TableHead>ID</TableHead>");
    expect(tableSource).not.toContain('>Options</TableHead>');
  });

  it("keeps a single expanded question id with a dedicated disclosure button and mouse row toggles", () => {
    expect(tableSource).toContain("const [expandedQuestionId, setExpandedQuestionId] = useState<string>();");
    expect(tableSource).toContain("setExpandedQuestionId((currentQuestionId) => currentQuestionId === questionId ? undefined : questionId);");
    expect(tableSource).toContain("const detailsId = `question-details-${question.questionId}`;");
    expect(tableSource).toContain("type=\"button\"");
    expect(tableSource).toContain("aria-expanded={isExpanded}");
    expect(tableSource).toContain("aria-controls={detailsId}");
    expect(tableSource).toContain('aria-label={isExpanded ? `Hide answers for ${question.stem}` : `Show answers for ${question.stem}`}');
    expect(tableSource).toContain('{isExpanded ? "Hide answers" : "Show answers"}');
    expect(tableSource).toContain("onClick={() => toggleExpandedQuestion(question.questionId)}");
    expect(tableSource).toContain("stopRowToggle(event);");
    expect(tableSource).not.toContain("tabIndex={0}");
    expect(tableSource).not.toContain("handleRowKeyDown");
    expect(tableSource).not.toContain('event.key === "Enter"');
    expect(tableSource).not.toContain('event.key === " "');
  });

  it("stops propagation for the editor link and shared actions menu", () => {
    expect(tableSource).toContain("function stopRowToggle(");
    expect(tableSource).toContain("event.stopPropagation();");
    expect(tableSource).toContain("onClick={stopRowToggle}");
    expect(tableSource).not.toContain("onKeyDown={stopRowToggle}");
    expect(tableSource).toContain("<QuestionActionsMenu");
  });

  it("renders expanded answers directly below the active row without citations or media metadata", () => {
    expect(tableSource).toContain("isExpanded ? (");
    expect(tableSource).toContain("<TableRow key={`${question.questionId}-details`}>");
    expect(tableSource).toContain("<div id={detailsId} className=\"space-y-3 py-2\">");
    expect(tableSource).toContain("<TableCell colSpan={6}");
    expect(tableSource).toContain("question.options.toSorted((first, second) => first.sortOrder - second.sortOrder)");
    expect(tableSource).toContain("Correct");
    expect(tableSource).toContain("Incorrect");
    expect(tableSource).toContain("option.explanation ?");
    expect(tableSource).toContain("No answer options.");
    expect(tableSource.toLowerCase()).not.toContain("citation");
    expect(tableSource.toLowerCase()).not.toContain("media");
  });

  it("shows the question range, current page, and disabled previous/next boundaries", () => {
    expect(tableSource).toContain("Showing {rangeStart} to {rangeEnd} of {total}");
    expect(tableSource).toContain("Page {page} of {pageCount}");
    expect(tableSource).toContain("const hasPreviousPage = page > 1 && Boolean(previousHref);");
    expect(tableSource).toContain("const hasNextPage = page < pageCount && Boolean(nextHref);");
    expect(tableSource).toContain("<LocalizedLink href={previousHref}>Previous</LocalizedLink>");
    expect(tableSource).toContain("<LocalizedLink href={nextHref}>Next</LocalizedLink>");
    expect(tableSource).toContain(': <Button variant="outline" size="sm" disabled>Previous</Button>');
    expect(tableSource).toContain(': <Button variant="outline" size="sm" disabled>Next</Button>');
  });
});

describe("question editor href helper source", () => {
  it("extracts the question editor hrefs into a focused shared module", () => {
    expect(helperSource).toContain("export function questionEditorNewHref(certificationId: string)");
    expect(helperSource).toContain("return `/admin/certdrill/${certificationId}/questions/new`;");
    expect(helperSource).toContain("export function questionEditorHref(certificationId: string, questionId: string)");
    expect(helperSource).toContain("return `/admin/certdrill/${certificationId}/questions/${questionId}`;");
    expect(adminPageSource).toContain('from "./question-editor-href"');
    expect(tableSource).toContain('from "./question-editor-href"');
  });
});

describe("questions index page source", () => {
  it("defines a server component that fetches the centralized admin question index and composes the filter bar and table", () => {
    expect(questionsIndexPageSource).toContain("export async function QuestionsIndexPage(");
    expect(questionsIndexPageSource).toContain("listCertDrillAdminQuestionIndexServer");
    expect(questionsIndexPageSource).toContain("QuestionsIndexFilterBar");
    expect(questionsIndexPageSource).toContain("QuestionsIndexTable");
    expect(questionsIndexPageSource).toContain("publishCertDrillQuestionAction");
    expect(questionsIndexPageSource).toContain("archiveCertDrillQuestionAction");
    expect(questionsIndexPageSource).toContain("await listCertDrillAdminQuestionIndexServer(");
    expect(questionsIndexPageSource).toContain("<QuestionsIndexFilterBar");
    expect(questionsIndexPageSource).toContain("<QuestionsIndexTable");
  });

  it("shows the approved copy without a create question control", () => {
    expect(questionsIndexPageSource).toContain("<Badge variant=\"secondary\">Questions</Badge>");
    expect(questionsIndexPageSource).toContain("<h1");
    expect(questionsIndexPageSource).toContain(">Questions</h1>");
    expect(questionsIndexPageSource).toContain("Search and manage questions across every certification and category.");
    expect(questionsIndexPageSource).toContain("<CardTitle>Question bank</CardTitle>");
    expect(questionsIndexPageSource).toContain("Click any row to review answers, edit the question, or manage its status.");
    expect(questionsIndexPageSource).not.toContain("Create question");
  });

  it("uses the server-authoritative query for filter state and sort or pagination hrefs", () => {
    expect(questionsIndexPageSource).toContain("const effectiveQuery = result.query;");
    expect(questionsIndexPageSource).toContain("const hrefQuery = mergeQuestionsIndexQuery(searchParams, effectiveQuery);");
    expect(questionsIndexPageSource).toContain("buildQuestionsIndexSortQuery(hrefQuery,");
    expect(questionsIndexPageSource).toContain("buildQuestionsIndexPageQuery(hrefQuery, result.page - 1");
    expect(questionsIndexPageSource).toContain("buildQuestionsIndexPageQuery(hrefQuery, result.page + 1");
    expect(questionsIndexPageSource).toContain("buildQuestionsIndexHref(\"/admin/questions\"");
    expect(questionsIndexPageSource).toContain("result.page > 1");
    expect(questionsIndexPageSource).toContain("result.page < result.pageCount");
  });

  it("renders filters even when the current page is empty and shows the focused empty state", () => {
    expect(questionsIndexPageSource).toContain("<QuestionsIndexFilterBar");
    expect(questionsIndexPageSource).toContain("No questions match the current filters.");
    expect(questionsIndexPageSource).toContain("result.items.length > 0 ? (");
    expect(questionsIndexPageSource).toContain(": <EmptyState>No questions match the current filters.</EmptyState>");
  });
});

describe("centralized admin questions route source", () => {
  it("accepts promise-based search params and renders the page in the standard container without pre-normalizing managed filters", () => {
    expect(questionsRouteSource).toContain("type SearchParamValue = string | string[] | undefined;");
    expect(questionsRouteSource).toContain("searchParams: Promise<Record<string, SearchParamValue>>");
    expect(questionsRouteSource).toContain("const query = await searchParams;");
    expect(questionsRouteSource).toContain("<Container className=\"py-6\">");
    expect(questionsRouteSource).toContain("<QuestionsIndexPage searchParams={query} />");
  });
});
