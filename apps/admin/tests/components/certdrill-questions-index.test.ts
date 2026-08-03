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
    expect(tableSource).toContain('<TableHead aria-sort={sort === "stem-desc" ? "descending" : "ascending"}>');
    expect(tableSource).toContain("Question");
    expect(tableSource).toContain("<TableHead>Status</TableHead>");
    expect(tableSource).toContain("<TableHead>Difficulty</TableHead>");
    expect(tableSource).toContain('className="text-right">Actions</TableHead>');
    expect(tableSource).toContain('{sort === "stem-desc" ? "↓" : "↑"}');
    expect(tableSource).not.toContain("<TableHead>ID</TableHead>");
    expect(tableSource).not.toContain('>Options</TableHead>');
  });

  it("keeps a single expanded question id with click and keyboard row toggles", () => {
    expect(tableSource).toContain("const [expandedQuestionId, setExpandedQuestionId] = useState<string>();");
    expect(tableSource).toContain("setExpandedQuestionId((currentQuestionId) => currentQuestionId === questionId ? undefined : questionId);");
    expect(tableSource).toContain("tabIndex={0}");
    expect(tableSource).toContain("aria-expanded={isExpanded}");
    expect(tableSource).toContain("onClick={() => toggleExpandedQuestion(question.questionId)}");
    expect(tableSource).toContain('event.key === "Enter"');
    expect(tableSource).toContain('event.key === " "');
    expect(tableSource).toContain("event.preventDefault();");
  });

  it("stops propagation for the editor link and shared actions menu", () => {
    expect(tableSource).toContain("function stopRowToggle(");
    expect(tableSource).toContain("event.stopPropagation();");
    expect(tableSource).toContain("onClick={stopRowToggle}");
    expect(tableSource).toContain("onKeyDown={stopRowToggle}");
    expect(tableSource).toContain("<QuestionActionsMenu");
  });

  it("renders expanded answers directly below the active row without citations or media metadata", () => {
    expect(tableSource).toContain("isExpanded ? (");
    expect(tableSource).toContain("<TableRow key={`${question.questionId}-details`}>");
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
