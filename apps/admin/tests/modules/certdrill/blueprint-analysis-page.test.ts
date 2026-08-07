import { Fragment, createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  CertDrillAdminCertification,
  CertDrillAdminResource,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";
import type { CertDrillCertificationListItem } from "@platform/contracts";

const {
  getCertDrillCertificationsServer,
  listCertDrillAdminBlueprintParseRunsServer,
  listCertDrillAdminCategoriesServer,
  listCertDrillAdminCertificationsServer,
  listCertDrillAdminExamFormsServer,
  listCertDrillAdminQuestionFeedbackServer,
  listCertDrillAdminQuestionsServer,
  listCertDrillAdminResourcesServer,
  listCertDrillAdminVendorsServer,
} = vi.hoisted(() => ({
  getCertDrillCertificationsServer: vi.fn(),
  listCertDrillAdminBlueprintParseRunsServer: vi.fn(),
  listCertDrillAdminCategoriesServer: vi.fn(),
  listCertDrillAdminCertificationsServer: vi.fn(),
  listCertDrillAdminExamFormsServer: vi.fn(),
  listCertDrillAdminQuestionFeedbackServer: vi.fn(),
  listCertDrillAdminQuestionsServer: vi.fn(),
  listCertDrillAdminResourcesServer: vi.fn(),
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
  listCertDrillAdminQuestionFeedbackServer,
  listCertDrillAdminQuestionsServer,
  listCertDrillAdminResourcesServer,
  listCertDrillAdminVendorsServer,
}));

vi.mock("@/modules/certdrill/admin-actions", () => ({
  archiveCertDrillCategoryAction: vi.fn(),
  archiveCertDrillCertificationAction: vi.fn(),
  archiveCertDrillQuestionAction: vi.fn(),
  createCertDrillCategoryAction: vi.fn(),
  createCertDrillCertificationAction: vi.fn(),
  createCertDrillMockGenerationAction: vi.fn(),
  createCertDrillQuestionAction: vi.fn(),
  createCertDrillResourceAction: vi.fn(),
  ingestCertDrillResourceAction: vi.fn(),
  publishCertDrillQuestionAction: vi.fn(),
  updateCertDrillCategoryAction: vi.fn(),
  updateCertDrillCertificationAction: vi.fn(),
  updateCertDrillQuestionAction: vi.fn(),
  updateCertDrillQuestionFeedbackAction: vi.fn(),
  updateCertDrillResourceAction: vi.fn(),
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

vi.mock("@/modules/certdrill/blueprint-analysis-control", () => ({
  BlueprintAnalysisControl: ({
    certificationId,
    resource,
    initialRun,
  }: {
    certificationId: string;
    resource: CertDrillAdminResource;
    initialRun?: CertDrillBlueprintParseRun;
  }) => createElement("div", {
    "data-testid": "blueprint-analysis-control",
    "data-certification-id": certificationId,
    "data-resource-id": resource.id,
    "data-run-id": initialRun?.id ?? "",
    "data-run-created-at": initialRun?.createdAt ?? "",
    "data-run-updated-at": initialRun?.updatedAt ?? "",
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
    listCertDrillAdminQuestionFeedbackServer.mockReset();
    listCertDrillAdminQuestionsServer.mockReset();
    listCertDrillAdminResourcesServer.mockReset();
    listCertDrillAdminVendorsServer.mockReset();

    getCertDrillCertificationsServer.mockResolvedValue([]);
    listCertDrillAdminCategoriesServer.mockResolvedValue([]);
    listCertDrillAdminCertificationsServer.mockResolvedValue([createAdminCertification()]);
    listCertDrillAdminExamFormsServer.mockResolvedValue([]);
    listCertDrillAdminQuestionFeedbackServer.mockResolvedValue([]);
    listCertDrillAdminQuestionsServer.mockResolvedValue([]);
    listCertDrillAdminResourcesServer.mockResolvedValue([]);
    listCertDrillAdminVendorsServer.mockResolvedValue([]);
    listCertDrillAdminBlueprintParseRunsServer.mockResolvedValue([]);
  });

  it("does not load blueprint parse runs on the overview page", async () => {
    const markup = await renderPage({
      certifications: [createCatalogCertification()],
      selectedTab: "resources",
    });

    expect(listCertDrillAdminBlueprintParseRunsServer).not.toHaveBeenCalled();
    expect(markup).toContain("No resources yet.");
    expect(markup).not.toContain('data-testid="blueprint-analysis-control"');
  });

  it("loads blueprint parse runs only for a selected certification and passes each resource its newest run", async () => {
    listCertDrillAdminResourcesServer.mockResolvedValue([
      createResource({ id: "resource-1", title: "Resource one" }),
      createResource({ id: "resource-2", title: "Resource two" }),
      createResource({ id: "resource-3", title: "Resource three" }),
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
        resourceId: "resource-1",
        createdAt: "2026-08-07T10:01:00.000Z",
        updatedAt: "2026-08-07T10:01:30.000Z",
      }),
      createRun({
        id: "run-tie-a",
        resourceId: "resource-2",
        createdAt: "2026-08-07T10:02:00.000Z",
        updatedAt: "2026-08-07T10:03:00.000Z",
      }),
      createRun({
        id: "run-tie-b",
        resourceId: "resource-2",
        createdAt: "2026-08-07T10:02:00.000Z",
        updatedAt: "2026-08-07T10:03:00.000Z",
      }),
    ]);

    const markup = await renderPage({
      certifications: [createCatalogCertification()],
      selectedCertificationId: "cert-1",
      selectedTab: "resources",
    });

    expect(listCertDrillAdminBlueprintParseRunsServer).toHaveBeenCalledTimes(1);
    expect(listCertDrillAdminBlueprintParseRunsServer).toHaveBeenCalledWith("cert-1");
    expect(markup).toContain('data-testid="blueprint-analysis-control"');
    expect(markup).toContain('data-resource-id="resource-1" data-run-id="run-newest"');
    expect(markup).toContain('data-resource-id="resource-2" data-run-id="run-tie-b"');
    expect(markup).toContain('data-resource-id="resource-3" data-run-id=""');
  });
});
