import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/modules/certdrill/admin-page.tsx", import.meta.url), "utf8");
const questionFormSource = readFileSync(
  new URL("../../src/modules/certdrill/question-form.tsx", import.meta.url),
  "utf8",
);
const questionFilterBarSource = readFileSync(
  new URL("../../src/modules/certdrill/question-filter-bar.tsx", import.meta.url),
  "utf8",
);
const questionActionsMenuSource = readFileSync(
  new URL("../../src/modules/certdrill/question-actions-menu.tsx", import.meta.url),
  "utf8",
);
const apiSource = readFileSync(new URL("../../src/lib/api/certdrill.server.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../../src/modules/certdrill/admin-actions.ts", import.meta.url), "utf8");
const ingestResourceActionSource = actionsSource.slice(
  actionsSource.indexOf("export async function ingestCertDrillResourceAction(formData: FormData) {"),
  actionsSource.indexOf("export async function createCertDrillMockGenerationAction(formData: FormData) {"),
);
const routeSource = readFileSync(
  new URL("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/page.tsx", import.meta.url),
  "utf8",
);
const detailRouteSource = readFileSync(
  new URL("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/page.tsx", import.meta.url),
  "utf8",
);
const newQuestionRouteSource = readFileSync(
  new URL("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/new/page.tsx", import.meta.url),
  "utf8",
);
const editQuestionRouteSource = readFileSync(
  new URL("../../src/app/[locale]/(backend)/(admin)/admin/certdrill/[certificationId]/questions/[questionId]/page.tsx", import.meta.url),
  "utf8",
);
const certificationOverviewSource = source.slice(
  source.indexOf("function AdminCertificationOverviewTable"),
  source.indexOf("function CategoryTable"),
);
const certificationArchiveFormSource = source.slice(
  source.indexOf("<form action={archiveCertDrillCertificationAction}>"),
  source.indexOf("</form>", source.indexOf("<form action={archiveCertDrillCertificationAction}>")),
);

describe("CertDrill admin page copy", () => {
  it("uses a client-side question filter toolbar", () => {
    expect(source).toContain('import { QuestionFilterBar } from "./question-filter-bar";');
    expect(source).toContain("<QuestionFilterBar");
    expect(source).not.toContain("QuestionFilterForm");
    expect(source).not.toContain("Apply filters");
    expect(questionFilterBarSource).toContain('"use client"');
    expect(questionFilterBarSource).toContain("useRouter");
    expect(questionFilterBarSource).toContain("usePathname");
    expect(questionFilterBarSource).toContain("useSearchParams");
    expect(questionFilterBarSource).toContain("setTimeout");
    expect(questionFilterBarSource).toContain("250");
    expect(questionFilterBarSource).toContain("router.replace(");
    expect(questionFilterBarSource).toContain("scroll: false");
  });

  it("drops the one-shot imported confirmation flag when filters navigate", () => {
    expect(questionFilterBarSource).toContain('params.delete("imported");');
  });

  it("shows management tabs and primary form labels", () => {
    expect(source).toContain("Categories");
    expect(source).toContain("Questions");
    expect(source).toContain("Exam Forms");
    expect(source).toContain("Resources");
    expect(source).toContain("Generate");
    expect(source).toContain("Feedback");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
    expect(source).toContain("Certification overview");
    expect(source).toContain("Back to certifications");
    expect(source).toContain("Update certification details");
    expect(source).toContain("Selected certification");
    expect(source).toContain("Click to view or update certification details.");
    expect(source).toContain("DialogTrigger");
    expect(source).toContain("DialogTrigger");
    expect(source).toContain("Logo URL");
    expect(source).toContain("certification.logoUrl");
    expect(source).toContain("selectedCatalogCertification");
    expect(source).toContain("selectedQuestionIds");
    expect(source).toContain("allQuestionFeedback.filter");
    expect(source).not.toContain('<TabsTrigger value="certifications">Certifications</TabsTrigger>');
    expect(source).not.toContain('<CardTitle>Create or update certification</CardTitle>');
    expect(source).not.toContain("<CardTitle>Archive certification</CardTitle>");
    expect(source).toContain("Enabled at");
    expect(source).toContain("Create category");
    expect(source).toContain("Update category");
    expect(source).toContain("Archive category");
    expect(source).toContain("Pencil");
    expect(source).toContain("Create or update question");
    expect(source).toContain("Publish");
    expect(source).toContain("Create or update exam form");
    expect(source).toContain("Create or update resource");
    expect(source).toContain("Mock generation");
    expect(source).toContain("Draft questions");
  });

  it("wires resource ingestion through the api, server action, and table copy", () => {
    expect(apiSource).toContain("ingestedAt?: Nullable<string>;");
    expect(apiSource).toContain("ingestError?: Nullable<string>;");
    expect(apiSource).toContain("export async function ingestCertDrillAdminResourceServer(resourceId: string): Promise<CertDrillAdminResource>");
    expect(apiSource).toContain('return certdrillAdminRequest<CertDrillAdminResource>(`/resources/${resourceId}/ingest`, jsonRequestInit("POST", {}));');
    expect(actionsSource).toContain("ingestCertDrillAdminResourceServer");
    expect(ingestResourceActionSource).toContain(`export async function ingestCertDrillResourceAction(formData: FormData) {
  const resourceId = requiredString(formData, "resourceId");
  if (!resourceId) {
    throw new Error("Resource ID is required.");
  }

  try {
    await ingestCertDrillAdminResourceServer(resourceId);
  } finally {
    revalidateCertDrillAdminPage();
  }
}`);
    expect(source).toContain("ingestCertDrillResourceAction");
    expect(source).toContain("<TableHead>Actions</TableHead>");
    expect(source).toContain('type="hidden" name="resourceId" value={resource.id}');
    expect(source).toContain('{resource.status === "ingested" ? "Refresh" : "Ingest"}');
    expect(source).toContain("Snapshot:");
    expect(source).toContain("Ingest error:");
    expect(source).toContain("resource.ingestedAt");
    expect(source).toContain("resource.ingestError");
  });

  it("keeps the selected certification archive form wired to the destructive action", () => {
    expect(certificationArchiveFormSource).toContain(
      "<form action={archiveCertDrillCertificationAction}>",
    );
    expect(certificationArchiveFormSource).toContain(
      '<input type="hidden" name="certificationId" value={selectedAdminCertification.id} />',
    );
    expect(certificationArchiveFormSource).toContain(
      '<Button type="submit" variant="destructive" size="sm">Archive</Button>',
    );
  });

  it("links overview cards to certification details without nested actions", () => {
    expect(certificationOverviewSource).toContain("<LocalizedLink");
    expect(certificationOverviewSource).toContain("href={certdrillAdminDetailHref(certification.id)}");
    expect(certificationOverviewSource).toContain("key={certification.id}");
    expect(certificationOverviewSource).not.toContain("<Link key={certification.id}");
    expect(certificationOverviewSource).toContain("Card");
    expect(certificationOverviewSource).not.toContain("Open details");
    expect(certificationOverviewSource).not.toContain("Archive certification");
    expect(certificationOverviewSource).not.toContain("<form action={archiveCertDrillCertificationAction}>");
    expect(certificationOverviewSource).toContain("certification.logoUrl");
    expect(certificationOverviewSource).toContain("publishedQuestionCount");
    expect(certificationOverviewSource).toContain(
      '<Card className="flex h-full flex-col transition-colors group-hover:border-primary/40">',
    );
    expect(certificationOverviewSource).toContain(
      '<CardDescription className="min-h-10 line-clamp-2">',
    );
    expect(certificationOverviewSource).toContain(
      '<CardContent className="flex flex-1 flex-col justify-end">',
    );
  });

  it("shows question feedback review copy and fields", () => {
    expect(source).toContain("Question feedback");
    expect(source).toContain("Review user feedback and dispute reports for the selected certification.");
    expect(source).toContain("Filter feedback by status");
    expect(source).toContain("All feedback statuses");
    expect(source).toContain("Mark reviewed");
    expect(source).toContain("Mark resolved");
    expect(source).toContain("FeedbackStatusFilter");
    expect(source).toContain("filterQuestionFeedback");
    expect(source).toContain("feedbackStatus?: string;");
    expect(detailRouteSource).toContain("feedbackStatus={firstSearchParamString(feedbackStatus)}");
    expect(source).toContain("FeedbackTable");
    expect(source).toContain("Rating");
    expect(source).toContain("Dispute");
    expect(source).toContain("Message");
    expect(source).toContain("Question ID");
    expect(source).toContain("User ID");
    expect(source).toContain("Status");
    expect(source).toContain("Actions");
    expect(actionsSource).toContain("updateCertDrillQuestionFeedbackAction");
    expect(actionsSource).toContain('feedbackStatusValue(formData)');
    expect(actionsSource).toContain('requiredString(formData, "feedbackId")');
  });

  it("shows question filter controls and accepts filter query params", () => {
    expect(questionFilterBarSource).toContain("Search questions");
    expect(questionFilterBarSource).toContain("Filter by category");
    expect(questionFilterBarSource).toContain("Filter by status");
    expect(questionFilterBarSource).toContain("Filter by difficulty");
    expect(questionFilterBarSource).not.toContain("Sort by");
    expect(questionFilterBarSource).not.toContain('id="question-sort"');
    expect(questionFilterBarSource.match(/params\.delete\("questionPage"\);/g)).toHaveLength(2);
    expect(source).toContain("questionSearch");
    expect(source).toContain("questionStatus");
    expect(source).toContain("questionDifficulty");
    expect(source).toContain("questionCategoryId");
    expect(source).toContain("questionSort");
    expect(source).toContain("filterCertDrillAdminQuestions");
    expect(detailRouteSource).toContain("questionSearch");
    expect(detailRouteSource).toContain("questionStatus");
    expect(detailRouteSource).toContain("questionDifficulty");
    expect(detailRouteSource).toContain("questionCategoryId");
    expect(detailRouteSource).toContain("questionSort");
  });

  it("paginates the server-filtered question table and preserves page routing", () => {
    expect(source).toContain("questionPage?: string;");
    expect(source).toContain("questionTableQuery?: QuestionTableQuery;");
    expect(source).toContain("const currentQuestionTableQuery = questionTableQuery ??");
    expect(source).toContain("if (item !== undefined) searchParams.append(key, item);");
    expect(source).toContain("} else if (value !== undefined) {");
    expect(source).toContain("paginateQuestions");
    expect(source).toContain("Stem A-Z");
    expect(source).toContain("Stem Z-A");
    expect(source).toContain('aria-sort={sort === "stem-desc" ? "descending" : "ascending"}');
    expect(source).toContain('{sort === "stem-desc" ? "↓" : "↑"}');
    expect(source).toContain("questionPage");
    expect(source).toContain("Page {page} of {pageCount}");
    expect(source).toContain("<LocalizedLink href={previousPageHref}>Previous</LocalizedLink>");
    expect(source).toContain("<LocalizedLink href={nextPageHref}>Next</LocalizedLink>");
    expect(source).toContain(': <Button variant="outline" size="sm" disabled>Previous</Button>');
    expect(source).toContain(': <Button variant="outline" size="sm" disabled>Next</Button>');
    expect(detailRouteSource).toContain("questionPage={firstSearchParamString(questionPage)}");
    expect(detailRouteSource).toContain("searchParams: Promise<Record<string, SearchParamValue>>");
    expect(detailRouteSource).toContain("questionTableQuery={query}");
  });

  it("keeps category labels out of free-text question matches", () => {
    expect(source).not.toContain("category?.code ??");
    expect(source).not.toContain("category?.name ??");
  });

  it("guards live question search state against stale navigations", () => {
    expect(questionFilterBarSource).toContain(
      "const currentQueryParamsRef = useRef(new URLSearchParams(searchParams.toString()));",
    );
    expect(questionFilterBarSource).toContain(
      "const params = new URLSearchParams(currentQueryParamsRef.current);",
    );
    expect(questionFilterBarSource).toContain("currentQueryParamsRef.current = params;");
    expect(questionFilterBarSource).toContain("searchDebounceRef");
    expect(questionFilterBarSource).toContain("searchNavigationVersionRef");
    expect(questionFilterBarSource).toContain("pendingSearchNavigationsRef");
    expect(questionFilterBarSource).toContain("clearTimeout(searchDebounceRef.current)");
    expect(questionFilterBarSource).toContain("pendingSearchNavigationsRef.current.push");
    expect(questionFilterBarSource).toContain("matchingNavigationIndex");
    expect(questionFilterBarSource).toContain('setSearch("")');
    expect(questionFilterBarSource).toContain('params.delete("categoryId");');
    expect(questionFilterBarSource).toContain(
      'if (name === "questionCategoryId") params.delete("categoryId");',
    );
  });

  it("opens filtered questions when selecting a category", () => {
    expect(source).toContain('selectedCertificationHref({ questionCategoryId: category.id, tab: "questions" })');
    expect(source).toContain("selectedTab?: string;");
    expect(source).toContain('selectedTab === "questions"');
    expect(source).toContain('<Tabs key={defaultTab} defaultValue={defaultTab}');
    expect(detailRouteSource).toContain("selectedTab={firstSearchParamString(tab)}");
  });

  it("normalizes array search params before passing string-only filters", () => {
    expect(detailRouteSource).toContain("type SearchParamValue = string | string[] | undefined");
    expect(detailRouteSource).toContain("firstSearchParamString");
    expect(detailRouteSource).toContain("searchParams: Promise<Record<string, SearchParamValue>>");
    expect(detailRouteSource).toContain("selectedCategoryId={firstSearchParamString(categoryId)}");
    expect(detailRouteSource).toContain("questionSearch={firstSearchParamString(questionSearch)}");
    expect(detailRouteSource).toContain("questionSort={firstSearchParamString(questionSort)}");
    expect(source).toContain("questionSearch?: string;");
    expect(source).not.toContain("questionSearch?: string | string[]");
    expect(source).not.toContain("Array.isArray(questionSearch)");
  });

  it("wires the focused question editor into the admin page", () => {
    expect(source).toContain('import { QuestionForm } from "./question-form";');
    expect(source).toContain("<QuestionForm");
    expect(source).not.toContain("MarkdownTextareaWithPreview");
    expect(source).not.toContain("function QuestionFormFields");
    expect(questionFormSource).toContain("Question details");
    expect(questionFormSource).toContain("Overview");
    expect(questionFormSource).not.toContain("Stem preview");
    expect(questionFormSource).not.toContain("Explanation preview");
    expect(questionFormSource).not.toContain("Clear source resource");
    expect(questionFormSource).not.toContain("Source resource ID");
  });

  it("shows new-record controls for every editable tab", () => {
    expect(source).toContain("New certification");
    expect(source).toContain("Create category");
    expect(source).toContain("Create question");
    expect(source).toContain("New exam form");
    expect(source).toContain("New resource");
  });

  it("uses dedicated routes for question editing", () => {
    expect(source).toContain("questionEditorNewHref(selectedCertificationId)");
    expect(source).toContain("questionEditorHref(selectedCertificationId, question.id)");
    expect(newQuestionRouteSource).toContain("CertDrillQuestionEditorPage");
    expect(editQuestionRouteSource).toContain("CertDrillQuestionEditorPage");
    expect(editQuestionRouteSource).toContain("questionId");
    expect(questionFormSource).toContain("<CardTitle>Question details</CardTitle>");
    expect(questionFormSource).toContain("<CardTitle>Answers</CardTitle>");
    expect(questionFormSource.indexOf("<CardTitle>Question details</CardTitle>"))
      .toBeLessThan(questionFormSource.indexOf("<CardTitle>Answers</CardTitle>"));
  });

  it("uses localized links for dedicated question editor navigation", () => {
    expect(source).toContain('import { Link as LocalizedLink } from "@/i18n/navigation";');
    expect(source).toContain('<LocalizedLink href={certdrillAdminDetailHref(certificationId, { tab: "questions" })}>Back to questions</LocalizedLink>');
    expect(source).toContain('<LocalizedLink href={questionEditorNewHref(selectedCertificationId)}>Create question</LocalizedLink>');
    expect(source).toContain("compactQuestionId(question.id)");
    expect(source).toContain('aria-label={`Open question ${question.id}`}');
    expect(source).toContain('<LocalizedLink href={questionHref(question)} className="hover:underline">{question.stem}</LocalizedLink>');
  });

  it("shares question publishing and archiving through a focused row actions menu", () => {
    expect(source).toContain('import { QuestionActionsMenu } from "./question-actions-menu";');
    expect(source).toContain("<QuestionActionsMenu");
    expect(source).toContain('<TableHead className="text-right">Actions</TableHead>');
    expect(source).toContain('edit={<LocalizedLink href={questionHref(question)}>Edit</LocalizedLink>}');
    expect(source).toContain('publishAction={publishAction}');
    expect(source).toContain('archiveAction={archiveAction}');
    expect(source).not.toContain('from "@/components/ui/dropdown-menu"');
    expect(source).not.toContain("<DropdownMenu");
    expect(source).not.toContain("MoreHorizontal");
    expect(questionActionsMenuSource).toContain('"use client"');
    expect(questionActionsMenuSource).toContain("DropdownMenu");
    expect(questionActionsMenuSource).toContain("DropdownMenuSeparator");
    expect(questionActionsMenuSource).toContain("function stopPropagation(");
    expect(questionActionsMenuSource).toContain("event.stopPropagation();");
    expect(questionActionsMenuSource).toContain("onClick={stopPropagation}");
    expect(questionActionsMenuSource).toContain('const questionStatus = status ?? "draft";');
    expect(questionActionsMenuSource).toContain("{edit}");
    expect(source).toContain('const questionStatus = question.status ?? "draft";');
    expect(questionActionsMenuSource).toContain('questionStatus === "draft"');
    expect(questionActionsMenuSource).toContain('questionStatus !== "archived"');
    expect(questionActionsMenuSource).toContain(">Publish</button>");
    expect(questionActionsMenuSource).toContain(">Archive</button>");
    expect(questionActionsMenuSource).toContain('id={`publish-question-${questionId}`}');
    expect(questionActionsMenuSource).toContain('id={`archive-question-${questionId}`}');
    expect(source).not.toContain("<CardTitle>Publish question</CardTitle>");
    expect(source).toContain("publishAction={publishCertDrillQuestionAction}");
    expect(source).toContain("archiveAction={archiveCertDrillQuestionAction}");
    expect(actionsSource).toContain("archiveCertDrillQuestionAction");
    expect(actionsSource).toContain('updateCertDrillAdminQuestionServer(questionId, { status: "archived" })');
  });

  it("revalidates both certification and centralized questions pages after admin mutations", () => {
    expect(actionsSource).toContain('revalidatePath("/[locale]/admin/certdrill", "page");');
    expect(actionsSource).toContain('revalidatePath("/admin/certdrill");');
    expect(actionsSource).toContain('revalidatePath("/[locale]/admin/questions", "page");');
    expect(actionsSource).toContain('revalidatePath("/admin/questions");');
  });

  it("loads and identifies the selected certification in the dedicated question editor", () => {
    expect(source).toContain("getCertDrillCertificationsServer");
    expect(source).toContain("listCertDrillAdminCertificationsServer()");
    expect(source).toContain("getCertDrillCertificationsServer(),");
    expect(source).toContain("adminCertifications.find((certification) => certification.id === certificationId)");
    expect(source).toContain("certifications.find((certification) => certification.id === certificationId)");
    expect(source).toContain("const certificationContext = selectedCatalogCertification ?? selectedAdminCertification;");
    expect(source).toContain("if (!selectedAdminCertification) {");
    expect(source).not.toContain("if (!selectedAdminCertification || !selectedCatalogCertification) {");
    expect(source).toContain('${selectedQuestion ? "Update" : "Create"} question for ${certificationContext.code}');
    expect(source).toContain('${selectedQuestion ? "Update the selected question for" : "Create a question for"} ${certificationContext.code} - ${certificationContext.name}.');
  });

  it("shows read-only exam mode defaults and active forms", () => {
    expect(source).toContain("Quick Drill count");
    expect(source).toContain("Category Drill count");
    expect(source).toContain("Default Category Drill count");
    expect(source).toContain("Category Drill override");
    expect(source).toContain("Leave empty to use the certification default.");
    expect(source).toContain("Exam Simulation count");
    expect(source).toContain("Exam Simulation duration");
    expect(source).toContain("Active Exam Forms");
  });

  it("shows explicit admin form validation guidance", () => {
    expect(source).toContain("Required");
    expect(source).toContain("Code is required and should match the exam code, for example AZ-104.");
    expect(source).toContain("Vendor is required. Use an existing vendor name when possible.");
    expect(source).toContain("Weights must be numeric, use at most 2 decimals, and sibling totals cannot exceed 100.");
    expect(questionFormSource).toContain("Add at least two answers. Select the correct answer before publishing.");
    expect(source).toContain("URLs must start with http:// or https://.");
    expect(source).toContain("Must be between 0 and 100.");
    expect(source).toContain("Must be 1 or greater.");
    expect(source).toContain("At least one question is required for an exam form.");
    expect(source).toContain("TextField id={`${idPrefix}-code`} name=\"code\" label=\"Code\" required");
    expect(source).toContain("VendorField id={`${idPrefix}-vendor`} vendors={vendors} selectedCertification={selectedCertification} required");
    expect(source).toContain("helperText");
  });

  it("shows exam form question picker and duplicate prevention copy", () => {
    expect(source).toContain("Question picker");
    expect(source).toContain("Current form distribution");
    expect(source).toContain("Category distribution");
    expect(source).toContain("Select questions to build a distribution after saving.");
    expect(source).toContain("Duplicate question IDs are removed before saving.");
    expect(source).toContain("Optional: paste IDs instead of using picker");
    expect(source).toContain("QuestionPickerTable");
    expect(source).toContain('type="hidden" name="questionPickerPresent" value="1"');
    expect(source).toContain('name="selectedQuestionIds"');
    expect(source).toContain("defaultChecked={selectedQuestionIds.has(question.id)}");
    expect(source).toContain("buildCategoryDistribution");
    expect(source).toContain("selectedExamForm?.questionIds");
    expect(source).toContain("defaultValue={undefined}");
    expect(source).not.toContain('label="Question IDs" placeholder="Comma-separated question IDs" defaultValue={csvDefault(selectedExamForm?.questionIds)}');
    expect(actionsSource).toContain("examFormQuestionIds");
    expect(actionsSource).toContain('const manualQuestionIds = csvList(formData, "questionIds");');
    expect(actionsSource).toContain("if (manualQuestionIds.length > 0) return uniqueFormValues(manualQuestionIds);");
    expect(actionsSource).toContain('formData.has("questionPickerPresent")');
    expect(actionsSource).toContain("selectedQuestionIds");
    expect(actionsSource).toContain('return uniqueFormValues(formData.getAll("selectedQuestionIds"));');
    expect(actionsSource).toContain("return uniqueFormValues(manualQuestionIds);");
    expect(actionsSource).toContain("new Set");
  });

  it("scopes child management data to the selected certification query", () => {
    expect(routeSource).toContain("CertDrillAdminOverviewPage");
    expect(routeSource).not.toContain("searchParams");
    expect(detailRouteSource).toContain("params");
    expect(detailRouteSource).toContain("certificationId");
    expect(routeSource).toContain("CertDrillAdminOverviewPage");
    expect(detailRouteSource).toContain("CertDrillAdminPage");
    expect(detailRouteSource).toContain("categoryId");
    expect(detailRouteSource).toContain("examFormId");
    expect(detailRouteSource).toContain("resourceId");
    expect(source).toContain("selectedCertificationId");
    expect(source).toContain("selectedCategoryId");
    expect(source).toContain("selectedExamFormId");
    expect(source).toContain("selectedResourceId");
    expect(source).toContain("certdrillAdminDetailHref");
    expect(source).toContain("/admin/certdrill/${certificationId}");
    expect(source).toContain("certdrillAdminOverviewHref");
    expect(source).toContain("Back to certifications");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
    expect(source).not.toContain("Switch the query-scoped certification");
    expect(source).toContain("certificationId:");
    expect(source).toContain('type="hidden" name="certificationId" value={selectedCertificationId ?? ""}');
    expect(source).toContain("questionCategoryId: category.id");
    expect(source).toContain("examFormId:");
    expect(source).toContain("resourceId:");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
  });

  it("prefills selected records and submits hidden IDs for updates", () => {
    expect(source).toContain('type="hidden" name="certificationId"');
    expect(source).toContain('type="hidden" name="categoryId"');
    expect(questionFormSource).toContain('type="hidden" name="questionId"');
    expect(source).toContain('type="hidden" name="examFormId"');
    expect(source).toContain('type="hidden" name="resourceId"');
    expect(source).toContain("selectedCertification={selectedAdminCertification}");
    expect(source).toContain("selectedCategory={selectedCategory}");
    expect(source).toContain("selectedQuestion={selectedQuestion}");
    expect(source).toContain("selectedExamForm={selectedExamForm}");
    expect(source).toContain("selectedResource={selectedResource}");
    expect(source).toContain("defaultValue={selectedCertification?.code}");
    expect(source).toContain("defaultValue={selectedCategory?.code}");
    expect(questionFormSource).toContain('useState(() => selectedQuestion?.stem ?? "")');
    expect(source).toContain("defaultValue={selectedExamForm?.name}");
    expect(source).toContain("defaultValue={selectedResource?.title}");
  });

  it("keeps PATCH payloads submitted-only", () => {
    expect(actionsSource).toContain("submittedString");
    expect(actionsSource).toContain("submittedNumber");
    expect(actionsSource).toContain("submittedBoolean");
    expect(actionsSource).toContain("submittedCsvList");
    expect(actionsSource).toContain("submittedResourceSourceTypeValue");
    expect(actionsSource).toContain("submittedQuestionOptions");
  });

  it("uses selected-record defaults and explicit clear sentinels for nullable relationships", () => {
    expect(source).toContain("defaultValue={selectedCategory?.parentCategoryId");
    expect(source).toContain("defaultValue={selectedResource?.categoryId");
    expect(questionFormSource).toContain('name="sourceResourceId"');
    expect(source).toContain("Clear category");
    expect(actionsSource).toContain("CLEAR_RELATIONSHIP_SENTINEL");
    expect(actionsSource).toContain("submittedNullableString");
  });

  it("shows explicit clear controls for nullable certification update fields", () => {
    expect(source).toContain("Clear blueprint URL");
    expect(source).toContain("Clear description");
    expect(source).toContain("Clear exam simulation count");
    expect(source).toContain("Clear enabled at");
    expect(source).toContain("Clear archived at");
    expect(source).toContain('name="blueprintSourceUrl" value="__none__"');
    expect(source).toContain('name="description" value="__none__"');
    expect(source).toContain('name="examSimulationQuestionCount" value="__none__"');
    expect(source).toContain('name="enabledAt" value="__none__"');
    expect(source).toContain('name="archivedAt" value="__none__"');
  });

  it("maps nullable certification clear sentinels to null in update actions", () => {
    expect(actionsSource).toContain("submittedNullableNumber");
    expect(actionsSource).toContain('blueprintSourceUrl: submittedNullableString(formData, "blueprintSourceUrl")');
    expect(actionsSource).toContain('description: submittedNullableString(formData, "description")');
    expect(actionsSource).toContain('examSimulationQuestionCount: submittedNullableNumber(formData, "examSimulationQuestionCount")');
    expect(actionsSource).toContain('enabledAt: submittedNullableString(formData, "enabledAt")');
    expect(actionsSource).toContain('archivedAt: submittedNullableString(formData, "archivedAt")');
  });

  it("shows a secondary import questions entry point beside create question, only when a certification is selected", () => {
    expect(source).toContain('import { questionEditorHref, questionEditorNewHref, questionImportHref } from "./question-editor-href";');
    expect(source).toContain("<Button asChild variant=\"secondary\">");
    expect(source).toContain('<LocalizedLink href={questionImportHref(selectedCertificationId)}>Import questions</LocalizedLink>');
    expect(source.indexOf("Import questions")).toBeLessThan(source.indexOf(">Create question</LocalizedLink>"));
  });

  it("shows the imported question count as a singular/plural status message above the question table", () => {
    expect(source).toContain("importedQuestionCount?: number;");
    expect(source).toContain('role="status"');
    expect(source).toContain("importedQuestionCount && importedQuestionCount > 0");
    expect(source).toContain('`${importedQuestionCount} question${importedQuestionCount === 1 ? "" : "s"} imported as Draft.`');
  });

  it("parses a positive integer imported query param in the certification route", () => {
    expect(detailRouteSource).toContain("parsePositiveIntegerSearchParam");
    expect(detailRouteSource).toContain("importedQuestionCount={parsePositiveIntegerSearchParam(imported)}");
    expect(detailRouteSource).toContain("Number.isInteger(parsed) && parsed > 0 ? parsed : undefined");
  });
});
