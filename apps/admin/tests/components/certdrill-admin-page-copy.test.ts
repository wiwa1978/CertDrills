import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/modules/certdrill/admin-page.tsx", import.meta.url), "utf8");
const questionFilterBarSource = readFileSync(
  new URL("../../src/modules/certdrill/question-filter-bar.tsx", import.meta.url),
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

  it("shows management tabs and primary form labels", () => {
    expect(source).toContain("Categories");
    expect(source).toContain("Questions");
    expect(source).toContain("Exam Forms");
    expect(source).toContain("Resources");
    expect(source).toContain("Generate");
    expect(source).toContain("Feedback");
    expect(source).toContain("Manage CertDrill content for the selected certification.");
    expect(source).toContain("Certification overview");
    expect(source).toContain("Open details");
    expect(source).toContain("Archive certification");
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
    expect(source).toContain("Archive");
    expect(source).toContain("Create or update question");
    expect(source).toContain("Publish");
    expect(source).toContain("Create or update exam form");
    expect(source).toContain("Create or update resource");
    expect(source).toContain("Mock generation");
    expect(source).toContain("Draft questions");
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
    expect(detailRouteSource).toContain("feedbackStatus?: SearchParamValue");
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
    expect(detailRouteSource).toContain("tab?: SearchParamValue");
    expect(detailRouteSource).toContain("selectedTab={firstSearchParamString(tab)}");
  });

  it("normalizes array search params before passing string-only filters", () => {
    expect(detailRouteSource).toContain("type SearchParamValue = string | string[] | undefined");
    expect(detailRouteSource).toContain("firstSearchParamString");
    expect(detailRouteSource).toContain("categoryId?: SearchParamValue");
    expect(detailRouteSource).toContain("questionSearch?: SearchParamValue");
    expect(detailRouteSource).toContain("selectedCategoryId={firstSearchParamString(categoryId)}");
    expect(detailRouteSource).toContain("questionSearch={firstSearchParamString(questionSearch)}");
    expect(detailRouteSource).toContain("questionSort={firstSearchParamString(questionSort)}");
    expect(source).toContain("questionSearch?: string;");
    expect(source).not.toContain("questionSearch?: string | string[]");
    expect(source).not.toContain("Array.isArray(questionSearch)");
  });

  it("shows markdown-supported question editor copy and preview panels", () => {
    expect(source).toContain("Markdown supported");
    expect(source).toContain("Stem preview");
    expect(source).toContain("Explanation preview");
    expect(source).toContain("MarkdownTextareaWithPreview");
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
    expect(source).toContain("<CardTitle>Question</CardTitle>");
    expect(source).toContain("<CardTitle>Answers</CardTitle>");
    expect(source.indexOf("<CardTitle>Question</CardTitle>"))
      .toBeLessThan(source.indexOf("<CardTitle>Answers</CardTitle>"));
  });

  it("uses localized links for dedicated question editor navigation", () => {
    expect(source).toContain('import { Link as LocalizedLink } from "@/i18n/navigation";');
    expect(source).toContain('<LocalizedLink href={certdrillAdminDetailHref(certificationId, { tab: "questions" })}>Back to questions</LocalizedLink>');
    expect(source).toContain('<LocalizedLink href={questionEditorNewHref(selectedCertificationId)}>Create question</LocalizedLink>');
    expect(source).toContain('<LocalizedLink href={questionHref(question)} className="hover:underline">{question.id}</LocalizedLink>');
    expect(source).toContain('<LocalizedLink href={questionHref(question)} className="hover:underline">{question.stem}</LocalizedLink>');
  });

  it("moves question publishing and archiving into table actions", () => {
    expect(source).toContain('from "@/components/ui/dropdown-menu"');
    expect(source).toContain("<DropdownMenu");
    expect(source).toContain('<TableHead className="text-right">Actions</TableHead>');
    expect(source).toContain(">Edit</LocalizedLink>");
    expect(source).toContain(">Publish</button>");
    expect(source).toContain(">Archive</button>");
    expect(source).toContain('const questionStatus = question.status ?? "draft";');
    expect(source).toContain('questionStatus === "draft"');
    expect(source).toContain('questionStatus !== "archived"');
    expect(source).toContain('id={`publish-question-${question.id}`}');
    expect(source).toContain('id={`archive-question-${question.id}`}');
    expect(source).toContain("DropdownMenuItem asChild");
    expect(source).toContain("DropdownMenuSeparator");
    expect(source).not.toContain("<CardTitle>Publish question</CardTitle>");
    expect(source).toContain("publishAction={publishCertDrillQuestionAction}");
    expect(source).toContain("archiveAction={archiveCertDrillQuestionAction}");
    expect(actionsSource).toContain("archiveCertDrillQuestionAction");
    expect(actionsSource).toContain('updateCertDrillAdminQuestionServer(questionId, { status: "archived" })');
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
    expect(source).toContain("Published questions require one correct option, explanations, and citation URLs.");
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
    expect(source).toContain('type="hidden" name="questionId"');
    expect(source).toContain('type="hidden" name="examFormId"');
    expect(source).toContain('type="hidden" name="resourceId"');
    expect(source).toContain("selectedCertification={selectedAdminCertification}");
    expect(source).toContain("selectedCategory={selectedCategory}");
    expect(source).toContain("selectedQuestion={selectedQuestion}");
    expect(source).toContain("selectedExamForm={selectedExamForm}");
    expect(source).toContain("selectedResource={selectedResource}");
    expect(source).toContain("defaultValue={selectedCertification?.code}");
    expect(source).toContain("defaultValue={selectedCategory?.code}");
    expect(source).toContain("defaultValue={selectedQuestion?.stem}");
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
    expect(source).toContain("Clear source resource");
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
});
