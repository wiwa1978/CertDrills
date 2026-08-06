import type { ComponentProps } from "react";
import type { CertDrillCertificationListItem } from "@platform/contracts";
import Link from "next/link";
import { Archive, Pencil } from "lucide-react";

import { Link as LocalizedLink } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClientOnly } from "@/components/client-only";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  listCertDrillAdminCategoriesServer,
  listCertDrillAdminCertificationsServer,
  listCertDrillAdminExamFormsServer,
  listCertDrillAdminQuestionFeedbackServer,
  listCertDrillAdminQuestionsServer,
  listCertDrillAdminResourcesServer,
  listCertDrillAdminVendorsServer,
  type CertDrillAdminCategory,
  type CertDrillAdminCertification,
  type CertDrillAdminExamForm,
  type CertDrillAdminQuestionFeedback,
  type CertDrillAdminQuestion,
  type CertDrillAdminResource,
  type CertDrillAdminVendor,
} from "@/lib/api/certdrill.server";
import {
  createCertDrillCategoryAction,
  createCertDrillCertificationAction,
  archiveCertDrillCertificationAction,
  archiveCertDrillCategoryAction,
  archiveCertDrillQuestionAction,
  createCertDrillExamFormAction,
  createCertDrillMockGenerationAction,
  createCertDrillQuestionAction,
  createCertDrillResourceAction,
  publishCertDrillQuestionAction,
  updateCertDrillQuestionFeedbackAction,
  updateCertDrillCategoryAction,
  updateCertDrillCertificationAction,
  updateCertDrillExamFormAction,
  updateCertDrillQuestionAction,
  updateCertDrillResourceAction,
} from "./admin-actions";
import { getCertDrillCertificationsServer } from "@/lib/api/certdrill.server";
import { questionEditorHref, questionEditorNewHref } from "./question-editor-href";
import { compactQuestionId } from "./question-id";
import { QuestionActionsMenu } from "./question-actions-menu";
import { QuestionFilterBar } from "./question-filter-bar";
import { QuestionForm } from "./question-form";
import {
  buildQuestionPageQuery,
  buildQuestionSortQuery,
  paginateQuestions,
  type QuestionTableQuery,
} from "./question-pagination";

type CertDrillAdminPageProps = {
  certifications: CertDrillCertificationListItem[];
  selectedCertificationId?: string;
  selectedCategoryId?: string;
  selectedExamFormId?: string;
  selectedResourceId?: string;
  questionSearch?: string;
  questionStatus?: string;
  questionDifficulty?: string;
  questionCategoryId?: string;
  questionSort?: string;
  questionPage?: string;
  feedbackStatus?: string;
  selectedTab?: string;
  questionTableQuery?: QuestionTableQuery;
};

type CertificationOption = {
  id: string;
  code: string;
  name: string;
};

type CertDrillAdminHrefParams = QuestionTableQuery;

type QuestionFilters = {
  questionSearch?: string;
  questionStatus?: string;
  questionDifficulty?: string;
  questionCategoryId?: string;
  questionSort?: string;
};

export async function CertDrillAdminOverviewPage({ certifications }: { certifications: CertDrillCertificationListItem[] }) {
  const [adminCertifications, vendors] = await Promise.all([
    listCertDrillAdminCertificationsServer(),
    listCertDrillAdminVendorsServer(),
  ]);
  const certificationOptions = buildCertificationOptions(adminCertifications, certifications);

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Certification overview</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">CertDrill Admin</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Review all certifications, open a detail page, or create a new certification from this overview.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle>Certifications</CardTitle>
              <CardDescription>Open a certification to manage all related CertDrill content.</CardDescription>
            </div>
            <ClientOnly fallback={<Button disabled>New certification</Button>}>
              <Dialog>
                <DialogTrigger asChild>
                  <Button>New certification</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Create certification</DialogTitle>
                    <DialogDescription>Create a certification shell. Open its detail page afterwards to manage categories, questions, forms, resources, and generation.</DialogDescription>
                  </DialogHeader>
                  <CertificationForm action={createCertDrillCertificationAction} submitLabel="Create certification" idPrefix="overview-create-cert" vendors={vendors} />
                </DialogContent>
              </Dialog>
            </ClientOnly>
          </div>
        </CardHeader>
        <CardContent>
          {certificationOptions.length > 0 ? <AdminCertificationOverviewTable certifications={adminCertifications.length > 0 ? adminCertifications : certifications} /> : <EmptyState>No certifications yet.</EmptyState>}
        </CardContent>
      </Card>
    </div>
  );
}

export async function CertDrillQuestionEditorPage({
  certificationId,
  questionId,
}: {
  certificationId: string;
  questionId?: string;
}) {
  const [certifications, adminCertifications, categories, questions] = await Promise.all([
    getCertDrillCertificationsServer(),
    listCertDrillAdminCertificationsServer(),
    listCertDrillAdminCategoriesServer(certificationId),
    listCertDrillAdminQuestionsServer(certificationId),
  ]);
  const selectedAdminCertification = adminCertifications.find((certification) => certification.id === certificationId);
  const selectedCatalogCertification = certifications.find((certification) => certification.id === certificationId);
  const selectedQuestion = questionId ? questions.find((question) => question.id === questionId) : undefined;

  if (!selectedAdminCertification) {
    return <EmptyState>Certification not found.</EmptyState>;
  }
  const certificationContext = selectedCatalogCertification ?? selectedAdminCertification;

  if (questionId && !selectedQuestion) {
    return <EmptyState>Question not found.</EmptyState>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge variant="secondary">Question editor</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{`${selectedQuestion ? "Update" : "Create"} question for ${certificationContext.code}`}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {`${selectedQuestion ? "Update the selected question for" : "Create a question for"} ${certificationContext.code} - ${certificationContext.name}.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <LocalizedLink href={certdrillAdminDetailHref(certificationId, { tab: "questions" })}>Back to questions</LocalizedLink>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create or update question</CardTitle>
          <CardDescription>Edit the question details, then review and complete each answer.</CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionForm
            action={selectedQuestion ? updateCertDrillQuestionAction : createCertDrillQuestionAction}
            submitLabel={selectedQuestion ? "Update question" : "Create question"}
            categories={categories}
            selectedCertificationId={certificationId}
            selectedQuestion={selectedQuestion}
            idPrefix="question-editor"
          />
        </CardContent>
      </Card>
    </div>
  );
}

export async function CertDrillAdminPage({
  certifications,
  selectedCertificationId: requestedCertificationId,
  selectedCategoryId: requestedCategoryId,
  selectedExamFormId: requestedExamFormId,
  selectedResourceId: requestedResourceId,
  questionSearch,
  questionStatus,
  questionDifficulty,
  questionCategoryId,
  questionSort,
  questionPage,
  feedbackStatus,
  selectedTab,
  questionTableQuery,
}: CertDrillAdminPageProps) {
  const [adminCertifications, vendors] = await Promise.all([
    listCertDrillAdminCertificationsServer(),
    listCertDrillAdminVendorsServer(),
  ]);
  const allQuestionFeedback = await listCertDrillAdminQuestionFeedbackServer();
  const certificationOptions = buildCertificationOptions(adminCertifications, certifications);
  const selectedAdminCertification = requestedCertificationId && requestedCertificationId !== "new"
    ? adminCertifications.find((certification) => certification.id === requestedCertificationId)
    : undefined;
  const selectedCertificationId = selectedAdminCertification?.id;
  const selectedCertification = certificationOptions.find((certification) => certification.id === selectedCertificationId);
  let categories: CertDrillAdminCategory[] = [];
  let questions: CertDrillAdminQuestion[] = [];
  let examForms: CertDrillAdminExamForm[] = [];
  let resources: CertDrillAdminResource[] = [];

  if (selectedCertificationId) {
    [categories, questions, examForms, resources] = await Promise.all([
      listCertDrillAdminCategoriesServer(selectedCertificationId),
      listCertDrillAdminQuestionsServer(selectedCertificationId),
      listCertDrillAdminExamFormsServer(selectedCertificationId),
      listCertDrillAdminResourcesServer(selectedCertificationId),
    ]);
  }

  const selectedCategory = requestedCategoryId && requestedCategoryId !== "new"
    ? categories.find((category) => category.id === requestedCategoryId)
    : undefined;
  const selectedExamForm = requestedExamFormId && requestedExamFormId !== "new"
    ? examForms.find((examForm) => examForm.id === requestedExamFormId)
    : undefined;
  const selectedResource = requestedResourceId && requestedResourceId !== "new"
    ? resources.find((resource) => resource.id === requestedResourceId)
    : undefined;
  const selectedCatalogCertification = selectedCertificationId ? certifications.find((certification) => certification.id === selectedCertificationId) : undefined;
  const publishedQuestions = selectedCatalogCertification?.publishedQuestionCount ?? questions.filter((question) => question.status === "published").length;
  const draftQuestions = questions.filter((question) => (question.status ?? "draft") === "draft");
  const selectedQuestionIds = new Set(questions.map((question) => question.id));
  const questionFeedback = allQuestionFeedback.filter((feedback) => selectedQuestionIds.has(feedback.questionId));
  const normalizedFeedbackStatus = normalizeFeedbackStatus(feedbackStatus);
  const filteredQuestionFeedback = filterQuestionFeedback(questionFeedback, normalizedFeedbackStatus);
  const certificationQuery = selectedCertificationId ? {} : undefined;
  const selectedCertificationHref = (params: CertDrillAdminHrefParams = {}) => selectedCertificationId ? certdrillAdminDetailHref(selectedCertificationId, params) : certdrillAdminOverviewHref();
  const questionFilters = normalizeQuestionFilters({
    questionSearch,
    questionStatus,
    questionDifficulty,
    questionCategoryId: questionCategoryId ?? requestedCategoryId,
    questionSort,
  });
  const filteredQuestions = filterCertDrillAdminQuestions(questions, questionFilters);
  const {
    items: pagedQuestions,
    page: currentQuestionPage,
    pageCount: questionPageCount,
  } = paginateQuestions(filteredQuestions, questionPage);
  const currentQuestionTableQuery = questionTableQuery ?? {
    categoryId: requestedCategoryId,
    examFormId: requestedExamFormId,
    resourceId: requestedResourceId,
    questionSearch,
    questionStatus,
    questionDifficulty,
    questionCategoryId,
    questionSort,
    questionPage,
    feedbackStatus,
    tab: selectedTab,
  };
  const stemSortHref = selectedCertificationHref(buildQuestionSortQuery(
    currentQuestionTableQuery,
    questionFilters.questionSort === "stem-desc" ? "stem-asc" : "stem-desc",
  ));
  const previousPageHref = currentQuestionPage > 1
    ? selectedCertificationHref(buildQuestionPageQuery(currentQuestionTableQuery, currentQuestionPage - 1))
    : undefined;
  const nextPageHref = currentQuestionPage < questionPageCount
    ? selectedCertificationHref(buildQuestionPageQuery(currentQuestionTableQuery, currentQuestionPage + 1))
    : undefined;
  const hasQuestionFilters = Object.values(questionFilters).some(Boolean);
  const defaultTab = selectedTab === "categories"
    || selectedTab === "questions"
    || selectedTab === "exam-forms"
    || selectedTab === "resources"
    || selectedTab === "generate"
    || selectedTab === "feedback"
    ? selectedTab
    : requestedCategoryId || hasQuestionFilters ? "questions" : "categories";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Badge variant="secondary">Non-production management</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">{selectedCertification ? selectedCertification.name : "Certification detail"}</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Manage CertDrill content for the selected certification.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 lg:pt-8">
          <Button asChild variant="outline" size="sm">
            <Link href={certdrillAdminOverviewHref()}>Back to certifications</Link>
          </Button>
          {selectedAdminCertification ? (
            <ClientOnly fallback={<Button size="sm" disabled>Update</Button>}>
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm">Update</Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                  <DialogHeader>
                    <DialogTitle>Update certification details</DialogTitle>
                    <DialogDescription>Patch the selected certification details without changing child records.</DialogDescription>
                  </DialogHeader>
                  <CertificationForm
                    action={updateCertDrillCertificationAction}
                    submitLabel="Update certification"
                    idPrefix="certification"
                    selectedCertification={selectedAdminCertification}
                    vendors={vendors}
                  />
                </DialogContent>
              </Dialog>
            </ClientOnly>
          ) : null}
          {selectedAdminCertification ? (
            <form action={archiveCertDrillCertificationAction}>
              <input type="hidden" name="certificationId" value={selectedAdminCertification.id} />
              <Button type="submit" variant="destructive" size="sm">Archive</Button>
            </form>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ClientOnly fallback={<Card><CardHeader className="pb-2"><CardDescription>Selected certification</CardDescription><CardTitle className="text-3xl">{selectedCertification?.code ?? "-"}</CardTitle></CardHeader></Card>}>
          <Dialog>
            <DialogTrigger asChild>
              <button type="button" className="rounded-xl text-left transition hover:ring-2 hover:ring-ring focus:outline-none focus:ring-2 focus:ring-ring">
                <Card className="h-full">
                  <CardHeader className="pb-2">
                    <CardDescription>Selected certification</CardDescription>
                    <CardTitle className="text-3xl">{selectedCertification?.code ?? "-"}</CardTitle>
                    <p className="text-xs text-muted-foreground">Click to view or update certification details.</p>
                  </CardHeader>
                </Card>
              </button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>Update certification details</DialogTitle>
                <DialogDescription>Patch the selected certification details without changing child records.</DialogDescription>
              </DialogHeader>
              {selectedAdminCertification ? (
                <CertificationForm
                  action={updateCertDrillCertificationAction}
                  submitLabel="Update certification"
                  idPrefix="certification-card"
                  selectedCertification={selectedAdminCertification}
                  vendors={vendors}
                />
              ) : <EmptyState>Certification not found.</EmptyState>}
            </DialogContent>
          </Dialog>
        </ClientOnly>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Published questions</CardDescription>
            <CardTitle className="text-3xl">{publishedQuestions.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Draft questions</CardDescription>
            <CardTitle className="text-3xl">{draftQuestions.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <Tabs key={defaultTab} defaultValue={defaultTab} className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="exam-forms">Exam Forms</TabsTrigger>
          <TabsTrigger value="resources">Resources</TabsTrigger>
          <TabsTrigger value="generate">Generate</TabsTrigger>
          <TabsTrigger value="feedback">Feedback</TabsTrigger>
        </TabsList>

        <TabsContent value="categories" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <CardTitle>Categories</CardTitle>
                  <CardDescription>{selectedCertification ? `Categories belonging to ${selectedCertification.code}.` : "Select an existing certification before managing categories."}</CardDescription>
                </div>
                {selectedCertificationId ? (
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button>Create category</Button>
                    </DialogTrigger>
                    <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                      <DialogHeader>
                        <DialogTitle>Create category</DialogTitle>
                        <DialogDescription>Create an exam blueprint category for the selected certification.</DialogDescription>
                      </DialogHeader>
                      <CategoryForm
                        action={createCertDrillCategoryAction}
                        submitLabel="Create category"
                        categories={categories}
                        selectedCertificationId={selectedCertificationId}
                        idPrefix="category-create"
                      />
                    </DialogContent>
                  </Dialog>
                ) : null}
              </div>
            </CardHeader>
            <CardContent>{categories.length > 0 && selectedCertificationId ? <CategoryTable categories={categories} selectedCertificationHref={selectedCertificationHref} /> : <EmptyState>No categories yet.</EmptyState>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="questions" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Questions</CardTitle>
                  <CardDescription>{selectedCategory ? `Questions in ${selectedCategory.code} - ${selectedCategory.name}.` : "Simple MCQ list for the selected certification."}</CardDescription>
                </div>
                {selectedCertificationId ? (
                  <Button asChild>
                    <LocalizedLink href={questionEditorNewHref(selectedCertificationId)}>Create question</LocalizedLink>
                  </Button>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {selectedCertificationId ? <QuestionFilterBar categories={categories} filters={questionFilters} /> : null}
              {pagedQuestions.length > 0 && selectedCertificationId ? <QuestionTable questions={pagedQuestions} questionHref={(question) => questionEditorHref(selectedCertificationId, question.id)} publishAction={publishCertDrillQuestionAction} archiveAction={archiveCertDrillQuestionAction} sort={questionFilters.questionSort} stemSortHref={stemSortHref} page={currentQuestionPage} pageCount={questionPageCount} previousPageHref={previousPageHref} nextPageHref={nextPageHref} /> : <EmptyState>No questions yet.</EmptyState>}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="exam-forms" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create or update exam form</CardTitle>
              <CardDescription>{selectedCertification ? `Create an exam form for ${selectedCertification.code} or patch the selected form.` : "Select an existing certification before managing exam forms."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SelectionLinks
                newLabel="New exam form"
                newHref={selectedCertificationHref({ ...certificationQuery, examFormId: "new" })}
                disabled={!selectedCertificationId}
              >
                {examForms.map((examForm) => (
                  <Button key={examForm.id} asChild variant={examForm.id === selectedExamForm?.id ? "default" : "outline"} size="sm">
                    <Link href={selectedCertificationHref({ ...certificationQuery, examFormId: examForm.id })}>{examForm.name}</Link>
                  </Button>
                ))}
              </SelectionLinks>
              {selectedCertificationId ? (
                <ExamFormForm
                  action={selectedExamForm ? updateCertDrillExamFormAction : createCertDrillExamFormAction}
                  submitLabel={selectedExamForm ? "Update exam form" : "Create exam form"}
                  categories={categories}
                  questions={questions}
                  selectedCertificationId={selectedCertificationId}
                  selectedExamForm={selectedExamForm}
                  idPrefix="exam-form"
                />
              ) : <EmptyState>Select or create a certification first.</EmptyState>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Exam Forms</CardTitle>
              <CardDescription>Available simulation forms for the selected certification.</CardDescription>
            </CardHeader>
            <CardContent>{examForms.length > 0 ? <ExamFormTable examForms={examForms} /> : <EmptyState>No exam forms yet.</EmptyState>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="resources" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Create or update resource</CardTitle>
              <CardDescription>{selectedCertification ? `Create a resource for ${selectedCertification.code} or patch the selected resource.` : "Select an existing certification before managing resources."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <SelectionLinks
                newLabel="New resource"
                newHref={selectedCertificationHref({ ...certificationQuery, resourceId: "new" })}
                disabled={!selectedCertificationId}
              >
                {resources.map((resource) => (
                  <Button key={resource.id} asChild variant={resource.id === selectedResource?.id ? "default" : "outline"} size="sm">
                    <Link href={selectedCertificationHref({ ...certificationQuery, resourceId: resource.id })}>{resource.title}</Link>
                  </Button>
                ))}
              </SelectionLinks>
              {selectedCertificationId ? (
                <ResourceForm
                  action={selectedResource ? updateCertDrillResourceAction : createCertDrillResourceAction}
                  submitLabel={selectedResource ? "Update resource" : "Create resource"}
                  categories={categories}
                  selectedCertificationId={selectedCertificationId}
                  selectedResource={selectedResource}
                  idPrefix="resource"
                />
              ) : <EmptyState>Select or create a certification first.</EmptyState>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Resources</CardTitle>
              <CardDescription>Resource list for URL/title/content mode placeholders.</CardDescription>
            </CardHeader>
            <CardContent>{resources.length > 0 ? <ResourceTable resources={resources} /> : <EmptyState>No resources yet.</EmptyState>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="generate" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mock generation</CardTitle>
              <CardDescription>Create deterministic draft questions from a prompt, topic, and selected category.</CardDescription>
            </CardHeader>
            <CardContent>
              <form action={createCertDrillMockGenerationAction} className="space-y-4">
                <input type="hidden" name="certificationId" value={selectedCertificationId ?? ""} />
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Certification</Label>
                    <div className="rounded-md border px-3 py-2 text-sm text-muted-foreground">
                      {selectedCertification ? `${selectedCertification.code} - ${selectedCertification.name}` : "Select a certification above"}
                    </div>
                  </div>
                  <CategorySelect id="generate-category-id" name="categoryId" categories={categories} label="Category" />
                  <TextField id="generate-topic" name="topic" label="Topic" placeholder="Identity governance" />
                  <TextField id="generate-requested-count" name="requestedCount" label="Requested count" type="number" min="1" max="25" defaultValue="3" />
                  <TextareaField id="generate-resource-ids" name="resourceIds" label="Resource IDs" placeholder="Comma-separated resource IDs" />
                </div>
                <TextareaField id="generate-prompt" name="prompt" label="Prompt" placeholder="Generate scenario questions for this objective." required />
                <Button type="submit">Generate</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Draft questions</CardTitle>
              <CardDescription>Draft result list, including mock-generated questions ready for review.</CardDescription>
            </CardHeader>
            <CardContent>{draftQuestions.length > 0 && selectedCertificationId ? <QuestionTable questions={draftQuestions} questionHref={(question) => questionEditorHref(selectedCertificationId, question.id)} publishAction={publishCertDrillQuestionAction} archiveAction={archiveCertDrillQuestionAction} /> : <EmptyState>No draft questions yet.</EmptyState>}</CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="feedback" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Question feedback</CardTitle>
              <CardDescription>Review user feedback and dispute reports for the selected certification.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FeedbackStatusFilter feedbackStatus={normalizedFeedbackStatus} />
              {filteredQuestionFeedback.length > 0 ? <FeedbackTable feedback={filteredQuestionFeedback} /> : <EmptyState>No question feedback yet.</EmptyState>}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function buildCertificationOptions(
  adminCertifications: CertDrillAdminCertification[],
  certifications: CertDrillCertificationListItem[],
): CertificationOption[] {
  const source = adminCertifications.length > 0 ? adminCertifications : certifications;
  return source.map((certification) => ({ id: certification.id, code: certification.code, name: certification.name }));
}

function certdrillAdminOverviewHref() {
  return "/admin/certdrill";
}

function certdrillAdminDetailHref(certificationId: string, params: CertDrillAdminHrefParams = {}) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== undefined) searchParams.append(key, item);
      }
    } else if (value !== undefined) {
      searchParams.set(key, value);
    }
  }

  const query = searchParams.toString();
  return query ? `/admin/certdrill/${certificationId}?${query}` : `/admin/certdrill/${certificationId}`;
}

function normalizeQuestionFilters(filters: QuestionFilters): QuestionFilters {
  const questionStatus = ["draft", "published", "archived"].includes(filters.questionStatus ?? "") ? filters.questionStatus : undefined;
  const questionDifficulty = ["easy", "medium", "hard"].includes(filters.questionDifficulty ?? "") ? filters.questionDifficulty : undefined;
  const questionSort = ["stem-asc", "stem-desc"].includes(filters.questionSort ?? "") ? filters.questionSort : undefined;
  const questionSearch = filters.questionSearch?.trim() || undefined;
  const questionCategoryId = filters.questionCategoryId?.trim() || undefined;

  return {
    questionSearch,
    questionStatus,
    questionDifficulty,
    questionCategoryId,
    questionSort,
  };
}

function filterCertDrillAdminQuestions(
  questions: CertDrillAdminQuestion[],
  filters: QuestionFilters,
) {
  const search = filters.questionSearch?.toLowerCase();
  const filtered = questions.filter((question) => {
    if (filters.questionCategoryId && question.categoryId !== filters.questionCategoryId) return false;
    if (filters.questionStatus && (question.status ?? "draft") !== filters.questionStatus) return false;
    if (filters.questionDifficulty && (question.difficulty ?? "medium") !== filters.questionDifficulty) return false;
    if (!search) return true;

    const searchableText = [
      question.id,
      question.stem,
      question.status ?? "draft",
      question.difficulty ?? "medium",
      ...(question.options ?? []).flatMap((option) => [option.text, option.explanation ?? ""]),
    ].join(" ").toLowerCase();

    return searchableText.includes(search);
  });

  return [...filtered].sort((first, second) => compareQuestions(first, second, filters.questionSort));
}

function compareQuestions(first: CertDrillAdminQuestion, second: CertDrillAdminQuestion, sort?: string) {
  if (sort === "stem-desc") return second.stem.localeCompare(first.stem) || first.id.localeCompare(second.id);
  if (sort === "status-asc") return (first.status ?? "draft").localeCompare(second.status ?? "draft") || first.stem.localeCompare(second.stem) || first.id.localeCompare(second.id);
  if (sort === "difficulty-asc") {
    const difficultyOrder = { easy: 1, medium: 2, hard: 3 };
    return (difficultyOrder[first.difficulty ?? "medium"] - difficultyOrder[second.difficulty ?? "medium"]) || first.stem.localeCompare(second.stem) || first.id.localeCompare(second.id);
  }
  if (sort === "id-asc") return first.id.localeCompare(second.id);

  return first.stem.localeCompare(second.stem) || first.id.localeCompare(second.id);
}

function normalizeFeedbackStatus(status?: string) {
  return status === "open" || status === "reviewed" || status === "resolved" ? status : undefined;
}

function filterQuestionFeedback(feedback: CertDrillAdminQuestionFeedback[], status?: string) {
  return status ? feedback.filter((item) => item.status === status) : feedback;
}


function optionalDateTimeLocal(value?: string | null) {
  return value ? value.slice(0, 16) : undefined;
}

function optionalNumberDefault(value?: number | null) {
  return value == null ? undefined : String(value);
}

function optionalStringDefault(value?: string | number | null) {
  return value == null ? undefined : String(value);
}

function csvDefault(values?: string[] | null) {
  return values && values.length > 0 ? values.join(", ") : undefined;
}

function SelectionLinks({
  newLabel,
  newHref,
  disabled = false,
  children,
}: {
  newLabel: string;
  newHref: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm" disabled={disabled}>
        <Link href={newHref}>{newLabel}</Link>
      </Button>
      {children}
    </div>
  );
}

function CertificationForm({
  action,
  submitLabel,
  idPrefix,
  selectedCertification,
  vendors,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  idPrefix: string;
  selectedCertification?: CertDrillAdminCertification;
  vendors: CertDrillAdminVendor[];
}) {
  return (
    <form action={action} className="space-y-4">
      {selectedCertification ? <input type="hidden" name="certificationId" value={selectedCertification.id} /> : null}
      <CertificationFormFields idPrefix={idPrefix} selectedCertification={selectedCertification} vendors={vendors} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function CertificationFormFields({ idPrefix, selectedCertification, vendors }: { idPrefix: string; selectedCertification?: CertDrillAdminCertification; vendors: CertDrillAdminVendor[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField id={`${idPrefix}-code`} name="code" label="Code" required placeholder="AZ-104" defaultValue={selectedCertification?.code} helperText="Code is required and should match the exam code, for example AZ-104." />
      <VendorField id={`${idPrefix}-vendor`} vendors={vendors} selectedCertification={selectedCertification} required helperText="Vendor is required. Use an existing vendor name when possible." />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-logo-url`} name="logoUrl" value="__none__" label="Clear logo URL" /> : null}
      <TextField id={`${idPrefix}-logo-url`} name="logoUrl" label="Logo URL" type="url" placeholder="https://example.com/logo.svg" defaultValue={selectedCertification?.logoUrl ?? undefined} helperText="URLs must start with http:// or https://." />
      <TextField id={`${idPrefix}-name`} name="name" label="Name" required placeholder="Azure Administrator" defaultValue={selectedCertification?.name} helperText="Name is required and should be the learner-facing certification title." />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-blueprint-source-url`} name="blueprintSourceUrl" value="__none__" label="Clear blueprint URL" /> : null}
      <TextField id={`${idPrefix}-blueprint-source-url`} name="blueprintSourceUrl" label="Blueprint URL" type="url" placeholder="https://learn.microsoft.com/..." defaultValue={selectedCertification?.blueprintSourceUrl ?? undefined} helperText="URLs must start with http:// or https://." />
      <TextField id={`${idPrefix}-question-count-default`} name="questionCountDefault" label="Default count" type="number" min="1" defaultValue={optionalNumberDefault(selectedCertification?.questionCountDefault) ?? "10"} helperText="Must be 1 or greater." />
      <TextField id={`${idPrefix}-quick-drill-question-count`} name="quickDrillQuestionCount" label="Quick Drill count" type="number" min="1" defaultValue={optionalNumberDefault(selectedCertification?.quickDrillQuestionCount) ?? "10"} helperText="Must be 1 or greater." />
      <TextField id={`${idPrefix}-category-drill-question-count`} name="categoryDrillQuestionCount" label="Default Category Drill count" type="number" min="1" defaultValue={optionalNumberDefault(selectedCertification?.categoryDrillQuestionCount) ?? "10"} helperText="Must be 1 or greater." />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-exam-simulation-question-count`} name="examSimulationQuestionCount" value="__none__" label="Clear exam simulation count" /> : null}
      <TextField id={`${idPrefix}-exam-simulation-question-count`} name="examSimulationQuestionCount" label="Exam Simulation count" type="number" min="1" defaultValue={optionalNumberDefault(selectedCertification?.examSimulationQuestionCount)} helperText="Must be 1 or greater when set." />
      <TextField id={`${idPrefix}-exam-simulation-duration-minutes`} name="examSimulationDurationMinutes" label="Exam Simulation duration" type="number" min="1" defaultValue={optionalNumberDefault(selectedCertification?.examSimulationDurationMinutes) ?? "120"} helperText="Must be 1 or greater." />
      <TextField id={`${idPrefix}-pass-threshold-pct`} name="passThresholdPct" label="Pass threshold percent" type="number" min="0" max="100" defaultValue={optionalNumberDefault(selectedCertification?.passThresholdPct) ?? "70"} helperText="Must be between 0 and 100." />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-enabled-at`} name="enabledAt" value="__none__" label="Clear enabled at" /> : null}
      <TextField id={`${idPrefix}-enabled-at`} name="enabledAt" label="Enabled at" type="datetime-local" defaultValue={optionalDateTimeLocal(selectedCertification?.enabledAt)} />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-description`} name="description" value="__none__" label="Clear description" /> : null}
      <TextareaField id={`${idPrefix}-description`} name="description" label="Description" placeholder="Short admin description" defaultValue={selectedCertification?.description ?? undefined} />
      {selectedCertification ? <CheckboxField id={`${idPrefix}-clear-archived-at`} name="archivedAt" value="__none__" label="Clear archived at" /> : null}
      {selectedCertification ? <TextField id={`${idPrefix}-archived-at`} name="archivedAt" label="Archived at" type="datetime-local" defaultValue={optionalDateTimeLocal(selectedCertification.archivedAt)} /> : null}
      {selectedCertification ? <BooleanSelect id={`${idPrefix}-is-active`} name="isActive" label="Active" defaultValue={String(Boolean(selectedCertification.isActive))} /> : <CheckboxField id={`${idPrefix}-is-active`} name="isActive" label="Active" defaultChecked />}
    </div>
  );
}

function VendorField({ id, vendors, selectedCertification, helperText, required }: { id: string; vendors: CertDrillAdminVendor[]; selectedCertification?: CertDrillAdminCertification; helperText?: string; required?: boolean }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Vendor{required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
      <Input id={id} name="vendor" list={`${id}-vendors`} placeholder="Search vendor" defaultValue={selectedCertification?.vendor ?? ""} required={required} />
      <datalist id={`${id}-vendors`}>
        {vendors.map((vendor) => (
          <option key={vendor.id} value={vendor.name} />
        ))}
      </datalist>
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

function CategoryForm({
  action,
  submitLabel,
  categories,
  selectedCertificationId,
  selectedCategory,
  idPrefix,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedCategory?: CertDrillAdminCategory;
  idPrefix: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="certificationId" value={selectedCertificationId} />
      {selectedCategory ? <input type="hidden" name="categoryId" value={selectedCategory.id} /> : null}
      <CategoryFormFields categories={categories} selectedCategory={selectedCategory} idPrefix={idPrefix} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function CategoryFormFields({
  categories,
  selectedCategory,
  idPrefix,
}: {
  categories: CertDrillAdminCategory[];
  selectedCategory?: CertDrillAdminCategory;
  idPrefix: string;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CategorySelect id={`${idPrefix}-parent-category-id`} name="parentCategoryId" categories={categories.filter((category) => category.id !== selectedCategory?.id)} label="Parent category" includeEmpty emptyLabel="None" clearLabel={selectedCategory ? "Clear parent category" : undefined} defaultValue={selectedCategory?.parentCategoryId ?? ""} />
      <TextField id={`${idPrefix}-code`} name="code" label="Code" required placeholder="identity" defaultValue={selectedCategory?.code} helperText="Code is required and should be stable for reporting." />
      <TextField id={`${idPrefix}-name`} name="name" label="Name" required placeholder="Manage identities" defaultValue={selectedCategory?.name} helperText="Name is required and should match the blueprint domain name." />
      <TextField id={`${idPrefix}-weight-pct`} name="weightPct" label="Weight percent" placeholder="25" defaultValue={optionalStringDefault(selectedCategory?.weightPct)} helperText="Weights must be numeric, use at most 2 decimals, and sibling totals cannot exceed 100." />
      <TextField id={`${idPrefix}-drill-question-count`} name="drillQuestionCount" label="Category Drill override" type="number" min="1" placeholder="Leave empty to use the certification default." defaultValue={optionalNumberDefault(selectedCategory?.drillQuestionCount)} helperText="Must be 1 or greater when set." />
      <TextField id={`${idPrefix}-sort-order`} name="sortOrder" label="Sort order" type="number" defaultValue={optionalNumberDefault(selectedCategory?.sortOrder) ?? "0"} />
    </div>
  );
}

function ExamFormForm({
  action,
  submitLabel,
  categories,
  questions,
  selectedCertificationId,
  selectedExamForm,
  idPrefix,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  questions: CertDrillAdminQuestion[];
  selectedCertificationId: string;
  selectedExamForm?: CertDrillAdminExamForm;
  idPrefix: string;
}) {
  const selectedQuestionIds = new Set(selectedExamForm?.questionIds ?? []);
  const categoryDistribution = buildCategoryDistribution(questions, categories, selectedQuestionIds);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="certificationId" value={selectedCertificationId} />
      {selectedExamForm ? <input type="hidden" name="examFormId" value={selectedExamForm.id} /> : null}
      <ExamFormFields selectedExamForm={selectedExamForm} idPrefix={idPrefix} />
      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <QuestionPickerTable questions={questions} categories={categories} selectedQuestionIds={selectedQuestionIds} />
        <CategoryDistributionSummary distribution={categoryDistribution} selectedCount={selectedQuestionIds.size} hasSelectedExamForm={Boolean(selectedExamForm)} />
      </div>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function ExamFormFields({ selectedExamForm, idPrefix }: { selectedExamForm?: CertDrillAdminExamForm; idPrefix: string }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <TextField id={`${idPrefix}-name`} name="name" label="Form name" required placeholder="Practice Exam A" defaultValue={selectedExamForm?.name} helperText="Form name is required." />
      <TextField id={`${idPrefix}-duration-minutes`} name="durationMinutes" label="Duration minutes" type="number" min="1" defaultValue={optionalNumberDefault(selectedExamForm?.durationMinutes) ?? "120"} helperText="Must be 1 or greater." />
      <TextField id={`${idPrefix}-sort-order`} name="sortOrder" label="Sort order" type="number" defaultValue={optionalNumberDefault(selectedExamForm?.sortOrder) ?? "0"} />
      <TextareaField id={`${idPrefix}-question-ids`} name="questionIds" label="Manual question ID fallback" placeholder="Optional: paste IDs instead of using picker" defaultValue={undefined} helperText="At least one question is required for an exam form." />
      <TextareaField id={`${idPrefix}-description`} name="description" label="Description" placeholder="Optional form notes" defaultValue={selectedExamForm?.description ?? undefined} />
      {selectedExamForm ? <BooleanSelect id={`${idPrefix}-is-active`} name="isActive" label="Active" defaultValue={String(Boolean(selectedExamForm.isActive))} /> : <CheckboxField id={`${idPrefix}-is-active`} name="isActive" label="Active" defaultChecked />}
    </div>
  );
}

type CategoryDistributionItem = {
  key: string;
  label: string;
  count: number;
};

function buildCategoryDistribution(
  questions: CertDrillAdminQuestion[],
  categories: CertDrillAdminCategory[],
  questionIds: Iterable<string>,
): CategoryDistributionItem[] {
  const categoryLabels = new Map(categories.map((category) => [category.id, `${category.code} - ${category.name}`]));
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const distribution = new Map<string, CategoryDistributionItem>();

  for (const questionId of questionIds) {
    const question = questionsById.get(questionId);
    const key = question?.categoryId ?? "unknown";
    const label = question?.categoryId ? (categoryLabels.get(question.categoryId) ?? question.categoryId) : "Unknown category";
    const item = distribution.get(key) ?? { key, label, count: 0 };
    item.count += 1;
    distribution.set(key, item);
  }

  return [...distribution.values()].sort((first, second) => first.label.localeCompare(second.label));
}

function QuestionPickerTable({
  questions,
  categories,
  selectedQuestionIds,
}: {
  questions: CertDrillAdminQuestion[];
  categories: CertDrillAdminCategory[];
  selectedQuestionIds: Set<string>;
}) {
  const categoryLabels = new Map(categories.map((category) => [category.id, `${category.code} - ${category.name}`]));

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <div className="text-sm font-semibold">Question picker</div>
        <p className="text-sm text-muted-foreground">Select questions to add to this form. Duplicate question IDs are removed before saving.</p>
      </div>
      <input type="hidden" name="questionPickerPresent" value="1" />
      {questions.length > 0 ? (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Select</TableHead>
                <TableHead>Question</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Difficulty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((question) => (
                <TableRow key={question.id}>
                  <TableCell>
                    <input
                      id={`exam-form-picker-${question.id}`}
                      type="checkbox"
                      name="selectedQuestionIds"
                      value={question.id}
                      defaultChecked={selectedQuestionIds.has(question.id)}
                    />
                  </TableCell>
                  <TableCell>
                    <label htmlFor={`exam-form-picker-${question.id}`} className="block max-w-xl cursor-pointer whitespace-normal">
                      <span className="block font-mono text-xs text-muted-foreground">{question.id}</span>
                      {question.stem}
                    </label>
                  </TableCell>
                  <TableCell>{categoryLabels.get(question.categoryId) ?? question.categoryId}</TableCell>
                  <TableCell><Badge variant="outline">{question.status ?? "draft"}</Badge></TableCell>
                  <TableCell>{question.difficulty ?? "medium"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : <EmptyState>No questions yet.</EmptyState>}
    </div>
  );
}

function CategoryDistributionSummary({ distribution, selectedCount, hasSelectedExamForm }: { distribution: CategoryDistributionItem[]; selectedCount: number; hasSelectedExamForm: boolean }) {
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <div className="text-sm font-semibold">Current form distribution</div>
        <p className="text-sm text-muted-foreground">
          {hasSelectedExamForm ? `${selectedCount.toLocaleString()} saved form questions.` : "Select questions to build a distribution after saving."}
        </p>
      </div>
      <div>
        <div className="text-sm font-semibold">Category distribution</div>
        {distribution.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {distribution.map((item) => (
              <Badge key={item.key} variant="secondary">
                {item.label}: {item.count.toLocaleString()}
              </Badge>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-muted-foreground">No saved question distribution yet.</p>}
      </div>
    </div>
  );
}

function ResourceForm({
  action,
  submitLabel,
  categories,
  selectedCertificationId,
  selectedResource,
  idPrefix,
}: {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  categories: CertDrillAdminCategory[];
  selectedCertificationId: string;
  selectedResource?: CertDrillAdminResource;
  idPrefix: string;
}) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="certificationId" value={selectedCertificationId} />
      {selectedResource ? <input type="hidden" name="resourceId" value={selectedResource.id} /> : null}
      <ResourceFormFields categories={categories} selectedResource={selectedResource} idPrefix={idPrefix} />
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function ResourceFormFields({
  categories,
  idPrefix,
  selectedResource,
}: {
  categories: CertDrillAdminCategory[];
  idPrefix: string;
  selectedResource?: CertDrillAdminResource;
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CategorySelect id={`${idPrefix}-category-id`} name="categoryId" categories={categories} label="Category" includeEmpty emptyLabel="None" clearLabel={selectedResource ? "Clear category" : undefined} defaultValue={selectedResource?.categoryId ?? ""} />
      <TextField id={`${idPrefix}-url`} name="url" label="URL" required type="url" placeholder="https://learn.microsoft.com/..." defaultValue={selectedResource?.url} helperText="Resource URL is required. URLs must start with http:// or https://." />
      <TextField id={`${idPrefix}-title`} name="title" label="Title" required placeholder="Learn module title" defaultValue={selectedResource?.title} helperText="Title is required." />
      <SelectField id={`${idPrefix}-source-type`} name="sourceType" label="Source type" defaultValue={selectedResource?.sourceType ?? "module"}>
        <option value="module">Module</option>
        <option value="unit">Unit</option>
        <option value="study-guide">Study guide</option>
        <option value="exam-blueprint">Exam blueprint</option>
        <option value="doc">Doc</option>
      </SelectField>
      <SelectField id={`${idPrefix}-content-mode`} name="contentMode" label="Content mode" defaultValue={selectedResource?.contentMode ?? "deep_content"}>
        <option value="deep_content">Deep content</option>
        <option value="outline_blueprint">Outline blueprint</option>
      </SelectField>
      <SelectField id={`${idPrefix}-status`} name="status" label="Status" defaultValue={selectedResource?.status ?? "pending"}>
        <option value="pending">Pending</option>
        <option value="ingested">Ingested</option>
        <option value="failed">Failed</option>
      </SelectField>
      <TextareaField id={`${idPrefix}-raw-content`} name="rawContent" label="Raw content placeholder" placeholder="Optional copied outline or notes" defaultValue={selectedResource?.rawContent ?? undefined} />
    </div>
  );
}

function CertificationSelect({ id, name, options, selectedCertificationId, includeEmpty = false }: { id: string; name: string; options: CertificationOption[]; selectedCertificationId?: string; includeEmpty?: boolean }) {
  return (
    <SelectField id={id} name={name} label="Certification" defaultValue={selectedCertificationId ?? ""}>
      {includeEmpty ? <option value="">Keep current certification</option> : null}
      {options.length > 0 ? options.map((certification) => (
        <option key={certification.id} value={certification.id}>{certification.code} - {certification.name}</option>
      )) : <option value="">Create a certification first</option>}
    </SelectField>
  );
}

function CategorySelect({
  id,
  name,
  categories,
  label,
  includeEmpty = false,
  emptyLabel = "None",
  clearLabel,
  defaultValue,
  required = false,
}: {
  id: string;
  name: string;
  categories: CertDrillAdminCategory[];
  label: string;
  includeEmpty?: boolean;
  emptyLabel?: string;
  clearLabel?: string;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <SelectField id={id} name={name} label={label} defaultValue={defaultValue} required={required}>
      {includeEmpty ? <option value="">{emptyLabel}</option> : null}
      {clearLabel ? <option value="__none__">{clearLabel}</option> : null}
      {categories.length > 0 ? categories.map((category) => (
        <option key={category.id} value={category.id}>{category.code} - {category.name}</option>
      )) : <option value="">Create a category first</option>}
    </SelectField>
  );
}

function QuestionSelect({ id, name, questions, label }: { id: string; name: string; questions: CertDrillAdminQuestion[]; label: string }) {
  return (
    <SelectField id={id} name={name} label={label} className="min-w-80">
      {questions.length > 0 ? questions.map((question) => (
        <option key={question.id} value={question.id}>{question.id} - {question.stem.slice(0, 80)}</option>
      )) : <option value="">Create a question first</option>}
    </SelectField>
  );
}

function FeedbackStatusFilter({ feedbackStatus }: { feedbackStatus?: string }) {
  return (
    <form className="grid gap-4 rounded-lg border p-4 md:grid-cols-[minmax(0,16rem)_auto_auto] md:items-end">
      <SelectField id="feedback-status-filter" name="feedbackStatus" label="Filter feedback by status" defaultValue={feedbackStatus ?? ""}>
        <option value="">All feedback statuses</option>
        <option value="open">Open</option>
        <option value="reviewed">Reviewed</option>
        <option value="resolved">Resolved</option>
      </SelectField>
      <Button type="submit">Apply filter</Button>
      <Button asChild variant="outline">
        <Link href="?">Clear filter</Link>
      </Button>
    </form>
  );
}


function TextField({ id, label, className, helperText, required, ...props }: ComponentProps<typeof Input> & { id: string; label: string; helperText?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
      <Input id={id} className={className} required={required} {...props} />
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

function TextareaField({ id, label, className, helperText, required, ...props }: ComponentProps<typeof Textarea> & { id: string; label: string; helperText?: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
      <Textarea id={id} className={className} required={required} {...props} />
      {helperText ? <p className="text-xs text-muted-foreground">{helperText}</p> : null}
    </div>
  );
}

function SelectField({ id, label, className = "", children, required, ...props }: ComponentProps<"select"> & { id: string; label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}{required ? <span className="ml-1 text-xs text-muted-foreground">Required</span> : null}</Label>
      <select id={id} className={`border-input h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-xs ${className}`} required={required} {...props}>
        {children}
      </select>
    </div>
  );
}

function BooleanSelect({ id, name, label, defaultValue = "" }: { id: string; name: string; label: string; defaultValue?: string }) {
  return (
    <SelectField id={id} name={name} label={label} defaultValue={defaultValue}>
      <option value="">Keep current value</option>
      <option value="true">Yes</option>
      <option value="false">No</option>
    </SelectField>
  );
}

function CheckboxField({ id, label, ...props }: ComponentProps<"input"> & { id: string; label: string }) {
  return (
    <label htmlFor={id} className="flex items-center gap-2 rounded-md border p-3 text-sm font-medium">
      <input id={id} type="checkbox" {...props} />
      {label}
    </label>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{children}</div>;
}

function CertificationCatalogTable({ certifications }: { certifications: CertDrillCertificationListItem[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Vendor</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Published count</TableHead>
          <TableHead className="text-right">Quick Drill count</TableHead>
          <TableHead className="text-right">Category Drill count</TableHead>
          <TableHead className="text-right">Exam Simulation count</TableHead>
          <TableHead className="text-right">Exam Simulation duration</TableHead>
          <TableHead>Active Exam Forms</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {certifications.map((certification) => {
          const activeExamForms = (certification.examForms ?? []).filter((form) => form.isActive);
          const quickDrillCount = certification.quickDrillQuestionCount ?? certification.questionCountDefault;
          const categoryDrillCount = certification.categoryDrillQuestionCount ?? certification.questionCountDefault;
          const examSimulationCount = certification.examSimulationQuestionCount ?? certification.questionCountDefault;
          const examSimulationDurationMinutes = certification.examSimulationDurationMinutes ?? 120;

          return (
            <TableRow key={certification.id}>
              <TableCell className="font-medium">{certification.code}</TableCell>
              <TableCell>{certification.vendor}</TableCell>
              <TableCell>{certification.name}</TableCell>
              <TableCell className="text-right">{certification.publishedQuestionCount.toLocaleString()}</TableCell>
              <TableCell className="text-right">{quickDrillCount.toLocaleString()}</TableCell>
              <TableCell className="text-right">{categoryDrillCount.toLocaleString()}</TableCell>
              <TableCell className="text-right">{examSimulationCount.toLocaleString()}</TableCell>
              <TableCell className="text-right">{examSimulationDurationMinutes.toLocaleString()} min</TableCell>
              <TableCell>
                {activeExamForms.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {activeExamForms.map((form) => (
                      <Badge key={form.id} variant="outline">
                        {form.name} - {form.questionCount.toLocaleString()} questions - {form.durationMinutes.toLocaleString()} min
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function AdminCertificationTable({ certifications }: { certifications: CertDrillAdminCertification[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="text-right">Default count</TableHead>
          <TableHead className="text-right">Timer</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {certifications.map((certification) => (
          <TableRow key={certification.id}>
            <TableCell className="font-mono text-xs">{certification.id}</TableCell>
            <TableCell className="font-medium">{certification.code}</TableCell>
            <TableCell>{certification.name}</TableCell>
            <TableCell>{certification.isActive ? "Yes" : "No"}</TableCell>
            <TableCell className="text-right">{(certification.questionCountDefault ?? 10).toLocaleString()}</TableCell>
            <TableCell className="text-right">{(certification.examSimulationDurationMinutes ?? 120).toLocaleString()} min</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AdminCertificationOverviewTable({ certifications }: { certifications: Array<CertDrillAdminCertification | CertDrillCertificationListItem> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {certifications.map((certification) => {
        const publishedQuestionCount = "publishedQuestionCount" in certification ? certification.publishedQuestionCount : 0;
        const archivedAt = "archivedAt" in certification ? certification.archivedAt : null;
        const enabledAt = "enabledAt" in certification ? certification.enabledAt : null;
        const logoUrl = "logoUrl" in certification ? certification.logoUrl : null;
        const isActive = "isActive" in certification ? certification.isActive !== false : true;
        const visibility = archivedAt ? "Archived" : !isActive ? "Inactive" : enabledAt ? "Scheduled" : "Visible";

        return (
          <Link
            key={certification.id}
            href={certdrillAdminDetailHref(certification.id)}
            className="group block h-full rounded-xl outline-none transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Card className="h-full transition-colors group-hover:border-primary/40">
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-sm font-semibold">
                    {logoUrl ? <img src={logoUrl} alt={`${certification.code} logo`} className="size-full object-contain p-1" /> : certification.code.slice(0, 2)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <CardTitle className="truncate text-lg">{certification.code}</CardTitle>
                    <CardDescription className="line-clamp-2">{certification.name}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">{certification.vendor}</Badge>
                  <Badge variant="outline">{visibility}</Badge>
                  <Badge variant="secondary">{publishedQuestionCount.toLocaleString()} questions</Badge>
                </div>
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}

function CategoryTable({ categories, selectedCertificationHref }: { categories: CertDrillAdminCategory[]; selectedCertificationHref: (params?: CertDrillAdminHrefParams) => string }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Code</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          <TableHead className="text-right">Drill count</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {categories.map((category) => (
          <TableRow key={category.id}>
            <TableCell className="font-medium">
              <Link href={selectedCertificationHref({ questionCategoryId: category.id, tab: "questions" })} className="hover:underline">
                {category.code}
              </Link>
            </TableCell>
            <TableCell>
              <Link href={selectedCertificationHref({ questionCategoryId: category.id, tab: "questions" })} className="hover:underline">
                {category.name}
              </Link>
            </TableCell>
            <TableCell className="text-right">{category.weightPct ?? "-"}</TableCell>
            <TableCell className="text-right">{category.drillQuestionCount ?? "-"}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <Dialog>
                  <DialogTrigger asChild>
                    <Button size="icon" variant="outline" aria-label={`Edit ${category.code}`}>
                      <Pencil className="size-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
                    <DialogHeader>
                      <DialogTitle>Update category</DialogTitle>
                      <DialogDescription>Patch category details for this certification.</DialogDescription>
                    </DialogHeader>
                    <CategoryForm
                      action={updateCertDrillCategoryAction}
                      submitLabel="Update category"
                      categories={categories}
                      selectedCertificationId={category.certificationId}
                      selectedCategory={category}
                      idPrefix={`category-${category.id}`}
                    />
                  </DialogContent>
                </Dialog>
                <form action={archiveCertDrillCategoryAction}>
                  <input type="hidden" name="categoryId" value={category.id} />
                  <Button size="icon" variant="destructive" aria-label={`Archive ${category.code}`}>
                    <Archive className="size-4" />
                    <span className="sr-only">Archive category</span>
                  </Button>
                </form>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function QuestionTable({
  questions,
  questionHref,
  publishAction,
  archiveAction,
  sort,
  stemSortHref,
  page,
  pageCount,
  previousPageHref,
  nextPageHref,
}: {
  questions: CertDrillAdminQuestion[];
  questionHref: (question: CertDrillAdminQuestion) => string;
  publishAction: (formData: FormData) => void | Promise<void>;
  archiveAction: (formData: FormData) => void | Promise<void>;
  sort?: string;
  stemSortHref?: string;
  page?: number;
  pageCount?: number;
  previousPageHref?: string;
  nextPageHref?: string;
}) {
  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead aria-sort={sort === "stem-desc" ? "descending" : "ascending"}>
              {stemSortHref ? (
                <LocalizedLink href={stemSortHref} aria-label={sort === "stem-desc" ? "Sort Stem A-Z" : "Sort Stem Z-A"} className="hover:underline">
                  Stem <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span>
                </LocalizedLink>
              ) : <>Stem <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span></>}
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead className="text-right">Options</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => {
            const questionStatus = question.status ?? "draft";

            return (
              <TableRow key={question.id}>
                <TableCell className="font-mono text-xs">
                  <LocalizedLink href={questionHref(question)} className="hover:underline" aria-label={`Open question ${question.id}`}>{compactQuestionId(question.id)}</LocalizedLink>
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  <LocalizedLink href={questionHref(question)} className="hover:underline">{question.stem}</LocalizedLink>
                </TableCell>
                <TableCell><Badge variant="outline">{questionStatus}</Badge></TableCell>
                <TableCell>{question.difficulty ?? "medium"}</TableCell>
                <TableCell className="text-right">{(question.options ?? []).length.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <QuestionActionsMenu
                    questionId={question.id}
                    status={questionStatus}
                    edit={<LocalizedLink href={questionHref(question)}>Edit</LocalizedLink>}
                    publishAction={publishAction}
                    archiveAction={archiveAction}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {page && pageCount ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p>
          <div className="flex gap-2">
            {previousPageHref ? (
              <Button asChild variant="outline" size="sm">
                <LocalizedLink href={previousPageHref}>Previous</LocalizedLink>
              </Button>
            ) : <Button variant="outline" size="sm" disabled>Previous</Button>}
            {nextPageHref ? (
              <Button asChild variant="outline" size="sm">
                <LocalizedLink href={nextPageHref}>Next</LocalizedLink>
              </Button>
            ) : <Button variant="outline" size="sm" disabled>Next</Button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExamFormTable({ examForms }: { examForms: CertDrillAdminExamForm[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Active</TableHead>
          <TableHead className="text-right">Duration</TableHead>
          <TableHead className="text-right">Question IDs</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {examForms.map((examForm) => (
          <TableRow key={examForm.id}>
            <TableCell className="font-mono text-xs">{examForm.id}</TableCell>
            <TableCell className="font-medium">{examForm.name}</TableCell>
            <TableCell>{examForm.isActive ? "Yes" : "No"}</TableCell>
            <TableCell className="text-right">{(examForm.durationMinutes ?? 120).toLocaleString()} min</TableCell>
            <TableCell className="text-right">{examForm.questionIds.length.toLocaleString()}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ResourceTable({ resources }: { resources: CertDrillAdminResource[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>ID</TableHead>
          <TableHead>Title</TableHead>
          <TableHead>URL</TableHead>
          <TableHead>Content mode</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {resources.map((resource) => (
          <TableRow key={resource.id}>
            <TableCell className="font-mono text-xs">{resource.id}</TableCell>
            <TableCell className="font-medium">{resource.title}</TableCell>
            <TableCell className="max-w-sm truncate">{resource.url}</TableCell>
            <TableCell>{resource.contentMode}</TableCell>
            <TableCell><Badge variant="outline">{resource.status ?? "pending"}</Badge></TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FeedbackTable({ feedback }: { feedback: CertDrillAdminQuestionFeedback[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Question ID</TableHead>
          <TableHead>User ID</TableHead>
          <TableHead className="text-right">Rating</TableHead>
          <TableHead>Dispute</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Message</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {feedback.map((item) => (
          <TableRow key={item.id}>
            <TableCell className="font-mono text-xs">{item.questionId}</TableCell>
            <TableCell className="font-mono text-xs">{item.userId}</TableCell>
            <TableCell className="text-right">{item.rating.toLocaleString()}</TableCell>
            <TableCell>{item.disputeCorrectAnswer ? "Yes" : "No"}</TableCell>
            <TableCell><Badge variant="outline">{item.status}</Badge></TableCell>
            <TableCell className="max-w-xl whitespace-normal">{item.message ?? "-"}</TableCell>
            <TableCell className="text-right">
              <div className="flex justify-end gap-2">
                <FeedbackStatusButton feedbackId={item.id} status="reviewed" label="Mark reviewed" disabled={item.status === "reviewed"} />
                <FeedbackStatusButton feedbackId={item.id} status="resolved" label="Mark resolved" disabled={item.status === "resolved"} />
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function FeedbackStatusButton({ feedbackId, status, label, disabled }: { feedbackId: string; status: "reviewed" | "resolved"; label: string; disabled: boolean }) {
  return (
    <form action={updateCertDrillQuestionFeedbackAction}>
      <input type="hidden" name="feedbackId" value={feedbackId} />
      <input type="hidden" name="status" value={status} />
      <Button type="submit" size="sm" variant="outline" disabled={disabled}>{label}</Button>
    </form>
  );
}
