import { createHash, randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillExamCategories,
  certdrillLearnResources,
  certdrillQuestionGenerationJobs,
  certdrillQuestions,
} from "@platform/platform-db";

import { QuestionGeneratorError, type QuestionGenerator, type QuestionGeneratorInput, type QuestionGeneratorResult } from "./question-generator";
import { questionGenerationConfigSchema, type QuestionGenerationConfig, type QuestionGenerationProposal } from "./question-generation-proposal";

const DEFAULT_PROCESS_LIMIT = 3;
const MAX_PROCESS_LIMIT = 10;
const ERROR_MESSAGE_LIMIT = 500;
const MAX_GENERATOR_BATCH_SIZE = 10;

type JobRow = typeof certdrillQuestionGenerationJobs.$inferSelect;
type ResourceRow = typeof certdrillLearnResources.$inferSelect;
type CertificationRow = Pick<typeof certdrillCertifications.$inferSelect, "id" | "code" | "name" | "vendor">;
type CategoryRow = Pick<typeof certdrillExamCategories.$inferSelect, "id" | "certificationId" | "code" | "name" | "parentCategoryId" | "weightPct">;

export class QuestionGenerationServiceError extends Error {
  constructor(
    public readonly code: "QUESTION_GENERATION_CERTIFICATION_NOT_FOUND" | "QUESTION_GENERATION_CATEGORY_NOT_FOUND" | "QUESTION_GENERATION_RESOURCE_NOT_FOUND" | "QUESTION_GENERATION_RESOURCE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "QuestionGenerationServiceError";
  }
}

export function createQuestionGenerationService(deps: { db: any; generator: QuestionGenerator; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());

  async function start(input: {
    certificationId: string;
    categoryId: string | null;
    resourceIds: string[];
    requestedCount: number;
    config: QuestionGenerationConfig;
  }): Promise<JobRow> {
    const certification = await loadCertification(deps.db, input.certificationId);
    if (!certification) throw new QuestionGenerationServiceError("QUESTION_GENERATION_CERTIFICATION_NOT_FOUND", "Certification not found.");
    const categories = input.categoryId
      ? [await loadCategory(deps.db, input.certificationId, input.categoryId)].filter((category): category is CategoryRow => category !== null)
      : await loadCategories(deps.db, input.certificationId);
    if (categories.length === 0) throw new QuestionGenerationServiceError("QUESTION_GENERATION_CATEGORY_NOT_FOUND", "No generation categories were found for the certification.");
    const resources = await loadResources(deps.db, input.certificationId, input.resourceIds);
    assertUsableResources(resources, input.resourceIds);
    const config = questionGenerationConfigSchema.parse(input.config);

    const [job] = await deps.db.insert(certdrillQuestionGenerationJobs).values({
      certificationId: input.certificationId,
      categoryId: input.categoryId,
      resourceIds: input.resourceIds,
      requestedCount: input.requestedCount,
      provider: deps.generator.provider,
      status: "pending",
      modelUsed: deps.generator.model,
      configurationJson: config,
      resourceChecksumsJson: Object.fromEntries(resources.map((resource) => [resource.id, checksum(resource.rawContent!)])),
      rawOutput: null,
      generatedCount: null,
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }).returning();
    return job;
  }

  async function get(id: string): Promise<JobRow | null> {
    return deps.db.query.certdrillQuestionGenerationJobs.findFirst({ where: eq(certdrillQuestionGenerationJobs.id, id) });
  }

  async function list(certificationId: string): Promise<JobRow[]> {
    return deps.db.query.certdrillQuestionGenerationJobs.findMany({
      where: eq(certdrillQuestionGenerationJobs.certificationId, certificationId),
      orderBy: [desc(certdrillQuestionGenerationJobs.createdAt)],
    });
  }

  async function processPending(limit?: number) {
    const rows = await deps.db.query.certdrillQuestionGenerationJobs.findMany({
      where: eq(certdrillQuestionGenerationJobs.status, "pending"),
      orderBy: [asc(certdrillQuestionGenerationJobs.createdAt)],
      limit: normalizeLimit(limit),
    }) as JobRow[];
    let completed = 0;
    let failed = 0;

    for (const row of rows) {
      const startedAt = now();
      const [claimed] = await deps.db.update(certdrillQuestionGenerationJobs).set({
        status: "running", startedAt, updatedAt: startedAt,
      }).where(and(eq(certdrillQuestionGenerationJobs.id, row.id), eq(certdrillQuestionGenerationJobs.status, "pending"))).returning() as JobRow[];
      if (!claimed) continue;

      try {
        const certification = await loadCertification(deps.db, claimed.certificationId);
        if (!certification) throw new Error("Certification not found for generation job.");
        const categories = claimed.categoryId
          ? [await loadCategory(deps.db, claimed.certificationId, claimed.categoryId)].filter((category): category is CategoryRow => category !== null)
          : await loadCategories(deps.db, claimed.certificationId);
        if (categories.length === 0) throw new Error("No generation categories were found for the generation job.");
        const resources = await loadResources(deps.db, claimed.certificationId, claimed.resourceIds);
        assertUsableResources(resources, claimed.resourceIds);
        const expectedChecksums = claimed.resourceChecksumsJson as Record<string, string>;
        if (resources.some((resource) => expectedChecksums[resource.id] !== checksum(resource.rawContent!))) {
          throw new Error("A source snapshot changed after the generation job was queued.");
        }
        const existingQuestions = await deps.db.query.certdrillQuestions.findMany({
          where: eq(certdrillQuestions.certificationId, claimed.certificationId),
          columns: { stem: true },
        }) as Array<{ stem: string }>;
        const config = questionGenerationConfigSchema.parse(claimed.configurationJson);
        const result = await generateInBatches(deps.generator, {
          certification,
          categories,
          resources: resources.map((resource) => ({ id: resource.id, title: resource.title, url: resource.url, rawContent: resource.rawContent! })),
          requestedCount: claimed.requestedCount,
          config,
          existingQuestionStems: existingQuestions.map((question) => question.stem),
        });
        const allowedCategoryIds = new Set(categories.map((candidate) => candidate.id));
        if (result.proposal.questions.some((question) => !allowedCategoryIds.has(question.categoryId))) {
          throw new Error("Generator assigned a question outside the generation category scope.");
        }
        const completedAt = now();
        await transaction(deps.db, async (db) => {
          for (const generated of result.proposal.questions) {
            const [question] = await db.insert(certdrillQuestions).values({
              certificationId: claimed.certificationId,
              categoryId: generated.categoryId,
              sourceResourceId: resources[0]?.id ?? null,
              generationJobId: claimed.id,
              questionType: generated.questionType,
              interactionJson: generatedInteraction(generated),
              stem: generated.stem,
              mediaAssets: [],
              difficulty: generated.difficulty,
              status: "draft",
              deliveryPurpose: config.deliveryPurpose,
              createdBy: "ai",
            }).returning();
            if (generated.questionType === "single_choice") {
              await db.insert(certdrillAnswerOptions).values(generated.options.map((option, index) => ({
                questionId: question.id,
                text: option.text,
                mediaAssets: [],
                isCorrect: option.isCorrect,
                explanation: option.explanation,
                citationUrls: option.citationUrls,
                sortOrder: index,
              }))).returning();
            }
          }
          await db.update(certdrillQuestionGenerationJobs).set({
            status: "completed",
            generatedCount: result.proposal.questions.length,
            rawOutput: result.rawOutput,
            errorMessage: null,
            completedAt,
            updatedAt: completedAt,
          }).where(eq(certdrillQuestionGenerationJobs.id, claimed.id)).returning();
        });
        completed += 1;
      } catch (error) {
        const completedAt = now();
        await deps.db.update(certdrillQuestionGenerationJobs).set({
          status: "failed",
          generatedCount: 0,
          rawOutput: error instanceof QuestionGeneratorError ? error.rawOutput ?? null : null,
          errorMessage: boundError(error),
          completedAt,
          updatedAt: completedAt,
        }).where(eq(certdrillQuestionGenerationJobs.id, claimed.id)).returning();
        failed += 1;
      }
    }
    return { checked: rows.length, completed, failed };
  }

  return { start, get, list, processPending };
}

async function generateInBatches(generator: QuestionGenerator, input: QuestionGeneratorInput): Promise<QuestionGeneratorResult> {
  const questions: QuestionGeneratorResult["proposal"]["questions"] = [];
  const rawOutputs: string[] = [];

  while (questions.length < input.requestedCount) {
    const requestedCount = Math.min(MAX_GENERATOR_BATCH_SIZE, input.requestedCount - questions.length);
    const result = await generator.generate({
      ...input,
      requestedCount,
      existingQuestionStems: [...input.existingQuestionStems, ...questions.map((question) => question.stem)],
    });
    if (result.proposal.questions.length !== requestedCount) {
      throw new Error(`Generator returned ${result.proposal.questions.length} questions; expected ${requestedCount}.`);
    }
    questions.push(...result.proposal.questions);
    rawOutputs.push(result.rawOutput);
  }

  return {
    proposal: { questions },
    rawOutput: rawOutputs.length === 1 ? rawOutputs[0]! : JSON.stringify({ batches: rawOutputs }),
  };
}

function generatedInteraction(question: QuestionGenerationProposal["questions"][number]) {
  if (question.questionType === "single_choice") return null;
  if (question.questionType === "fill_blank") {
    return {
      type: "fill_blank" as const,
      acceptedAnswers: question.acceptedAnswers,
      explanation: question.explanation,
      citationUrls: question.citationUrls,
    };
  }
  return {
    type: "matching" as const,
    pairs: question.pairs.map((pair) => ({
      promptId: randomUUID(),
      targetId: randomUUID(),
      ...pair,
    })),
  };
}

async function loadCertification(db: any, id: string): Promise<CertificationRow | null> {
  return db.query.certdrillCertifications.findFirst({ where: eq(certdrillCertifications.id, id) });
}
async function loadCategory(db: any, certificationId: string, id: string): Promise<CategoryRow | null> {
  return db.query.certdrillExamCategories.findFirst({ where: and(eq(certdrillExamCategories.id, id), eq(certdrillExamCategories.certificationId, certificationId)) });
}
async function loadCategories(db: any, certificationId: string): Promise<CategoryRow[]> {
  return db.query.certdrillExamCategories.findMany({
    where: and(eq(certdrillExamCategories.certificationId, certificationId), isNull(certdrillExamCategories.archivedAt)),
    orderBy: [asc(certdrillExamCategories.sortOrder), asc(certdrillExamCategories.id)],
  });
}
async function loadResources(db: any, certificationId: string, ids: string[]): Promise<ResourceRow[]> {
  if (ids.length === 0) return [];
  return db.query.certdrillLearnResources.findMany({ where: and(eq(certdrillLearnResources.certificationId, certificationId), inArray(certdrillLearnResources.id, ids)) });
}
function assertUsableResources(resources: ResourceRow[], requestedIds: string[]) {
  if (requestedIds.length === 0) {
    throw new QuestionGenerationServiceError("QUESTION_GENERATION_RESOURCE_UNAVAILABLE", "At least one ingested deep-content source is required.");
  }
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  if (requestedIds.some((id) => !resourcesById.has(id))) throw new QuestionGenerationServiceError("QUESTION_GENERATION_RESOURCE_NOT_FOUND", "A generation source was not found for the certification.");
  if (resources.some((resource) => resource.status !== "ingested" || !resource.ingestedAt || !resource.rawContent?.trim() || resource.contentMode !== "deep_content")) {
    throw new QuestionGenerationServiceError("QUESTION_GENERATION_RESOURCE_UNAVAILABLE", "Every generation source must be an ingested deep-content resource.");
  }
}
function checksum(content: string) { return createHash("sha256").update(content).digest("hex"); }
function normalizeLimit(limit?: number) { return Number.isInteger(limit) && Number(limit) > 0 ? Math.min(Number(limit), MAX_PROCESS_LIMIT) : DEFAULT_PROCESS_LIMIT; }
function boundError(error: unknown) { const message = error instanceof Error ? error.message : String(error); return message.slice(0, ERROR_MESSAGE_LIMIT); }
async function transaction<T>(db: any, callback: (tx: any) => Promise<T>): Promise<T> { return typeof db.transaction === "function" ? db.transaction(callback) : callback(db); }
