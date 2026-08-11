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
const questionTableSource = readFileSync(
  new URL("../../src/modules/certdrill/question-table.tsx", import.meta.url),
  "utf8",
);
const questionBulkSelectionSource = readFileSync(
  new URL("../../src/modules/certdrill/question-bulk-selection.tsx", import.meta.url),
  "utf8",
);
const questionGenerationControlSource = readFileSync(
  new URL("../../src/modules/certdrill/question-generation-control.tsx", import.meta.url),
  "utf8",
);
const scenarioAdminSource = readFileSync(
  new URL("../../src/modules/certdrill/scenario-admin.tsx", import.meta.url),
  "utf8",
);
const actionsSource = readFileSync(new URL("../../src/modules/certdrill/admin-actions.ts", import.meta.url), "utf8");
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
    expect(questionFilterBarSource).toContain('params.delete("generated");');
  });

  it("shows management tabs and primary form labels", () => {
    expect(source).toContain("Categories");
    expect(source).toContain("Questions");
    expect(source).toContain('id={`${tabIdPrefix}-scenarios-trigger`}');
    expect(source).toContain('aria-controls={`${tabIdPrefix}-scenarios-content`}');
    expect(source).toContain('value="scenarios">Scenarios</TabsTrigger>');
    expect(source).toContain('selectedTab === "scenarios"');
    expect(source).toContain("<ScenarioAdmin");
    expect(scenarioAdminSource).toContain("Create scenario");
    expect(scenarioAdminSource).not.toContain("Exam form assignments");
    expect(scenarioAdminSource).toContain("Archive scenario");
    expect(source).toContain("Exam Forms");
    expect(source).not.toContain('<TabsTrigger value="resources">');
    expect(source).toContain("QuestionGenerationControl");
    expect(questionGenerationControlSource).toContain("Generate Questions with AI");
    expect(source).toContain("Feedback");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
    expect(source).toContain("Certification overview");
    expect(source).toContain("Back to certifications");
    expect(source).toContain("Update certification details");
    expect(source).toContain("Selected certification");
    expect(source).toContain("Click to view or update certification details.");
    expect(source).toContain("<CardDescription>Scenarios</CardDescription>");
    expect(source).toContain("{scenarios.length.toLocaleString()}");
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
    expect(source).toContain("ExamFormCreateDialog");
    expect(source).not.toContain("Mock generation");
    expect(source).not.toContain('<TabsTrigger value="generate">');
  });

  it("keeps resources internal while using them for AI workflows", () => {
    expect(source).toContain("listCertDrillAdminResourcesServer");
    expect(source).toContain("resources={resources}");
    expect(source).toContain("resources.find((resource) => resource.id === newestBlueprintRun.resourceId)");
    expect(source).not.toContain('<TabsContent value="resources"');
    expect(source).not.toContain("function ResourceForm(");
    expect(source).not.toContain("function ResourceTable(");
    expect(source).not.toContain("createCertDrillResourceAction");
    expect(source).not.toContain("ingestCertDrillResourceAction");
    expect(source).not.toContain("updateCertDrillResourceAction");
    expect(actionsSource).not.toContain("createCertDrillResourceAction");
    expect(actionsSource).not.toContain("ingestCertDrillResourceAction");
    expect(actionsSource).not.toContain("updateCertDrillResourceAction");
  });

  it("keeps AI category discovery beside manual category creation", () => {
    expect(source).toContain('import { CategoryDiscoveryControl } from "@/modules/certdrill/category-discovery-control";');
    expect(source).toContain("listCertDrillAdminBlueprintParseRunsServer");
    expect(source).toContain("const newestBlueprintRun = newestBlueprintParseRun(blueprintParseRuns);");
    expect(source).toContain("const categoryDiscoveryUrl = latestDiscoveryResource?.url ?? selectedAdminCertification?.blueprintSourceUrl ?? \"\";");
    expect(source).toContain("<CategoryDiscoveryControl");
    expect(source).toContain("certificationId={selectedCertificationId}");
    expect(source).toContain("defaultUrl={categoryDiscoveryUrl}");
    expect(source).toContain("initialRun={newestBlueprintRun}");
    expect(source).not.toContain("BlueprintAnalysisControl");
    expect(source).not.toContain("newestBlueprintRuns.get(resource.id)");
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
    expect(questionFilterBarSource).toContain("<option key={category.id} value={category.id}>{category.name}</option>");
    expect(questionFilterBarSource).not.toContain("{category.code} - {category.name}");
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
    expect(questionTableSource).toContain("Stem A-Z");
    expect(questionTableSource).toContain("Stem Z-A");
    expect(questionTableSource).toContain('aria-sort={sort === "stem-desc" ? "descending" : "ascending"}');
    expect(questionTableSource).toContain('{sort === "stem-desc" ? "↓" : "↑"}');
    expect(source).toContain("questionPage");
    expect(questionTableSource).toContain("Page {page} of {pageCount}");
    expect(questionTableSource).toContain("<LocalizedLink href={previousPageHref}>Previous</LocalizedLink>");
    expect(questionTableSource).toContain("<LocalizedLink href={nextPageHref}>Next</LocalizedLink>");
    expect(questionTableSource).toContain(': <Button variant="outline" size="sm" disabled>Previous</Button>');
    expect(questionTableSource).toContain(': <Button variant="outline" size="sm" disabled>Next</Button>');
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

  it("shows new-record controls for visible editable areas", () => {
    expect(source).toContain("New certification");
    expect(source).toContain("Create category");
    expect(source).toContain("Create question");
    expect(source).toContain("ExamFormList");
    expect(source).not.toContain("New resource");
  });

  it("uses dedicated routes for question editing", () => {
    expect(source).toContain("questionEditorNewHref(selectedCertificationId)");
    expect(questionTableSource).toContain("questionEditorHref(certificationId, question.id)");
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
    expect(questionTableSource).toContain("compactQuestionId(question.id)");
    expect(questionTableSource).toContain('aria-label={`Open question ${question.id}`}');
    expect(questionTableSource).toContain('<LocalizedLink href={href} className="hover:underline">{question.stem}</LocalizedLink>');
  });

  it("shares question publishing and archiving through a focused row actions menu", () => {
    expect(questionTableSource).toContain('import { QuestionActionsMenu } from "./question-actions-menu";');
    expect(questionTableSource).toContain("<QuestionActionsMenu");
    expect(questionTableSource).toContain('<TableHead className="text-right">Actions</TableHead>');
    expect(questionTableSource).toContain('edit={<LocalizedLink href={href}>Edit</LocalizedLink>}');
    expect(questionTableSource).toContain("publishAction={publishQuestionAction}");
    expect(questionTableSource).toContain("archiveAction={archiveAction}");
    expect(questionTableSource).not.toContain('from "@/components/ui/dropdown-menu"');
    expect(questionTableSource).not.toContain("<DropdownMenu");
    expect(questionTableSource).not.toContain("MoreHorizontal");
    expect(questionActionsMenuSource).toContain('"use client"');
    expect(questionActionsMenuSource).toContain("DropdownMenu");
    expect(questionActionsMenuSource).toContain("DropdownMenuSeparator");
    expect(questionActionsMenuSource).toContain("function stopPropagation(");
    expect(questionActionsMenuSource).toContain("event.stopPropagation();");
    expect(questionActionsMenuSource).toContain("onClick={stopPropagation}");
    expect(questionActionsMenuSource).toContain('const questionStatus = status ?? "draft";');
    expect(questionActionsMenuSource).toContain("{edit}");
    expect(questionTableSource).toContain('const questionStatus = question.status ?? "draft";');
    expect(questionActionsMenuSource).toContain('questionStatus === "draft"');
    expect(questionActionsMenuSource).toContain('questionStatus !== "archived"');
    expect(questionActionsMenuSource).toContain(">Publish</button>");
    expect(questionActionsMenuSource).toContain(">Archive</button>");
    expect(questionActionsMenuSource).toContain('id={`publish-question-${questionId}`}');
    expect(questionActionsMenuSource).toContain('id={`archive-question-${questionId}`}');
    expect(source).not.toContain("<CardTitle>Publish question</CardTitle>");
    expect(source).toContain("publishQuestionAction={publishCertDrillQuestionAction}");
    expect(source).toContain("archiveAction={archiveCertDrillQuestionAction}");
    expect(actionsSource).toContain("archiveCertDrillQuestionAction");
    expect(actionsSource).toContain('updateCertDrillAdminQuestionServer(questionId, { status: "archived" })');
  });

  it("supports selecting all visible questions for publish or unpublish", () => {
    expect(questionTableSource).toContain("<QuestionBulkActionBar");
    expect(questionTableSource).toContain("<QuestionSelectionCheckbox");
    expect(questionBulkSelectionSource).toContain("Select all");
    expect(questionBulkSelectionSource).toContain("Publish");
    expect(questionBulkSelectionSource).toContain("Unpublish");
    expect(questionBulkSelectionSource).toContain('name="questionIds"');
    expect(actionsSource).toContain("publishSelectedCertDrillQuestionsAction");
    expect(actionsSource).toContain("unpublishSelectedCertDrillQuestionsAction");
    expect(actionsSource).toContain("setSelectedCertDrillQuestionsPracticeAction");
    expect(actionsSource).toContain("setSelectedCertDrillQuestionsAssessmentAction");
    expect(questionBulkSelectionSource).toContain("Set type:");
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

  it("shows configured exam mode defaults", () => {
    expect(source).toContain("Quick Drill count");
    expect(source).toContain("Category Drill count");
    expect(source).toContain("Default Category Drill count");
    expect(source).toContain("Category Drill override");
    expect(source).toContain("Leave empty to use the certification default.");
    expect(source).toContain("Exam Simulation count");
    expect(source).toContain("Exam Simulation duration");
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
    expect(source).toContain("TextField id={`${idPrefix}-code`} name=\"code\" label=\"Blueprint code\" required");
    expect(source).toContain("The category UUID is generated automatically.");
    expect(source).toContain("{formatCategoryWeight(category)}");
    expect(source).not.toContain("<TableHead className=\"text-right\">Drill count</TableHead>");
    expect(source).toContain("VendorField id={`${idPrefix}-vendor`} vendors={vendors} selectedCertification={selectedCertification} required");
    expect(source).toContain("helperText");
  });

  it("uses the simplified exam form list instead of an inline picker", () => {
    expect(source).toContain("<ExamFormCreateDialog");
    expect(source).toContain("<ExamFormList");
    expect(source).not.toContain("QuestionPickerTable");
    expect(source).not.toContain("Manual question ID fallback");
  });

  it("keeps the Radix component tree stable between server render and hydration", () => {
    expect(source).not.toContain('import { ClientOnly } from "@/components/client-only";');
    expect(source).not.toContain("<ClientOnly");
  });

  it("scopes child management data to the selected certification query", () => {
    expect(routeSource).toContain("CertDrillAdminOverviewPage");
    expect(routeSource).not.toContain("searchParams");
    expect(detailRouteSource).toContain("params");
    expect(detailRouteSource).toContain("certificationId");
    expect(routeSource).toContain("CertDrillAdminOverviewPage");
    expect(detailRouteSource).toContain("CertDrillAdminPage");
    expect(detailRouteSource).toContain("categoryId");
    expect(detailRouteSource).not.toContain("examFormId");
    expect(detailRouteSource).not.toContain("resourceId");
    expect(source).toContain("selectedCertificationId");
    expect(source).toContain("selectedCategoryId");
    expect(source).not.toContain("selectedExamFormId");
    expect(source).not.toContain("selectedResourceId");
    expect(source).toContain("certdrillAdminDetailHref");
    expect(source).toContain("/admin/certdrill/${certificationId}");
    expect(source).toContain("certdrillAdminOverviewHref");
    expect(source).toContain("Back to certifications");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
    expect(source).not.toContain("Switch the query-scoped certification");
    expect(source).toContain("certificationId:");
    expect(source).toContain("certificationId={selectedCertificationId}");
    expect(source).toContain("questionCategoryId: category.id");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
  });

  it("prefills selected records and submits hidden IDs for updates", () => {
    expect(source).toContain('type="hidden" name="certificationId"');
    expect(source).toContain('type="hidden" name="categoryId"');
    expect(questionFormSource).toContain('type="hidden" name="questionId"');
    expect(source).toContain("selectedCertification={selectedAdminCertification}");
    expect(source).toContain("selectedCategory={selectedCategory}");
    expect(source).toContain("selectedQuestion={selectedQuestion}");
    expect(source).toContain("defaultValue={selectedCertification?.code}");
    expect(source).toContain("defaultValue={selectedCategory?.code}");
    expect(questionFormSource).toContain('useState(() => selectedQuestion?.stem ?? "")');
  });

  it("keeps PATCH payloads submitted-only", () => {
    expect(actionsSource).toContain("submittedString");
    expect(actionsSource).toContain("submittedNumber");
    expect(actionsSource).toContain("submittedBoolean");
    expect(actionsSource).toContain("submittedQuestionOptions");
  });

  it("uses selected-record defaults and explicit clear sentinels for nullable relationships", () => {
    expect(source).toContain("defaultValue={selectedCategory?.parentCategoryId");
    expect(questionFormSource).toContain('name="sourceResourceId"');
    expect(source).toContain("Clear parent category");
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
    expect(source).toContain('import { questionEditorNewHref, questionImportHref } from "./question-editor-href";');
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
