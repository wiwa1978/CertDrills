import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CertDrillAdminCertification,
  CertDrillAdminResource,
  CertDrillAdminQuestion,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";
import type { CertDrillCertificationListItem } from "@platform/contracts";

const {
  getCertDrillCertificationsServer,
  listCertDrillAdminBlueprintParseRunsServer,
  listCertDrillAdminCategoriesServer,
  listCertDrillAdminCertificationsServer,
  listCertDrillAdminExamFormsServer,
  listCertDrillAdminQuestionGenerationJobsServer,
  listCertDrillAdminScenarioGenerationJobsServer,
  listCertDrillAdminQuestionFeedbackServer,
  listCertDrillAdminQuestionsServer,
  listCertDrillAdminResourcesServer,
  listCertDrillAdminScenariosServer,
  listCertDrillAdminVendorsServer,
} = vi.hoisted(() => ({
  getCertDrillCertificationsServer: vi.fn(),
  listCertDrillAdminBlueprintParseRunsServer: vi.fn(),
  listCertDrillAdminCategoriesServer: vi.fn(),
  listCertDrillAdminCertificationsServer: vi.fn(),
  listCertDrillAdminExamFormsServer: vi.fn(),
  listCertDrillAdminQuestionGenerationJobsServer: vi.fn(),
  listCertDrillAdminScenarioGenerationJobsServer: vi.fn(),
  listCertDrillAdminQuestionFeedbackServer: vi.fn(),
  listCertDrillAdminQuestionsServer: vi.fn(),
  listCertDrillAdminResourcesServer: vi.fn(),
  listCertDrillAdminScenariosServer: vi.fn(),
  listCertDrillAdminVendorsServer: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children?: ReactNode }) => createElement("a", { href }, children),
}));

vi.mock("@/components/client-only", () => ({
  ClientOnly: ({ children, fallback }: { children?: ReactNode; fallback?: ReactNode }) => createElement(
    Fragment,
    null,
    fallback ?? children,
  ),
}));

vi.mock("@/lib/api/certdrill.server", () => ({
  getCertDrillCertificationsServer,
  listCertDrillAdminBlueprintParseRunsServer,
  listCertDrillAdminCategoriesServer,
  listCertDrillAdminCertificationsServer,
  listCertDrillAdminExamFormsServer,
  listCertDrillAdminQuestionGenerationJobsServer,
  listCertDrillAdminScenarioGenerationJobsServer,
  listCertDrillAdminQuestionFeedbackServer,
  listCertDrillAdminQuestionsServer,
  listCertDrillAdminResourcesServer,
  listCertDrillAdminScenariosServer,
  listCertDrillAdminVendorsServer,
}));

vi.mock("@/modules/certdrill/admin-actions", () => ({
  archiveCertDrillCategoryAction: vi.fn(),
  archiveCertDrillCertificationAction: vi.fn(),
  archiveCertDrillQuestionAction: vi.fn(),
  createCertDrillCategoryAction: vi.fn(),
  createCertDrillCertificationAction: vi.fn(),
  createCertDrillQuestionAction: vi.fn(),
  publishCertDrillQuestionAction: vi.fn(),
  publishSelectedCertDrillQuestionsAction: vi.fn(),
  unpublishSelectedCertDrillQuestionsAction: vi.fn(),
  setSelectedCertDrillQuestionsPracticeAction: vi.fn(),
  setSelectedCertDrillQuestionsAssessmentAction: vi.fn(),
  updateCertDrillCategoryAction: vi.fn(),
  updateCertDrillCertificationAction: vi.fn(),
  updateCertDrillQuestionAction: vi.fn(),
  updateCertDrillQuestionFeedbackAction: vi.fn(),
}));

vi.mock("@/modules/certdrill/question-filter-bar", () => ({
  QuestionFilterBar: () => createElement("div", { "data-testid": "question-filter-bar" }),
}));

vi.mock("@/modules/certdrill/question-actions-menu", () => ({
  QuestionActionsMenu: () => createElement("div", { "data-testid": "question-actions-menu" }),
}));

vi.mock("@/modules/certdrill/question-form", () => ({
  QuestionForm: () => createElement("div", { "data-testid": "question-form" }),
}));

vi.mock("@/modules/certdrill/exam-form-create-dialog", () => ({
  ExamFormCreateDialog: ({ certificationId }: { certificationId: string }) => createElement("div", {
    "data-testid": "exam-form-create-dialog",
    "data-certification-id": certificationId,
  }),
}));

vi.mock("@/modules/certdrill/exam-form-list", () => ({
  ExamFormList: () => createElement("div", { "data-testid": "exam-form-list" }),
}));

vi.mock("@/modules/certdrill/question-generation-control", () => ({
  QuestionGenerationControl: ({ certificationId }: { certificationId: string }) => createElement("div", {
    "data-testid": "question-generation-control",
    "data-certification-id": certificationId,
  }),
  QuestionGenerationStatusBanner: () => createElement("div", { "data-testid": "question-generation-status-banner" }),
}));

vi.mock("@/modules/certdrill/scenario-admin", () => ({
  ScenarioAdmin: () => createElement("div", { "data-testid": "scenario-admin" }),
}));

vi.mock("@/modules/certdrill/category-discovery-control", () => ({
  CategoryDiscoveryControl: ({
    certificationId,
    defaultUrl,
    initialRun,
  }: {
    certificationId: string;
    defaultUrl?: string;
    initialRun?: CertDrillBlueprintParseRun;
  }) => createElement("div", {
    "data-testid": "category-discovery-control",
    "data-certification-id": certificationId,
    "data-default-url": defaultUrl ?? "",
    "data-run-id": initialRun?.id ?? "",
  }),
}));

import { CertDrillAdminPage } from "@/modules/certdrill/admin-page";

function createCatalogCertification(): CertDrillCertificationListItem {
  return {
    id: "cert-1",
    code: "AZ-104",
    name: "Azure Administrator",
    vendor: "Microsoft",
    publishedQuestionCount: 0,
    questionCountDefault: 10,
    questionCount: 0,
    quickDrillQuestionCount: 10,
    categoryDrillQuestionCount: 10,
    examSimulationQuestionCount: 10,
    examSimulationDurationMinutes: 120,
    examForms: [],
  } as unknown as CertDrillCertificationListItem;
}

function createAdminCertification(): CertDrillAdminCertification {
  return {
    id: "cert-1",
    code: "AZ-104",
    name: "Azure Administrator",
    vendor: "Microsoft",
    isActive: true,
    questionCountDefault: 10,
    examSimulationDurationMinutes: 120,
    publishedQuestionCount: 0,
    archivedAt: null,
    enabledAt: null,
    logoUrl: null,
  } as unknown as CertDrillAdminCertification;
}

function createQuestion(questionType?: CertDrillAdminQuestion["questionType"]): CertDrillAdminQuestion {
  return {
    id: `question-${questionType ?? "legacy"}`,
    certificationId: "cert-1",
    categoryId: "category-1",
    stem: `A ${questionType ?? "legacy"} question`,
    questionType,
    status: "draft",
    deliveryPurpose: "practice",
    difficulty: "medium",
    options: [],
  } as CertDrillAdminQuestion;
}

function createResource(overrides: Partial<CertDrillAdminResource> = {}): CertDrillAdminResource {
  return {
    id: "resource-1",
    certificationId: "cert-1",
    categoryId: null,
    url: "https://example.com/blueprint",
    title: "Blueprint source",
    sourceType: "study-guide",
    contentMode: "outline_blueprint",
    status: "ingested",
    rawContent: null,
    ingestedAt: null,
    ingestError: null,
    ...overrides,
  };
}

function createRun(overrides: Partial<CertDrillBlueprintParseRun> = {}): CertDrillBlueprintParseRun {
  return {
    id: "run-1",
    certificationId: "cert-1",
    resourceId: "resource-1",
    status: "completed",
    provider: "azure-ai-foundry",
    model: "gpt-5.5",
    contentChecksum: "checksum-1",
    proposalJson: null,
    confidence: null,
    warningsJson: [],
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:00:00.000Z",
    ...overrides,
  };
}

async function renderPage(props: Parameters<typeof CertDrillAdminPage>[0]) {
  return renderToStaticMarkup(await CertDrillAdminPage(props));
}

describe("CertDrillAdminPage blueprint analysis integration", () => {
  beforeEach(() => {
    getCertDrillCertificationsServer.mockReset();
    listCertDrillAdminBlueprintParseRunsServer.mockReset();
    listCertDrillAdminCategoriesServer.mockReset();
    listCertDrillAdminCertificationsServer.mockReset();
    listCertDrillAdminExamFormsServer.mockReset();
    listCertDrillAdminQuestionGenerationJobsServer.mockReset();
    listCertDrillAdminQuestionFeedbackServer.mockReset();
    listCertDrillAdminQuestionsServer.mockReset();
    listCertDrillAdminResourcesServer.mockReset();
    listCertDrillAdminScenariosServer.mockReset();
    listCertDrillAdminVendorsServer.mockReset();

    getCertDrillCertificationsServer.mockResolvedValue([]);
    listCertDrillAdminCategoriesServer.mockResolvedValue([]);
    listCertDrillAdminCertificationsServer.mockResolvedValue([createAdminCertification()]);
    listCertDrillAdminExamFormsServer.mockResolvedValue([]);
    listCertDrillAdminQuestionGenerationJobsServer.mockResolvedValue([]);
    listCertDrillAdminScenarioGenerationJobsServer.mockResolvedValue([]);
    listCertDrillAdminQuestionFeedbackServer.mockResolvedValue([]);
    listCertDrillAdminQuestionsServer.mockResolvedValue([]);
    listCertDrillAdminResourcesServer.mockResolvedValue([]);
    listCertDrillAdminScenariosServer.mockResolvedValue([]);
    listCertDrillAdminVendorsServer.mockResolvedValue([]);
    listCertDrillAdminBlueprintParseRunsServer.mockResolvedValue([]);
  });

  it("does not load category discovery history on the overview page", async () => {
    const markup = await renderPage({
      certifications: [createCatalogCertification()],
      selectedTab: "categories",
    });

    expect(listCertDrillAdminBlueprintParseRunsServer).not.toHaveBeenCalled();
    expect(markup).not.toContain('data-testid="category-discovery-control"');
  });

  it("shows totals for every question interaction type", async () => {
    listCertDrillAdminQuestionsServer.mockResolvedValue([
      createQuestion(),
      createQuestion("single_choice"),
      createQuestion("matching"),
      createQuestion("fill_blank"),
      { ...createQuestion("fill_blank"), id: "question-fill-blank-2" },
    ]);

    const markup = await renderPage({
      certifications: [createCatalogCertification()],
      selectedCertificationId: "cert-1",
      selectedTab: "questions",
    });

    const countsMarkup = markup.match(/<section aria-label="Question counts"[\s\S]*?<\/section>/)?.[0];
    expect(countsMarkup).toBeDefined();
    expect(countsMarkup).toMatch(/Normal questions[\s\S]*?text-2xl font-bold">2/);
    expect(countsMarkup).toMatch(/Drag and drop[\s\S]*?text-2xl font-bold">1/);
    expect(countsMarkup).toMatch(/Fill in the gap[\s\S]*?text-2xl font-bold">2/);
  });

  it("places one discovery control on Categories with the newest run and source URL", async () => {
    listCertDrillAdminResourcesServer.mockResolvedValue([
      createResource({ id: "resource-1", title: "Resource one", url: "https://example.com/one" }),
      createResource({ id: "resource-2", title: "Resource two", url: "https://example.com/two" }),
      createResource({ id: "resource-3", title: "Resource three", url: "https://example.com/three" }),
    ]);
    listCertDrillAdminBlueprintParseRunsServer.mockResolvedValue([
      createRun({
        id: "run-older",
        resourceId: "resource-1",
        createdAt: "2026-08-07T10:00:00.000Z",
        updatedAt: "2026-08-07T10:00:00.000Z",
      }),
      createRun({
        id: "run-newest",
        resourceId: "resource-2",
        createdAt: "2026-08-07T10:02:00.000Z",
        updatedAt: "2026-08-07T10:03:00.000Z",
      }),
    ]);

    const markup = await renderPage({
      certifications: [createCatalogCertification()],
      selectedCertificationId: "cert-1",
      selectedTab: "categories",
    });

    expect(listCertDrillAdminBlueprintParseRunsServer).toHaveBeenCalledTimes(1);
    expect(listCertDrillAdminBlueprintParseRunsServer).toHaveBeenCalledWith("cert-1");
    expect(markup.match(/data-testid="category-discovery-control"/g)).toHaveLength(1);
    expect(markup).toContain('data-default-url="https://example.com/two"');
    expect(markup).toContain('data-run-id="run-newest"');
  });
});
