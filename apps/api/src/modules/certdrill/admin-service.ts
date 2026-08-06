import { and, asc, desc, eq, isNull } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillVendors,
  certdrillExamCategories,
  certdrillExamForms,
  certdrillLearnResources,
  certdrillQuestionFeedback,
  certdrillQuestionGenerationJobs,
  certdrillQuestions,
  type CertDrillDifficulty,
  type CertDrillQuestionStatus,
  type CertDrillQuestionFeedbackStatus,
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
import { createResourceIngestor, type ResourceIngestor } from "./resource-ingestion";
import { validateCategorySiblingWeights, validateQuestionForPublish } from "./validation";

type CertDrillAdminQuestionIndex = Pick<
  ReturnType<typeof createCertDrillAdminQuestionIndex>,
  "query"
>;

type CertDrillAdminQuestionImportService = Pick<
  ReturnType<typeof createQuestionImportService>,
  "preview" | "confirm"
>;

type CertDrillAdminServiceDeps = {
  db: any;
  questionIndex?: CertDrillAdminQuestionIndex;
  questionImport?: CertDrillAdminQuestionImportService;
  resourceIngestor?: ResourceIngestor;
};

export type CertDrillAdminServiceErrorCode =
  | "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND"
  | "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED"
  | "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS"
  | "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE"
  | "CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE"
  | "CERTDRILL_ADMIN_QUESTION_NOT_FOUND"
  | "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE";

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
  mediaAssets?: Array<{ url: string; mimeType?: string; mime_type?: string }>;
  difficulty?: CertDrillDifficulty;
  status?: CertDrillQuestionStatus;
  createdBy?: "ai" | "admin";
  sourceResourceId?: string | null;
  generationJobId?: string | null;
  options?: QuestionOptionInput[];
};

type QuestionUpdateInput = Partial<Omit<QuestionInput, "certificationId" | "createdBy">>;

type ExamFormInput = {
  certificationId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  durationMinutes?: number;
  questionIds: string[];
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

type MockGenerationInput = {
  certificationId: string;
  categoryId: string;
  prompt: string;
  topic?: string | null;
  requestedCount?: number;
  resourceIds?: string[];
};

type CategoryWeightRow = { id: string; weightPct?: string | number | null };
type CategoryRow = CategoryWeightRow & { certificationId?: string; parentCategoryId?: string | null };
type QuestionRow = {
  id: string;
  certificationId?: string;
  categoryId?: string;
  status?: CertDrillQuestionStatus;
  mediaAssets?: QuestionInput["mediaAssets"];
  options?: Array<QuestionOptionInput & { id?: string }>;
};
type ResourceRow = {
  id: string;
  certificationId?: string;
  categoryId?: string | null;
  url: string;
  title: string;
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

  async function previewQuestionImport(input: QuestionImportPreviewInput) {
    return questionImport.preview(input);
  }

  async function importQuestions(input: QuestionImportConfirmInput) {
    return questionImport.confirm(input);
  }
  const resourceIngestor = deps.resourceIngestor ?? createResourceIngestor();

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

      const [row] = await db.update(certdrillExamCategories).set({
        ...input,
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
    const current = await deps.db.query.certdrillQuestions.findFirst({
      where: eq(certdrillQuestions.id, id),
      with: { options: true },
    }) as QuestionRow | null;
    if (!current) {
      throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_QUESTION_NOT_FOUND", "Question not found");
    }
    const effectiveCertificationId = current.certificationId;
    if (effectiveCertificationId && input.categoryId) {
      await assertCategoryBelongsToCertification(deps.db, effectiveCertificationId, input.categoryId);
    }
    if (effectiveCertificationId) {
      await assertQuestionReferencesBelongToCertification(effectiveCertificationId, input);
    }
    assertPublishableQuestionInput(mergeQuestionForValidation(current, input));

    const { options, ...questionInput } = input;

    return withTransaction(async (db) => {
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

    const validation = validateQuestionForPublish({
      mediaAssets: question.mediaAssets ?? [],
      options: (question.options ?? []).map((option: any) => ({
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

    const [row] = await deps.db.update(certdrillQuestions).set({
      status: "published",
      updatedAt: new Date(),
    }).where(eq(certdrillQuestions.id, id)).returning();
    return row;
  }

  async function createExamForm(input: ExamFormInput) {
    await assertQuestionIdsBelongToCertification(input.certificationId, input.questionIds);
    const [row] = await deps.db.insert(certdrillExamForms).values({
      certificationId: input.certificationId,
      name: input.name,
      description: input.description ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      durationMinutes: input.durationMinutes ?? 120,
      questionIds: input.questionIds,
    }).returning();
    return row;
  }

  async function listExamForms(certificationId: string) {
    return deps.db.query.certdrillExamForms.findMany({
      where: eq(certdrillExamForms.certificationId, certificationId),
      orderBy: [asc(certdrillExamForms.sortOrder)],
    });
  }

  async function updateExamForm(id: string, input: Partial<ExamFormInput>) {
    if (input.questionIds || input.certificationId) {
      const current = await deps.db.query.certdrillExamForms.findFirst({ where: eq(certdrillExamForms.id, id) });
      const certificationId = input.certificationId ?? current?.certificationId;
      const questionIds = input.questionIds ?? current?.questionIds;
      if (certificationId && Array.isArray(questionIds)) {
        await assertQuestionIdsBelongToCertification(certificationId, questionIds);
      }
    }
    const [row] = await deps.db.update(certdrillExamForms).set({
      ...input,
      updatedAt: new Date(),
    }).where(eq(certdrillExamForms.id, id)).returning();
    return row;
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

  async function createMockGenerationJob(input: MockGenerationInput) {
    await assertCategoryBelongsToCertification(deps.db, input.certificationId, input.categoryId);
    await assertResourceIdsBelongToCertification(input.certificationId, input.resourceIds ?? [], "Generation resource IDs must belong to the certification");
    const requestedCount = Math.max(1, input.requestedCount ?? 1);
    return withTransaction(async (db) => {
      const [job] = await db.insert(certdrillQuestionGenerationJobs).values({
        certificationId: input.certificationId,
        categoryId: input.categoryId,
        resourceIds: input.resourceIds ?? [],
        requestedCount,
        provider: "mock",
        status: "completed",
        modelUsed: "certdrill-mock-generator",
        generatedCount: requestedCount,
        startedAt: new Date(),
        completedAt: new Date(),
      }).returning();

      const generatedQuestions = [];
      for (let index = 0; index < requestedCount; index += 1) {
        const [question] = await db.insert(certdrillQuestions).values({
          certificationId: input.certificationId,
          categoryId: input.categoryId,
          generationJobId: job.id,
          stem: buildMockStem(input, index),
          mediaAssets: [],
          difficulty: "medium",
          status: "draft",
          createdBy: "ai",
        }).returning();
        await insertQuestionOptions(db, question.id, buildMockOptions(input, index));
        generatedQuestions.push(question);
      }

      return { job, generatedQuestions };
    });
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

  async function assertQuestionReferencesBelongToCertification(certificationId: string, input: Pick<QuestionInput, "sourceResourceId" | "generationJobId">) {
    if (input.sourceResourceId) {
      const resource = await deps.db.query.certdrillLearnResources.findFirst({
        where: and(eq(certdrillLearnResources.id, input.sourceResourceId), eq(certdrillLearnResources.certificationId, certificationId)),
      }) as ResourceRow | null;
      if (!resource) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Question source resource must belong to the certification");
      }
    }

    if (input.generationJobId) {
      const generationJob = await deps.db.query.certdrillQuestionGenerationJobs.findFirst({
        where: and(eq(certdrillQuestionGenerationJobs.id, input.generationJobId), eq(certdrillQuestionGenerationJobs.certificationId, certificationId)),
      }) as GenerationJobRow | null;
      if (!generationJob) {
        throw new CertDrillAdminServiceError("CERTDRILL_ADMIN_CROSS_CERT_REFERENCE", "Question generation job must belong to the certification");
      }
    }
  }

  return {
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
    previewQuestionImport,
    importQuestions,
    createExamForm,
    listExamForms,
    updateExamForm,
    createResource,
    listResources,
    updateResource,
    ingestResource,
    createMockGenerationJob,
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

function mergeQuestionForValidation(current: QuestionRow, input: QuestionUpdateInput): QuestionUpdateInput {
  return {
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

function toQuestionValues(input: QuestionInput) {
  return {
    certificationId: input.certificationId,
    categoryId: input.categoryId,
    sourceResourceId: input.sourceResourceId ?? null,
    generationJobId: input.generationJobId ?? null,
    stem: input.stem,
    mediaAssets: input.mediaAssets ?? [],
    difficulty: input.difficulty ?? "medium",
    status: input.status ?? "draft",
    createdBy: input.createdBy ?? "admin",
  };
}

function buildMockStem(input: MockGenerationInput, index: number) {
  const topic = input.topic?.trim() || "CertDrill";
  return `Mock ${topic} question ${index + 1}: ${input.prompt.trim()}`;
}

function buildMockOptions(input: MockGenerationInput, index: number): QuestionOptionInput[] {
  const topic = input.topic?.trim() || "CertDrill";
  return [
    {
      text: `${topic} correct option ${index + 1}`,
      isCorrect: true,
      explanation: `Mock explanation derived from: ${input.prompt.trim()}`,
      citationUrls: [],
      sortOrder: 0,
    },
    { text: `${topic} distractor A ${index + 1}`, isCorrect: false, explanation: "Mock distractor.", citationUrls: [], sortOrder: 1 },
    { text: `${topic} distractor B ${index + 1}`, isCorrect: false, explanation: "Mock distractor.", citationUrls: [], sortOrder: 2 },
    { text: `${topic} distractor C ${index + 1}`, isCorrect: false, explanation: "Mock distractor.", citationUrls: [], sortOrder: 3 },
  ];
}
