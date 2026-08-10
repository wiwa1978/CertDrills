import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillVendors,
  certdrillExamCategories,
  certdrillExamForms,
  certdrillExamFormScenarios,
  certdrillExamAttempts,
  certdrillLearnResources,
  certdrillQuestionFeedback,
  certdrillQuestionGenerationJobs,
  certdrillQuestions,
  certdrillReviewQueue,
  certdrillScenarios,
  type CertDrillDifficulty,
  type CertDrillQuestionStatus,
  type CertDrillQuestionDeliveryPurpose,
  type CertDrillQuestionInteraction,
  type CertDrillQuestionType,
  type CertDrillQuestionFeedbackStatus,
  type CertDrillScenarioContent,
} from "@platform/platform-db";

import {
  createCertDrillAdminQuestionIndex,
  createDrizzleAdminQuestionIndexRepository,
  type AdminQuestionIndexQueryInput,
} from "./admin-question-index";
import {
  createQuestionImportService,
  type QuestionImportConfirmInput,
  type QuestionImportPreviewInput,
} from "./question-import-service";
import { BlueprintParserError, type BlueprintParser } from "./blueprint-parser";
import { createBlueprintParseService } from "./blueprint-parse-service";
import { createResourceIngestor, type ResourceIngestor } from "./resource-ingestion";
import { QuestionGeneratorError, type QuestionGenerator } from "./question-generator";
import { createQuestionGenerationService } from "./question-generation-service";
import type { QuestionGenerationConfig } from "./question-generation-proposal";
import { createScenarioGenerationService } from "./scenario-generation-service";
import { ScenarioGeneratorError, type ScenarioGenerator } from "./scenario-generator";
import { ExamFormAssignmentError, planExamFormAssignment, topLevelCategoryId, validateExamFormAssignment } from "./exam-form-assignment";
import { validateCategorySiblingWeights, validateQuestionForPublish } from "./validation";
import { ScenarioValidationError, type ScenarioInput, validateScenarioGraph } from "./scenario-validation";

type CertDrillAdminQuestionIndex = Pick<
  ReturnType<typeof createCertDrillAdminQuestionIndex>,
  "query"
>;

type CertDrillAdminQuestionImportService = Pick<
  ReturnType<typeof createQuestionImportService>,
  "preview" | "confirm"
>;

type CertDrillAdminBlueprintParseService = Pick<
  ReturnType<typeof createBlueprintParseService>,
  "start" | "get" | "list" | "processPending"
>;
type CertDrillAdminQuestionGenerationService = Pick<
  ReturnType<typeof createQuestionGenerationService>,
  "start" | "get" | "list" | "processPending"
>;
type CertDrillAdminScenarioGenerationService = Pick<ReturnType<typeof createScenarioGenerationService>, "start" | "get" | "list" | "processPending">;


type CertDrillAdminServiceDeps = {
  db: any;
  rng?: () => number;
  questionIndex?: CertDrillAdminQuestionIndex;
  questionImport?: CertDrillAdminQuestionImportService;
  blueprintParse?: CertDrillAdminBlueprintParseService;
  blueprintParser?: BlueprintParser;
  questionGeneration?: CertDrillAdminQuestionGenerationService;
  questionGenerator?: QuestionGenerator;
  scenarioGeneration?: CertDrillAdminScenarioGenerationService;
  scenarioGenerator?: ScenarioGenerator;
  resourceIngestor?: ResourceIngestor;
  now?: () => Date;
};

export type CertDrillAdminServiceErrorCode =
  | "CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND"
  | "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND"
  | "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED"
  | "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS"
  | "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE"
  | "CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE"
  | "CERTDRILL_ADMIN_QUESTION_NOT_FOUND"
  | "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE"
  | "CERTDRILL_ADMIN_EXAM_FORM_NOT_FOUND"
  | "CERTDRILL_ADMIN_EXAM_FORM_WEIGHTS"
  | "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY"
  | "CERTDRILL_ADMIN_EXAM_FORM_INVALID"
  | "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT"
  | "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE"
  | "CERTDRILL_ADMIN_SCENARIO_NOT_FOUND"
  | "CERTDRILL_ADMIN_SCENARIO_INVALID"
  | "CERTDRILL_ADMIN_SCENARIO_IN_ACTIVE_FORM";

export class CertDrillAdminServiceError extends Error {
  constructor(
    public readonly code: CertDrillAdminServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "CertDrillAdminServiceError";
  }
}

type CertificationInput = {
  code: string;
  name: string;
  vendor: string;
  vendorId?: string | null;
  logoUrl?: string | null;
  blueprintSourceUrl?: string | null;
  description?: string | null;
  questionCountDefault?: number;
  quickDrillQuestionCount?: number;
  categoryDrillQuestionCount?: number;
  examSimulationQuestionCount?: number | null;
  examSimulationScenarioCount?: number;
  examSimulationDurationMinutes?: number;
  passThresholdPct?: number;
  isActive?: boolean;
  enabledAt?: Date | string | null;
  archivedAt?: Date | string | null;
};

type CategoryInput = {
  certificationId: string;
  parentCategoryId?: string | null;
  code: string;
  name: string;
  weightPct?: string | number | null;
  drillQuestionCount?: number | null;
  sortOrder?: number;
};

type QuestionOptionInput = {
  text: string;
  mediaAssets?: Array<{ url: string; mimeType?: string; mime_type?: string }>;
  isCorrect: boolean;
  explanation?: string;
  citationUrls?: string[];
  sortOrder?: number;
};

type QuestionInput = {
  certificationId: string;
  categoryId: string;
  stem: string;
  questionType?: CertDrillQuestionType;
  interactionJson?: CertDrillQuestionInteraction;
  mediaAssets?: Array<{ url: string; mimeType?: string; mime_type?: string }>;
  difficulty?: CertDrillDifficulty;
  status?: CertDrillQuestionStatus;
  deliveryPurpose?: CertDrillQuestionDeliveryPurpose;
  createdBy?: "ai" | "admin";
  sourceResourceId?: string | null;
  generationJobId?: string | null;
  options?: QuestionOptionInput[];
};

type QuestionUpdateInput = Partial<Omit<QuestionInput, "certificationId" | "createdBy">>;

type ExamFormCreateInput = {
  certificationId: string;
  name: string;
  durationMinutes: number;
  targetQuestionCount: number;
};
type ExamFormMetadataInput = { name?: string; durationMinutes?: number };
type ExamFormRegenerateInput = { targetQuestionCount: number; expectedAssignmentVersion: number };
type ExamFormReplaceInput = { currentQuestionId: string; replacementQuestionId: string; expectedAssignmentVersion: number };
type ScenarioUpdateInput = Omit<ScenarioInput, "certificationId">;
type ScenarioRow = {
  id: string;
  certificationId: string;
  title: string;
  status: "draft" | "validated" | "published" | "archived";
  contentJson: CertDrillScenarioContent;
};

type QuestionFeedbackUpdateInput = {
  status: Exclude<CertDrillQuestionFeedbackStatus, "open">;
};

type ResourceInput = {
  certificationId: string;
  categoryId?: string | null;
  url: string;
  title: string;
  sourceType: "module" | "unit" | "study-guide" | "exam-blueprint" | "doc";
  contentMode: "deep_content" | "outline_blueprint";
  rawContent?: string | null;
  status?: "pending" | "ingested" | "failed";
};

type CategoryDiscoveryInput = {
  certificationId: string;
  url: string;
};
type QuestionGenerationInput = {
  certificationId: string;
  categoryId: string | null;
  resourceIds: string[];
  sourceUrls: string[];
  requestedCount: number;
  config: QuestionGenerationConfig;
};
type ScenarioGenerationInput = {
  certificationId: string;
  resourceIds: string[];
  sourceUrls: string[];
  requestedCount: number;
  difficulty: "easy" | "medium" | "hard";
  focus: string | null;
  instructions: string | null;
};



type CategoryWeightRow = { id: string; weightPct?: string | number | null };
type CategoryRow = CategoryWeightRow & { certificationId?: string; parentCategoryId?: string | null };
type QuestionRow = {
  id: string;
  certificationId?: string;
  categoryId?: string;
  status?: CertDrillQuestionStatus;
  questionType?: CertDrillQuestionType;
  interactionJson?: CertDrillQuestionInteraction;
  mediaAssets?: QuestionInput["mediaAssets"];
  options?: Array<QuestionOptionInput & { id?: string }>;
};
type ResourceRow = {
  id: string;
  certificationId?: string;
  categoryId?: string | null;
  url: string;
  title: string;
  sourceType?: ResourceInput["sourceType"];
  contentMode?: ResourceInput["contentMode"];
  rawContent?: string | null;
  ingestedAt?: Date | null;
  status?: "pending" | "ingested" | "failed";
  ingestError?: string | null;
};
type GenerationJobRow = { id: string; certificationId?: string };
type QuestionFeedbackRow = {
  id: string;
  userId: string;
  questionId: string;
  examAttemptId: string | null;
  rating: number;
  disputeCorrectAnswer: boolean;
  message: string | null;
  status: string;
  createdAt: unknown;
  updatedAt: unknown;
};

export function createCertDrillAdminService(deps: CertDrillAdminServiceDeps) {
  const questionIndex = deps.questionIndex ?? createCertDrillAdminQuestionIndex({
    repository: createDrizzleAdminQuestionIndexRepository({ db: deps.db }),
  });
  const questionImport = deps.questionImport ?? createQuestionImportService({ db: deps.db });
  const blueprintParse = deps.blueprintParse ?? createBlueprintParseService({
    db: deps.db,
    parser: deps.blueprintParser ?? createNotConfiguredBlueprintParser(),
    now: deps.now,
  });
  const questionGeneration = deps.questionGeneration ?? createQuestionGenerationService({
    db: deps.db,
    generator: deps.questionGenerator ?? createNotConfiguredQuestionGenerator(),
    now: deps.now,
  });
  const scenarioGeneration = deps.scenarioGeneration ?? createScenarioGenerationService({
    db: deps.db,
    generator: deps.scenarioGenerator ?? createNotConfiguredScenarioGenerator(),
    now: deps.now,
  });

  async function previewQuestionImport(input: QuestionImportPreviewInput) {
    return questionImport.preview(input);
  }

  async function importQuestions(input: QuestionImportConfirmInput) {
    return questionImport.confirm(input);
  }

  async function startCategoryDiscovery(input: CategoryDiscoveryInput) {
    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, input.certificationId),
    });
    if (!certification) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND", "Certification not found.");
    }

    const existingResource = await deps.db.query.certdrillLearnResources.findFirst({
      where: and(
        eq(certdrillLearnResources.certificationId, input.certificationId),
        eq(certdrillLearnResources.url, input.url),
        eq(certdrillLearnResources.sourceType, "study-guide"),
        eq(certdrillLearnResources.contentMode, "outline_blueprint"),
      ),
    }) as ResourceRow | null;
    const resource = existingResource ?? await createResource({
      certificationId: input.certificationId,
      categoryId: null,
      url: input.url,
      title: `${certification.code} study guide`,
      sourceType: "study-guide",
      contentMode: "outline_blueprint",
      status: "pending",
    });
    await ingestResource(resource.id);
    return blueprintParse.start({ certificationId: input.certificationId, resourceId: resource.id });
  }

  async function getBlueprintParseRun(id: string) {
    return blueprintParse.get(id);
  }

  async function listBlueprintParseRuns(certificationId: string) {
    return blueprintParse.list(certificationId);
  }

  async function processPendingBlueprintParseRuns(limit?: number) {
    return blueprintParse.processPending(limit);
  }
  async function startQuestionGeneration(input: QuestionGenerationInput) {
    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, input.certificationId),
    });
    if (!certification) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND", "Certification not found.");
    }
    if (input.categoryId) await assertCategoryBelongsToCertification(deps.db, input.certificationId, input.categoryId);

    const addedResourceIds = await Promise.all([...new Set(input.sourceUrls)].map(async (url) => {
      const existing = await deps.db.query.certdrillLearnResources.findFirst({
        where: and(
          eq(certdrillLearnResources.certificationId, input.certificationId),
          eq(certdrillLearnResources.url, url),
          eq(certdrillLearnResources.contentMode, "deep_content"),
        ),
      }) as ResourceRow | null;
      const resource = existing ?? await createResource({
        certificationId: input.certificationId,
        categoryId: input.categoryId ?? null,
        url,
        title: `${certification.code} source (${new URL(url).hostname})`,
        sourceType: "doc",
        contentMode: "deep_content",
        status: "pending",
      });
      const ingested = await ingestResource(resource.id);
      return ingested.id;
    }));
    const resourceIds = [...new Set([...input.resourceIds, ...addedResourceIds])];

    return questionGeneration.start({
      certificationId: input.certificationId,
      categoryId: input.categoryId,
      resourceIds: [...new Set(resourceIds)],
      requestedCount: input.requestedCount,
      config: input.config,
    });
  }

  async function getQuestionGenerationJob(id: string) {
    return questionGeneration.get(id);
  }

  async function listQuestionGenerationJobs(certificationId: string) {
    return questionGeneration.list(certificationId);
  }

  async function processPendingQuestionGenerationJobs(limit?: number) {
    return questionGeneration.processPending(limit);
  }
  async function startScenarioGeneration(input: ScenarioGenerationInput) {
    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, input.certificationId),
    });
    if (!certification) throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND", "Certification not found.");

    const addedResourceIds = await Promise.all([...new Set(input.sourceUrls)].map(async (url) => {
      const existing = await deps.db.query.certdrillLearnResources.findFirst({
        where: and(
          eq(certdrillLearnResources.certificationId, input.certificationId),
          eq(certdrillLearnResources.url, url),
          eq(certdrillLearnResources.contentMode, "deep_content"),
        ),
      }) as ResourceRow | null;
      const resource = existing ?? await createResource({
        certificationId: input.certificationId,
        categoryId: null,
        url,
        title: `${certification.code} scenario source (${new URL(url).hostname})`,
        sourceType: "doc",
        contentMode: "deep_content",
        status: "pending",
      });
      const ingested = await ingestResource(resource.id);
      return ingested.id;
    }));

    return scenarioGeneration.start({
      certificationId: input.certificationId,
      resourceIds: [...new Set([...input.resourceIds, ...addedResourceIds])],
      requestedCount: input.requestedCount,
      difficulty: input.difficulty,
      focus: input.focus,
      instructions: input.instructions,
    });
  }

  async function getScenarioGenerationJob(id: string) {
    return scenarioGeneration.get(id);
  }

  async function listScenarioGenerationJobs(certificationId: string) {
    return scenarioGeneration.list(certificationId);
  }

  async function processPendingScenarioGenerationJobs(limit?: number) {
    return scenarioGeneration.processPending(limit);
  }

  const resourceIngestor = deps.resourceIngestor ?? createResourceIngestor({ now: deps.now });

  async function createCertification(input: CertificationInput) {
    const vendor = await resolveVendor(input.vendorId, input.vendor);
    const [row] = await deps.db.insert(certdrillCertifications).values({
      code: input.code,
      name: input.name,
      vendor: vendor.name,
      vendorId: vendor.id,
      logoUrl: input.logoUrl ?? null,
      blueprintSourceUrl: input.blueprintSourceUrl ?? null,
      description: input.description ?? null,
      questionCountDefault: input.questionCountDefault ?? 10,
      quickDrillQuestionCount: input.quickDrillQuestionCount ?? 10,
      categoryDrillQuestionCount: input.categoryDrillQuestionCount ?? 10,
      examSimulationQuestionCount: input.examSimulationQuestionCount ?? null,
      examSimulationScenarioCount: input.examSimulationScenarioCount ?? 0,
      examSimulationDurationMinutes: input.examSimulationDurationMinutes ?? 120,
      passThresholdPct: input.passThresholdPct ?? 70,
      isActive: input.isActive ?? true,
      enabledAt: input.enabledAt ? new Date(input.enabledAt) : null,
      archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    }).returning();
    return row;
  }

  async function listCertifications() {
    return deps.db.query.certdrillCertifications.findMany({
      orderBy: [asc(certdrillCertifications.code)],
    });
  }

  async function listVendors() {
    return deps.db.query.certdrillVendors.findMany({
      where: eq(certdrillVendors.isActive, true),
      orderBy: [asc(certdrillVendors.sortOrder), asc(certdrillVendors.name)],
    });
  }

  async function updateCertification(id: string, input: Partial<CertificationInput>) {
    const vendor = input.vendorId || input.vendor ? await resolveVendor(input.vendorId, input.vendor) : undefined;
    const [row] = await deps.db.update(certdrillCertifications).set({
      ...input,
      ...(vendor ? { vendor: vendor.name, vendorId: vendor.id } : {}),
      ...(input.enabledAt !== undefined ? { enabledAt: input.enabledAt ? new Date(input.enabledAt) : null } : {}),
      ...(input.archivedAt !== undefined ? { archivedAt: input.archivedAt ? new Date(input.archivedAt) : null } : {}),
      updatedAt: new Date(),
    }).where(eq(certdrillCertifications.id, id)).returning();
    return row;
  }

  async function resolveVendor(vendorId?: string | null, fallbackName?: string) {
    if (vendorId) {
      const vendor = await deps.db.query.certdrillVendors.findFirst({ where: eq(certdrillVendors.id, vendorId) });
      if (vendor) return { id: vendor.id, name: vendor.name };
    }
    if (fallbackName) {
      const vendors = typeof deps.db.query?.certdrillVendors?.findMany === "function"
        ? await deps.db.query.certdrillVendors.findMany({ where: eq(certdrillVendors.isActive, true) })
        : [];
      const normalized = fallbackName.trim().toLowerCase();
      const vendor = vendors.find((item: { name: string; slug: string; id: string }) => item.name.toLowerCase() === normalized || item.slug.toLowerCase() === normalized);
      if (vendor) return { id: vendor.id, name: vendor.name };
    }
    return { id: null, name: fallbackName ?? "Unknown" };
  }

  async function archiveCertification(id: string) {
    const now = new Date();
    const [row] = await deps.db.update(certdrillCertifications).set({
      isActive: false,
      archivedAt: now,
      updatedAt: now,
    }).where(eq(certdrillCertifications.id, id)).returning();
    return row;
  }

  async function createCategory(input: CategoryInput) {
    return withTransaction(async (db) => {
      const parentCategoryId = input.parentCategoryId ?? null;
      await assertCategoryBelongsToCertification(db, input.certificationId, parentCategoryId);
      const siblings = await loadCategorySiblings(db, input.certificationId, parentCategoryId);
      assertValidSiblingWeights([...siblings, { id: "new", weightPct: input.weightPct ?? null }]);

      const [row] = await db.insert(certdrillExamCategories).values({
        certificationId: input.certificationId,
        parentCategoryId,
        code: input.code,
        name: input.name,
        weightPct: input.weightPct ?? null,
        weightMinPct: input.weightPct ?? null,
        weightMaxPct: input.weightPct ?? null,
        drillQuestionCount: input.drillQuestionCount ?? null,
        sortOrder: input.sortOrder ?? 0,
      }).returning();
      return row;
    });
  }

  async function listCategories(certificationId: string) {
    return deps.db.query.certdrillExamCategories.findMany({
      where: eq(certdrillExamCategories.certificationId, certificationId),
      orderBy: [asc(certdrillExamCategories.sortOrder), asc(certdrillExamCategories.code)],
    });
  }

  async function updateCategory(id: string, input: Partial<CategoryInput>) {
    return withTransaction(async (db) => {
      const current = await db.query.certdrillExamCategories.findFirst({
        where: eq(certdrillExamCategories.id, id),
      }) as CategoryRow | null;
      const certificationId = input.certificationId ?? current?.certificationId;
      const parentCategoryId = input.parentCategoryId !== undefined ? input.parentCategoryId : current?.parentCategoryId ?? null;

      if (certificationId && ("weightPct" in input || "parentCategoryId" in input || "certificationId" in input)) {
        await assertCategoryBelongsToCertification(db, certificationId, parentCategoryId ?? null);
        await assertCategoryParentDoesNotCycle(db, id, certificationId, parentCategoryId ?? null);
        const loadedSiblings = await loadCategorySiblings(db, certificationId, parentCategoryId ?? null);
        const siblings = loadedSiblings.some((sibling: CategoryWeightRow) => sibling.id === id) || !current
          ? loadedSiblings
          : [...loadedSiblings, current];
        assertValidSiblingWeights(siblings.map((sibling: CategoryWeightRow) => ({
          id: sibling.id,
          weightPct: sibling.id === id
            ? ("weightPct" in input ? input.weightPct ?? null : sibling.weightPct ?? null)
            : sibling.weightPct ?? null,
        })));

        const movedBetweenSiblingGroups = current
          && (current.certificationId !== certificationId || (current.parentCategoryId ?? null) !== (parentCategoryId ?? null));
        if (movedBetweenSiblingGroups) {
          const sourceSiblings = await loadCategorySiblings(db, current.certificationId ?? certificationId, current.parentCategoryId ?? null);
          assertValidSiblingWeights(sourceSiblings.filter((sibling: CategoryWeightRow) => sibling.id !== id));
        }
      }

      const weightRangeUpdate = "weightPct" in input
        ? { weightMinPct: input.weightPct ?? null, weightMaxPct: input.weightPct ?? null }
        : {};
      const [row] = await db.update(certdrillExamCategories).set({
        ...input,
        ...weightRangeUpdate,
        updatedAt: new Date(),
      }).where(eq(certdrillExamCategories.id, id)).returning();
      return row;
    });
  }

  async function archiveCategory(id: string) {
    const now = new Date();
    const [row] = await deps.db.update(certdrillExamCategories).set({ archivedAt: now, updatedAt: now }).where(eq(certdrillExamCategories.id, id)).returning();
    return row;
  }

  async function listQuestions(certificationId: string) {
    return deps.db.query.certdrillQuestions.findMany({
      where: eq(certdrillQuestions.certificationId, certificationId),
      with: { options: true, category: true },
      orderBy: [asc(certdrillQuestions.createdAt)],
    });
  }

  async function listQuestionIndex(input: AdminQuestionIndexQueryInput = {}) {
    return questionIndex.query(input);
  }

  async function createQuestion(input: QuestionInput) {
    await assertCategoryBelongsToCertification(deps.db, input.certificationId, input.categoryId);
    await assertQuestionReferencesBelongToCertification(input.certificationId, input);
    assertPublishableQuestionInput(input);

    return withTransaction(async (db) => {
      const [row] = await db.insert(certdrillQuestions).values(toQuestionValues(input)).returning();
      if (input.options?.length) {
        await insertQuestionOptions(db, row.id, input.options);
      }
      return row;
    });
  }

  async function updateQuestion(id: string, input: QuestionUpdateInput) {
    return withTransaction(async (db) => {
      const initial = await db.query.certdrillQuestions.findFirst({ where: eq(certdrillQuestions.id, id), with: { options: true } }) as QuestionRow | null;
      if (!initial) throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_QUESTION_NOT_FOUND", "Question not found");
      if (initial.certificationId) await lockExamFormCertification(db, initial.certificationId);
      const current = await db.query.certdrillQuestions.findFirst({ where: eq(certdrillQuestions.id, id), with: { options: true } }) as QuestionRow | null;
      if (!current) throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_QUESTION_NOT_FOUND", "Question not found");
      if (current.status === "published" && (input.status === "draft" || input.status === "archived" || input.deliveryPurpose === "practice")) {
        const forms = await db.query.certdrillExamForms.findMany({ where: and(eq(certdrillExamForms.isActive, true), sql`${certdrillExamForms.questionIds} @> ARRAY[${id}::uuid]`), columns: { id: true, name: true } });
        if (forms.length > 0) throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE", `Question is assigned to active exam form${forms.length === 1 ? "" : "s"}: ${forms.map((form: { name: string }) => form.name).join(", ")}. Deactivate or regenerate them first.`, forms);
      }
      if (current.certificationId && input.categoryId) await assertCategoryBelongsToCertification(db, current.certificationId, input.categoryId);
      if (current.certificationId) await assertQuestionReferencesBelongToCertification(current.certificationId, input, db);
      assertPublishableQuestionInput(mergeQuestionForValidation(current, input));
      const { options, ...questionInput } = input;
      let row: unknown;

      if (Object.keys(questionInput).length > 0) {
        [row] = await db.update(certdrillQuestions).set({
          ...questionInput,
          updatedAt: new Date(),
        }).where(eq(certdrillQuestions.id, id)).returning();
      }

      if (options) {
        await db.delete(certdrillAnswerOptions).where(eq(certdrillAnswerOptions.questionId, id));
        if (options.length > 0) {
          await insertQuestionOptions(db, id, options);
        }
      }

      if (row) {
        return row;
      }

      return db.query.certdrillQuestions.findFirst({ where: eq(certdrillQuestions.id, id), with: { options: true } });
    });
  }

  async function publishQuestion(id: string) {
    const question = await deps.db.query.certdrillQuestions.findFirst({
      where: eq(certdrillQuestions.id, id),
      with: { options: true },
    });
    if (!question) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_QUESTION_NOT_FOUND", "Question not found");
    }

    assertQuestionRowPublishable(question);

    const [row] = await deps.db.update(certdrillQuestions).set({
      status: "published",
      updatedAt: new Date(),
    }).where(eq(certdrillQuestions.id, id)).returning();
    return row;
  }

  async function updateQuestionStatuses(input: { questionIds: string[]; status: "draft" | "published" }) {
    const questionIds = [...new Set(input.questionIds)];
    return withTransaction(async (db) => {
      const initialQuestions = await db.query.certdrillQuestions.findMany({
        where: inArray(certdrillQuestions.id, questionIds),
        with: { options: true },
      }) as QuestionRow[];
      assertAllQuestionsFound(initialQuestions, questionIds);

      if (input.status === "draft") {
        const certificationIds = [...new Set(initialQuestions
          .map((question) => question.certificationId)
          .filter((id): id is string => Boolean(id)))]
          .sort();
        for (const certificationId of certificationIds) {
          await lockExamFormCertification(db, certificationId);
        }
      }

      const questions = await db.query.certdrillQuestions.findMany({
        where: inArray(certdrillQuestions.id, questionIds),
        with: { options: true },
      }) as QuestionRow[];
      assertAllQuestionsFound(questions, questionIds);

      if (input.status === "published") {
        questions.forEach(assertQuestionRowPublishable);
      } else {
        for (const question of questions) {
          if (question.status !== "published") continue;
          const forms = await db.query.certdrillExamForms.findMany({
            where: and(
              eq(certdrillExamForms.isActive, true),
              sql`${certdrillExamForms.questionIds} @> ARRAY[${question.id}::uuid]`,
            ),
            columns: { id: true, name: true },
          });
          if (forms.length > 0) {
            throw new CertDrillAdminServiceError(
              "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE",
              `Question is assigned to active exam form${forms.length === 1 ? "" : "s"}: ${forms.map((form: { name: string }) => form.name).join(", ")}. Deactivate or regenerate them first.`,
              forms,
            );
          }
        }
      }

      return db.update(certdrillQuestions).set({
        status: input.status,
        updatedAt: new Date(),
      }).where(inArray(certdrillQuestions.id, questionIds)).returning();
    });
  }

  async function updateQuestionDeliveryPurposes(input: { questionIds: string[]; deliveryPurpose: "practice" | "assessment" }) {
    const questionIds = [...new Set(input.questionIds)];
    return withTransaction(async (db) => {
      const initialQuestions = await db.query.certdrillQuestions.findMany({
        where: inArray(certdrillQuestions.id, questionIds),
      }) as QuestionRow[];
      assertAllQuestionsFound(initialQuestions, questionIds);

      if (input.deliveryPurpose === "practice") {
        const certificationIds = [...new Set(initialQuestions
          .map((question) => question.certificationId)
          .filter((id): id is string => Boolean(id)))]
          .sort();
        for (const certificationId of certificationIds) await lockExamFormCertification(db, certificationId);

        const questions = await db.query.certdrillQuestions.findMany({
          where: inArray(certdrillQuestions.id, questionIds),
        }) as QuestionRow[];
        assertAllQuestionsFound(questions, questionIds);
        for (const question of questions) {
          const forms = await db.query.certdrillExamForms.findMany({
            where: and(
              eq(certdrillExamForms.isActive, true),
              sql`${certdrillExamForms.questionIds} @> ARRAY[${question.id}::uuid]`,
            ),
            columns: { id: true, name: true },
          });
          if (forms.length > 0) {
            throw new CertDrillAdminServiceError(
              "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE",
              `Question is assigned to active exam form${forms.length === 1 ? "" : "s"}: ${forms.map((form: { name: string }) => form.name).join(", ")}. Deactivate or regenerate them first.`,
              forms,
            );
          }
        }
      }

      return db.update(certdrillQuestions).set({
        deliveryPurpose: input.deliveryPurpose,
        updatedAt: new Date(),
      }).where(inArray(certdrillQuestions.id, questionIds)).returning();
    });
  }

  async function listScenarios(certificationId: string) {
    const scenarios = await deps.db.query.certdrillScenarios.findMany({
      where: eq(certdrillScenarios.certificationId, certificationId),
      orderBy: [asc(certdrillScenarios.createdAt)],
    }) as ScenarioRow[];
    const assignments = scenarios.length > 0
      ? await deps.db.query.certdrillExamFormScenarios.findMany({ where: inArray(certdrillExamFormScenarios.scenarioId, scenarios.map((scenario) => scenario.id)) })
      : [];
    return scenarios.map((scenario) => ({
      ...scenario,
      examFormIds: assignments.filter((assignment: { scenarioId: string }) => assignment.scenarioId === scenario.id).map((assignment: { examFormId: string }) => assignment.examFormId),
    }));
  }

  async function createScenario(input: ScenarioInput) {
    const certification = await deps.db.query.certdrillCertifications.findFirst({ where: eq(certdrillCertifications.id, input.certificationId) });
    if (!certification) throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND", "Certification not found.");
    const [scenario] = await deps.db.insert(certdrillScenarios).values({
      ...input,
      status: "draft",
      validatedAt: null,
    }).returning();
    return { ...scenario, examFormIds: [] };
  }

  async function updateScenario(id: string, input: ScenarioUpdateInput) {
    return withTransaction(async (db) => {
      const existing = await loadScenario(db, id);
      await assertScenarioNotInActiveForm(db, existing.id);
      await db.delete(certdrillExamFormScenarios).where(eq(certdrillExamFormScenarios.scenarioId, id));
      const [scenario] = await db.update(certdrillScenarios).set({
        ...input,
        status: "draft",
        validatedAt: null,
        updatedAt: new Date(),
      }).where(eq(certdrillScenarios.id, id)).returning();
      if (!scenario) throw scenarioNotFound();
      return scenario;
    });
  }

  async function archiveScenario(id: string) {
    return withTransaction(async (db) => {
      const initialScenario = await loadScenario(db, id);
      await lockExamFormCertification(db, initialScenario.certificationId);
      const scenario = await loadScenario(db, id);
      await assertScenarioNotInActiveForm(db, scenario.id);
      await db.delete(certdrillExamFormScenarios).where(eq(certdrillExamFormScenarios.scenarioId, id));
      const [archived] = await db.update(certdrillScenarios).set({ status: "archived", validatedAt: null, updatedAt: new Date() })
        .where(eq(certdrillScenarios.id, id)).returning();
      if (!archived) throw scenarioNotFound();
      return archived;
    });
  }

  async function validateScenario(id: string) {
    const scenario = await loadScenario(deps.db, id);
    assertScenarioGraphPublishable(scenario);
    const now = new Date();
    const [validated] = await deps.db.update(certdrillScenarios).set({ status: "validated", validatedAt: now, updatedAt: now })
      .where(eq(certdrillScenarios.id, id)).returning();
    if (!validated) throw scenarioNotFound();
    return validated;
  }

  async function publishScenario(id: string) {
    const [scenario] = await updateScenarioStatuses({ scenarioIds: [id], status: "published" });
    return scenario;
  }

  async function updateScenarioStatuses(input: { scenarioIds: string[]; status: "draft" | "published" }) {
    const scenarioIds = [...new Set(input.scenarioIds)];
    return withTransaction(async (db) => {
      const initialScenarios = await db.query.certdrillScenarios.findMany({
        where: inArray(certdrillScenarios.id, scenarioIds),
      }) as ScenarioRow[];
      assertAllScenariosFound(initialScenarios, scenarioIds);

      if (input.status === "draft") {
        const certificationIds = [...new Set(initialScenarios.map((scenario) => scenario.certificationId))].sort();
        for (const certificationId of certificationIds) await lockExamFormCertification(db, certificationId);
      }

      const scenarios = await db.query.certdrillScenarios.findMany({
        where: inArray(certdrillScenarios.id, scenarioIds),
      }) as ScenarioRow[];
      assertAllScenariosFound(scenarios, scenarioIds);

      if (input.status === "published") {
        scenarios.forEach(assertScenarioGraphPublishable);
      } else {
        for (const scenario of scenarios) await assertScenarioNotInActiveForm(db, scenario.id);
        await db.delete(certdrillExamFormScenarios).where(inArray(certdrillExamFormScenarios.scenarioId, scenarioIds));
      }

      const updatedAt = new Date();
      return db.update(certdrillScenarios).set({
        status: input.status,
        validatedAt: input.status === "published" ? updatedAt : null,
        updatedAt,
      }).where(inArray(certdrillScenarios.id, scenarioIds)).returning();
    });
  }

  async function setExamFormScenarios(examFormId: string, scenarioIds: string[]) {
    return withTransaction(async (db) => {
      const form = await loadExamForm(db, examFormId);
      if (form.isActive) throw invalidExamForm("Deactivate the exam form before changing its scenarios.");
      const uniqueScenarioIds = [...new Set(scenarioIds)];
      const scenarios = uniqueScenarioIds.length > 0
        ? await db.query.certdrillScenarios.findMany({ where: inArray(certdrillScenarios.id, uniqueScenarioIds) }) as ScenarioRow[]
        : [];
      if (scenarios.length !== uniqueScenarioIds.length || scenarios.some((scenario) => scenario.certificationId !== form.certificationId)) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Every scenario must belong to the exam form certification.");
      }
      if (scenarios.some((scenario) => scenario.status !== "published")) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_SCENARIO_INVALID", "Only published scenarios can be assigned to a Final Mock Exam.");
      }
      await db.delete(certdrillExamFormScenarios).where(eq(certdrillExamFormScenarios.examFormId, examFormId));
      if (scenarios.length > 0) {
        await db.insert(certdrillExamFormScenarios).values(scenarios.map((scenario, index) => ({
          examFormId,
          scenarioId: scenario.id,
          sortOrder: index,
        })));
      }
      return { ...form, scenarioIds: uniqueScenarioIds };
    });
  }

  async function loadScenario(db: any, id: string): Promise<ScenarioRow> {
    const scenario = await db.query.certdrillScenarios.findFirst({ where: eq(certdrillScenarios.id, id) }) as ScenarioRow | null;
    if (!scenario) throw scenarioNotFound();
    return scenario;
  }

  async function assertScenarioNotInActiveForm(db: any, scenarioId: string) {
    const assignments = await db.query.certdrillExamFormScenarios.findMany({ where: eq(certdrillExamFormScenarios.scenarioId, scenarioId) }) as Array<{ examFormId: string }>;
    if (assignments.length === 0) return;
    const forms = await db.query.certdrillExamForms.findMany({ where: and(inArray(certdrillExamForms.id, assignments.map((assignment) => assignment.examFormId)), eq(certdrillExamForms.isActive, true)) });
    if (forms.length > 0) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_SCENARIO_IN_ACTIVE_FORM", "Deactivate assigned exam forms before updating or deleting this scenario.", forms);
    }
  }

  function assertAllScenariosFound(scenarios: ScenarioRow[], scenarioIds: string[]) {
    if (scenarios.length !== scenarioIds.length) throw scenarioNotFound();
  }

  function assertScenarioGraphPublishable(scenario: ScenarioRow) {
    try {
      validateScenarioGraph(scenario.contentJson);
    } catch (error) {
      if (error instanceof ScenarioValidationError) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_SCENARIO_INVALID", `Scenario validation failed: ${error.issues.join(" ")}`, error.issues);
      }
      throw error;
    }
  }

  function scenarioNotFound() {
    return new CertDrillAdminServiceError("CERTDRILL_ADMIN_SCENARIO_NOT_FOUND", "Scenario not found.");
  }

  async function createExamForm(input: ExamFormCreateInput) {
    const metadata = validateExamFormMetadata(input);
    return withTransaction(async (db) => {
      await lockExamFormCertification(db, input.certificationId);
      const [categories, questions, existingForms] = await Promise.all([
        loadAssignmentCategories(db, input.certificationId),
        loadPublishedQuestions(db, input.certificationId),
        db.query.certdrillExamForms.findMany({ where: eq(certdrillExamForms.certificationId, input.certificationId) }),
      ]);
      const plan = planAssignment({ categories, questions: excludeAssignedQuestions(questions, existingForms), targetQuestionCount: input.targetQuestionCount });
      const sortOrder = existingForms.reduce((maximum: number, form: { sortOrder?: number }) => Math.max(maximum, Number(form.sortOrder ?? 0)), 0) + 1;
      const [row] = await db.insert(certdrillExamForms).values({
        certificationId: input.certificationId,
        name: metadata.name,
        description: null,
        sortOrder,
        isActive: false,
        durationMinutes: metadata.durationMinutes,
        targetQuestionCount: input.targetQuestionCount,
        questionIds: plan.questionIds,
        allocationSnapshot: plan.allocations,
        assignmentVersion: 1,
        generatedAt: new Date(),
      }).returning();
      return row;
    });
  }

  async function getExamForm(id: string) {
    const form = await loadExamForm(deps.db, id);
    const assignments = await deps.db.query.certdrillExamFormScenarios.findMany({
      where: eq(certdrillExamFormScenarios.examFormId, id),
      orderBy: [asc(certdrillExamFormScenarios.sortOrder)],
    });
    return { ...form, scenarioIds: assignments.map((assignment: { scenarioId: string }) => assignment.scenarioId) };
  }

  async function listExamForms(certificationId: string) {
    const forms = await deps.db.query.certdrillExamForms.findMany({
      where: eq(certdrillExamForms.certificationId, certificationId),
      orderBy: [asc(certdrillExamForms.sortOrder)],
    });
    const assignments = forms.length > 0
      ? await deps.db.query.certdrillExamFormScenarios.findMany({ where: inArray(certdrillExamFormScenarios.examFormId, forms.map((form: { id: string }) => form.id)) })
      : [];
    return forms.map((form: { id: string }) => ({
      ...form,
      scenarioIds: assignments.filter((assignment: { examFormId: string }) => assignment.examFormId === form.id).sort((first: { sortOrder: number }, second: { sortOrder: number }) => first.sortOrder - second.sortOrder).map((assignment: { scenarioId: string }) => assignment.scenarioId),
    }));
  }

  async function updateExamFormMetadata(id: string, input: ExamFormMetadataInput) {
    const [row] = await deps.db.update(certdrillExamForms).set({
      ...validateExamFormMetadata(input),
      updatedAt: new Date(),
    }).where(eq(certdrillExamForms.id, id)).returning();
    if (!row) throw examFormNotFound();
    return row;
  }

  async function regenerateExamForm(id: string, input: ExamFormRegenerateInput) {
    return withTransaction(async (db) => {
      const form = await loadExamForm(db, id);
      await lockExamFormCertification(db, form.certificationId);
      const currentForm = await loadExamForm(db, id);
      if (currentForm.assignmentVersion !== input.expectedAssignmentVersion) throw examFormConflict();
      const [categories, questions, existingForms] = await Promise.all([
        loadAssignmentCategories(db, currentForm.certificationId),
        loadPublishedQuestions(db, currentForm.certificationId),
        db.query.certdrillExamForms.findMany({ where: eq(certdrillExamForms.certificationId, currentForm.certificationId) }),
      ]);
      const otherForms = existingForms.filter((candidate: { id: string }) => candidate.id !== currentForm.id);
      const plan = planAssignment({ categories, questions: excludeAssignedQuestions(questions, otherForms), targetQuestionCount: input.targetQuestionCount });
      const [updated] = await db.update(certdrillExamForms).set({
        questionIds: plan.questionIds,
        targetQuestionCount: input.targetQuestionCount,
        allocationSnapshot: plan.allocations,
        assignmentVersion: input.expectedAssignmentVersion + 1,
        generatedAt: new Date(),
        updatedAt: new Date(),
      }).where(and(eq(certdrillExamForms.id, id), eq(certdrillExamForms.assignmentVersion, input.expectedAssignmentVersion))).returning();
      if (!updated) throw examFormConflict();
      return updated;
    });
  }

  async function replaceExamFormQuestion(id: string, input: ExamFormReplaceInput) {
    return withTransaction(async (db) => {
    const initial = await loadExamForm(db, id);
    await lockExamFormCertification(db, initial.certificationId);
    const form = await loadExamForm(db, id);
    if (form.assignmentVersion !== input.expectedAssignmentVersion) throw examFormConflict();
    const currentIndex = form.questionIds.indexOf(input.currentQuestionId);
    if (currentIndex < 0) throw invalidExamForm("The current question is not assigned to this form.");
    if (form.questionIds.includes(input.replacementQuestionId)) throw invalidExamForm("The replacement question is already assigned to this form.");
    const [categories, questions, existingForms] = await Promise.all([
      loadAssignmentCategories(db, form.certificationId),
      loadPublishedQuestions(db, form.certificationId),
      db.query.certdrillExamForms.findMany({ where: eq(certdrillExamForms.certificationId, form.certificationId) }),
    ]);
    const assignedElsewhere = new Set(existingForms
      .filter((candidate: { id: string }) => candidate.id !== form.id)
      .flatMap((candidate: { questionIds?: string[] }) => candidate.questionIds ?? []));
    if (assignedElsewhere.has(input.replacementQuestionId)) throw invalidExamForm("The replacement question is assigned to another exam form.");
    const current = questions.find((question: QuestionRow) => question.id === input.currentQuestionId);
    const replacement = questions.find((question: QuestionRow) => question.id === input.replacementQuestionId);
    if (!current || !replacement) throw invalidExamForm("Both questions must be published assessment questions in this certification.");
    const currentRoot = topLevelCategoryId(current.categoryId!, categories);
    const replacementRoot = topLevelCategoryId(replacement.categoryId!, categories);
    if (!currentRoot || !replacementRoot || currentRoot !== replacementRoot) throw invalidExamForm("The replacement question must belong to the same non-archived top-level category.");
    const questionIds = [...form.questionIds];
    questionIds[currentIndex] = input.replacementQuestionId;
    const [updated] = await db.update(certdrillExamForms).set({ questionIds, assignmentVersion: input.expectedAssignmentVersion + 1, updatedAt: new Date() })
      .where(and(eq(certdrillExamForms.id, id), eq(certdrillExamForms.assignmentVersion, input.expectedAssignmentVersion))).returning();
    if (!updated) throw examFormConflict();
    return updated;
    });
  }

  async function setExamFormActive(id: string, isActive: boolean) {
    return withTransaction(async (db) => {
    const initial = await loadExamForm(db, id);
    await lockExamFormCertification(db, initial.certificationId);
    const form = await loadExamForm(db, id);
    if (isActive) {
      const [categories, questions] = await Promise.all([loadAssignmentCategories(db, form.certificationId), loadPublishedQuestions(db, form.certificationId)]);
      try {
        validateExamFormAssignment({ categories, questions, targetQuestionCount: form.targetQuestionCount, questionIds: form.questionIds, allocationSnapshot: form.allocationSnapshot });
      } catch (error) {
        if (error instanceof ExamFormAssignmentError) throw invalidExamForm(error.message, error.details);
        throw error;
      }
    }
    const [updated] = await db.update(certdrillExamForms).set({ isActive, updatedAt: new Date() }).where(eq(certdrillExamForms.id, id)).returning();
    if (!updated) throw examFormNotFound();
    return updated;
    });
  }

  async function lockExamFormCertification(db: any, certificationId: string) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${certificationId}, 913846227))`);
  }

  async function loadAssignmentCategories(db: any, certificationId: string) {
    return db.query.certdrillExamCategories.findMany({ where: and(eq(certdrillExamCategories.certificationId, certificationId), isNull(certdrillExamCategories.archivedAt)), orderBy: [asc(certdrillExamCategories.sortOrder), asc(certdrillExamCategories.id)] });
  }

  async function loadPublishedQuestions(db: any, certificationId: string) {
    return db.query.certdrillQuestions.findMany({
      where: and(
        eq(certdrillQuestions.certificationId, certificationId),
        eq(certdrillQuestions.status, "published"),
        inArray(certdrillQuestions.deliveryPurpose, ["assessment", "both"]),
      ),
    });
  }

  function excludeAssignedQuestions(questions: QuestionRow[], forms: Array<{ questionIds?: string[] }>) {
    const assignedQuestionIds = new Set(forms.flatMap((form) => form.questionIds ?? []));
    return questions.filter((question) => !assignedQuestionIds.has(question.id));
  }

  async function loadExamForm(db: any, id: string) {
    const form = await db.query.certdrillExamForms.findFirst({ where: eq(certdrillExamForms.id, id) });
    if (!form) throw examFormNotFound();
    return form;
  }

  function planAssignment(input: { categories: any[]; questions: any[]; targetQuestionCount: number }) {
    try {
      return planExamFormAssignment({ ...input, rng: deps.rng });
    } catch (error) {
      if (error instanceof ExamFormAssignmentError) throw new CertDrillAdminServiceError(error.code, error.message, error.details);
      throw error;
    }
  }

  async function createResource(input: ResourceInput) {
    if (input.categoryId) {
      await assertCategoryBelongsToCertification(deps.db, input.certificationId, input.categoryId);
    }
    const [row] = await deps.db.insert(certdrillLearnResources).values({
      certificationId: input.certificationId,
      categoryId: input.categoryId ?? null,
      url: input.url,
      title: input.title,
      sourceType: input.sourceType,
      contentMode: input.contentMode,
      rawContent: input.rawContent ?? null,
      status: input.status ?? "pending",
    }).returning();
    return row;
  }

  async function listResources(certificationId: string) {
    return deps.db.query.certdrillLearnResources.findMany({
      where: eq(certdrillLearnResources.certificationId, certificationId),
      orderBy: [asc(certdrillLearnResources.createdAt)],
    });
  }

  async function updateResource(id: string, input: Partial<ResourceInput>) {
    if (input.categoryId || input.certificationId) {
      const current = await deps.db.query.certdrillLearnResources.findFirst({ where: eq(certdrillLearnResources.id, id) });
      const certificationId = input.certificationId ?? current?.certificationId;
      const categoryId = "categoryId" in input ? input.categoryId : current?.categoryId;
      if (certificationId) {
        await assertCategoryBelongsToCertification(deps.db, certificationId, categoryId);
      }
    }
    const [row] = await deps.db.update(certdrillLearnResources).set({
      ...input,
      updatedAt: new Date(),
    }).where(eq(certdrillLearnResources.id, id)).returning();
    return row;
  }

  async function ingestResource(id: string) {
    const resource = await deps.db.query.certdrillLearnResources.findFirst({
      where: eq(certdrillLearnResources.id, id),
    }) as ResourceRow | null;
    if (!resource) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_RESOURCE_NOT_FOUND", "Resource not found.");
    }

    let result;
    try {
      result = await resourceIngestor.ingest(resource.url);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Resource ingestion failed.";
      await deps.db.update(certdrillLearnResources).set({
        status: "failed",
        ingestError: message,
        updatedAt: new Date(),
      }).where(eq(certdrillLearnResources.id, id)).returning();

      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED", message);
    }

    const [row] = await deps.db.update(certdrillLearnResources).set({
      url: result.finalUrl,
      title: result.title?.trim() ? result.title : resource.title,
      rawContent: result.rawContent,
      ingestedAt: result.ingestedAt,
      status: "ingested",
      ingestError: null,
      updatedAt: new Date(),
    }).where(eq(certdrillLearnResources.id, id)).returning();
    if (!row) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_RESOURCE_NOT_FOUND", "Resource not found.");
    }
    return row;
  }


  async function listQuestionFeedbackForAdmin() {
    const rows = await deps.db.query.certdrillQuestionFeedback.findMany({
      orderBy: [desc(certdrillQuestionFeedback.createdAt)],
    });
    return rows.map(toQuestionFeedback);
  }

  async function updateQuestionFeedback(id: string, input: QuestionFeedbackUpdateInput) {
    const [row] = await deps.db.update(certdrillQuestionFeedback).set({
      status: input.status,
      updatedAt: new Date(),
    }).where(eq(certdrillQuestionFeedback.id, id)).returning();
    return toQuestionFeedback(row as QuestionFeedbackRow);
  }

  async function resetUserProgress(userId: string) {
    return withTransaction(async (db) => {
      const [reviewItems, attempts] = await Promise.all([
        db.delete(certdrillReviewQueue)
          .where(eq(certdrillReviewQueue.userId, userId))
          .returning({ id: certdrillReviewQueue.id }),
        db.delete(certdrillExamAttempts)
          .where(eq(certdrillExamAttempts.userId, userId))
          .returning({ id: certdrillExamAttempts.id }),
      ]);

      return {
        deletedAttemptCount: attempts.length,
        deletedReviewItemCount: reviewItems.length,
      };
    });
  }

  async function loadCategorySiblings(db: any, certificationId: string, parentCategoryId: string | null): Promise<CategoryWeightRow[]> {
    return db.query.certdrillExamCategories.findMany({
      where: parentCategoryId
        ? and(eq(certdrillExamCategories.certificationId, certificationId), eq(certdrillExamCategories.parentCategoryId, parentCategoryId))
        : and(eq(certdrillExamCategories.certificationId, certificationId), isNull(certdrillExamCategories.parentCategoryId)),
    });
  }

  async function insertQuestionOptions(db: any, questionId: string, options: QuestionOptionInput[]) {
    await db.insert(certdrillAnswerOptions).values(options.map((option, index) => ({
      questionId,
      text: option.text,
      mediaAssets: option.mediaAssets ?? [],
      isCorrect: option.isCorrect,
      explanation: option.explanation ?? "",
      citationUrls: option.citationUrls ?? [],
      sortOrder: option.sortOrder ?? index,
    }))).returning();
  }

  async function withTransaction<T>(callback: (db: any) => Promise<T>): Promise<T> {
    if (typeof deps.db.transaction === "function") {
      return deps.db.transaction(callback);
    }

    return callback(deps.db);
  }

  async function assertCategoryBelongsToCertification(db: any, certificationId: string, categoryId: string | null | undefined) {
    if (!categoryId) {
      return;
    }

    const category = await db.query.certdrillExamCategories.findFirst({
      where: and(eq(certdrillExamCategories.id, categoryId), eq(certdrillExamCategories.certificationId, certificationId)),
    });
    if (!category) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Category must belong to the certification");
    }
  }

  async function assertCategoryParentDoesNotCycle(db: any, id: string, certificationId: string, parentCategoryId: string | null) {
    if (!parentCategoryId) {
      return;
    }

    if (parentCategoryId === id) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE", "Category cannot be its own parent");
    }

    const categories = await db.query.certdrillExamCategories.findMany({
      where: eq(certdrillExamCategories.certificationId, certificationId),
    }) as CategoryRow[];
    const parentById = new Map(categories.map((category) => [category.id, category.parentCategoryId ?? null]));
    for (let cursor: string | null = parentCategoryId; cursor; cursor = parentById.get(cursor) ?? null) {
      if (cursor === id) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE", "Category parent cannot be one of its descendants");
      }
    }
  }

  async function assertQuestionIdsBelongToCertification(certificationId: string, questionIds: string[]) {
    if (questionIds.length === 0) {
      return;
    }

    const questions = await deps.db.query.certdrillQuestions.findMany({
      where: and(eq(certdrillQuestions.certificationId, certificationId)),
    }) as QuestionRow[];
    const validQuestionIds = new Set(questions.map((question) => question.id));
    if (questionIds.some((questionId) => !validQuestionIds.has(questionId))) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Exam form question IDs must belong to the certification");
    }
  }

  async function assertResourceIdsBelongToCertification(certificationId: string, resourceIds: string[], message: string) {
    if (resourceIds.length === 0) {
      return;
    }

    const resources = await deps.db.query.certdrillLearnResources.findMany({
      where: eq(certdrillLearnResources.certificationId, certificationId),
    }) as ResourceRow[];
    const validResourceIds = new Set(resources.map((resource) => resource.id));
    if (resourceIds.some((resourceId) => !validResourceIds.has(resourceId))) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", message);
    }
  }

  async function assertQuestionReferencesBelongToCertification(certificationId: string, input: Pick<QuestionInput, "sourceResourceId" | "generationJobId">, db = deps.db) {
    if (input.sourceResourceId) {
      const resource = await db.query.certdrillLearnResources.findFirst({
        where: and(eq(certdrillLearnResources.id, input.sourceResourceId), eq(certdrillLearnResources.certificationId, certificationId)),
      }) as ResourceRow | null;
      if (!resource) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Question source resource must belong to the certification");
      }
    }

    if (input.generationJobId) {
      const generationJob = await db.query.certdrillQuestionGenerationJobs.findFirst({
        where: and(eq(certdrillQuestionGenerationJobs.id, input.generationJobId), eq(certdrillQuestionGenerationJobs.certificationId, certificationId)),
      }) as GenerationJobRow | null;
      if (!generationJob) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Question generation job must belong to the certification");
      }
    }
  }

  return {
    resetUserProgress,
    createCertification,
    listVendors,
    listCertifications,
    updateCertification,
    archiveCertification,
    createCategory,
    listCategories,
    updateCategory,
    archiveCategory,
    listQuestionIndex,
    listQuestions,
    createQuestion,
    updateQuestion,
    publishQuestion,
    updateQuestionStatuses,
    updateQuestionDeliveryPurposes,
    previewQuestionImport,
    importQuestions,
    startCategoryDiscovery,
    getBlueprintParseRun,
    listBlueprintParseRuns,
    processPendingBlueprintParseRuns,
    startQuestionGeneration,
    getQuestionGenerationJob,
    listQuestionGenerationJobs,
    processPendingQuestionGenerationJobs,
    startScenarioGeneration,
    getScenarioGenerationJob,
    listScenarioGenerationJobs,
    processPendingScenarioGenerationJobs,
    listScenarios,
    createScenario,
    updateScenario,
    archiveScenario,
    validateScenario,
    publishScenario,
    updateScenarioStatuses,
    setExamFormScenarios,
    createExamForm,
    getExamForm,
    listExamForms,
    updateExamFormMetadata,
    regenerateExamForm,
    replaceExamFormQuestion,
    setExamFormActive,
    createResource,
    listResources,
    updateResource,
    ingestResource,
    listQuestionFeedbackForAdmin,
    updateQuestionFeedback,
  };
}

function toQuestionFeedback(row: QuestionFeedbackRow) {
  return {
    id: row.id,
    userId: row.userId,
    questionId: row.questionId,
    examAttemptId: row.examAttemptId ?? null,
    rating: Number(row.rating),
    disputeCorrectAnswer: Boolean(row.disputeCorrectAnswer),
    message: row.message ?? null,
    status: String(row.status),
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function createNotConfiguredBlueprintParser(): BlueprintParser {
  return {
    provider: "not-configured",
    model: "not-configured",
    async parse() {
      throw new BlueprintParserError(
        "BLUEPRINT_PARSER_NOT_CONFIGURED",
        "Blueprint parser is not configured.",
      );
    },
  };
}
function createNotConfiguredQuestionGenerator(): QuestionGenerator {
  return {
    provider: "not-configured",
    model: "not-configured",
    async generate() {
      throw new QuestionGeneratorError(
        "QUESTION_GENERATOR_NOT_CONFIGURED",
        "Question generator is not configured.",
      );
    },
  };
}
function createNotConfiguredScenarioGenerator(): ScenarioGenerator {
  return {
    provider: "not-configured",
    model: "not-configured",
    async generate() {
      throw new ScenarioGeneratorError("SCENARIO_GENERATOR_NOT_CONFIGURED", "Scenario generator is not configured.");
    },
  };
}


function toIsoString(value: unknown) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return new Date(String(value)).toISOString();
}

function assertPublishableQuestionInput(input: QuestionInput | QuestionUpdateInput) {
  if (input.status !== "published") {
    return;
  }

  const validation = validateQuestionForPublish({
    questionType: input.questionType ?? "single_choice",
    interactionJson: input.interactionJson ?? null,
    mediaAssets: input.mediaAssets ?? [],
    options: (input.options ?? []).map((option) => ({
      isCorrect: Boolean(option.isCorrect),
      explanation: String(option.explanation ?? ""),
      citationUrls: option.citationUrls ?? [],
      mediaAssets: option.mediaAssets ?? [],
    })),
  });
  if (!validation.valid) {
    throw new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      "Question is not publishable",
      validation.errors,
    );
  }
}

function assertAllQuestionsFound(questions: QuestionRow[], questionIds: string[]) {
  const foundIds = new Set(questions.map((question) => question.id));
  const missingId = questionIds.find((id) => !foundIds.has(id));
  if (missingId) {
    throw new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_QUESTION_NOT_FOUND",
      `Question not found: ${missingId}`,
    );
  }
}

function assertQuestionRowPublishable(question: QuestionRow) {
  const validation = validateQuestionForPublish({
    questionType: question.questionType ?? "single_choice",
    interactionJson: question.interactionJson ?? null,
    mediaAssets: question.mediaAssets ?? [],
    options: (question.options ?? []).map((option) => ({
      isCorrect: Boolean(option.isCorrect),
      explanation: String(option.explanation ?? ""),
      citationUrls: option.citationUrls ?? [],
      mediaAssets: option.mediaAssets ?? [],
    })),
  });
  if (!validation.valid) {
    throw new CertDrillAdminServiceError(
      "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      "Question is not publishable",
      validation.errors,
    );
  }
}

function mergeQuestionForValidation(current: QuestionRow, input: QuestionUpdateInput): QuestionUpdateInput {
  return {
    questionType: input.questionType ?? current.questionType ?? "single_choice",
    interactionJson: input.interactionJson !== undefined ? input.interactionJson : current.interactionJson ?? null,
    mediaAssets: input.mediaAssets ?? current.mediaAssets ?? [],
    options: input.options ?? current.options ?? [],
    status: input.status ?? current.status,
  };
}

function assertValidSiblingWeights(items: CategoryWeightRow[]) {
  const validation = validateCategorySiblingWeights(items.map((item) => ({ id: item.id, weightPct: item.weightPct ?? null })));
  if (!validation.valid) {
    throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS", validation.message);
  }
}

function validateExamFormMetadata(input: ExamFormMetadataInput | ExamFormCreateInput) {
  const values: ExamFormMetadataInput = {};
  if ("name" in input && input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw invalidExamForm("Exam form name is required.");
    values.name = name;
  }
  if ("durationMinutes" in input && input.durationMinutes !== undefined) {
    if (!Number.isInteger(input.durationMinutes) || input.durationMinutes <= 0) throw invalidExamForm("Duration must be a positive integer.");
    values.durationMinutes = input.durationMinutes;
  }
  return values as { name: string; durationMinutes: number };
}

function examFormNotFound() {
  return new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_NOT_FOUND", "Exam form not found.");
}

function examFormConflict() {
  return new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_CONFLICT", "The form changed since the editor loaded; reload before retrying.");
}

function invalidExamForm(message: string, details?: unknown) {
  return new CertDrillAdminServiceError("CERTDRILL_ADMIN_EXAM_FORM_INVALID", message, details);
}

function toQuestionValues(input: QuestionInput) {
  return {
    certificationId: input.certificationId,
    categoryId: input.categoryId,
    sourceResourceId: input.sourceResourceId ?? null,
    generationJobId: input.generationJobId ?? null,
    stem: input.stem,
    questionType: input.questionType ?? "single_choice",
    interactionJson: input.interactionJson ?? null,
    mediaAssets: input.mediaAssets ?? [],
    difficulty: input.difficulty ?? "medium",
    status: input.status ?? "draft",
    deliveryPurpose: input.deliveryPurpose ?? "both",
    createdBy: input.createdBy ?? "admin",
  };
}
