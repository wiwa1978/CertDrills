import { createHash } from "node:crypto";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import {
  certdrillCertifications,
  certdrillLearnResources,
  certdrillScenarioGenerationJobs,
  certdrillScenarios,
} from "@platform/platform-db";

import { ScenarioGeneratorError, type ScenarioGenerator, type ScenarioGeneratorInput, type ScenarioGeneratorResult } from "./scenario-generator";
import { validateScenarioGraph } from "./scenario-validation";

const MAX_PROCESS_LIMIT = 10;
const MAX_GENERATOR_BATCH_SIZE = 2;
const ERROR_MESSAGE_LIMIT = 500;
const STALE_RUNNING_JOB_MS = 15 * 60 * 1_000;

type JobRow = typeof certdrillScenarioGenerationJobs.$inferSelect;
type ResourceRow = typeof certdrillLearnResources.$inferSelect;

export class ScenarioGenerationServiceError extends Error {
  constructor(
    public readonly code: "SCENARIO_GENERATION_CERTIFICATION_NOT_FOUND" | "SCENARIO_GENERATION_RESOURCE_NOT_FOUND" | "SCENARIO_GENERATION_RESOURCE_UNAVAILABLE",
    message: string,
  ) {
    super(message);
    this.name = "ScenarioGenerationServiceError";
  }
}

export function createScenarioGenerationService(deps: { db: any; generator: ScenarioGenerator; now?: () => Date }) {
  const now = deps.now ?? (() => new Date());

  async function start(input: {
    certificationId: string;
    resourceIds: string[];
    requestedCount: number;
    difficulty: "easy" | "medium" | "hard";
    focus: string | null;
    instructions: string | null;
  }): Promise<JobRow> {
    const certification = await deps.db.query.certdrillCertifications.findFirst({ where: eq(certdrillCertifications.id, input.certificationId) });
    if (!certification) throw new ScenarioGenerationServiceError("SCENARIO_GENERATION_CERTIFICATION_NOT_FOUND", "Certification not found.");
    const resources = await loadResources(deps.db, input.certificationId, input.resourceIds);
    assertUsableResources(resources, input.resourceIds);
    const [job] = await deps.db.insert(certdrillScenarioGenerationJobs).values({
      ...input,
      provider: deps.generator.provider,
      modelUsed: deps.generator.model,
      status: "pending",
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
    return deps.db.query.certdrillScenarioGenerationJobs.findFirst({ where: eq(certdrillScenarioGenerationJobs.id, id) });
  }

  async function list(certificationId: string): Promise<JobRow[]> {
    return deps.db.query.certdrillScenarioGenerationJobs.findMany({
      where: eq(certdrillScenarioGenerationJobs.certificationId, certificationId),
      orderBy: [desc(certdrillScenarioGenerationJobs.createdAt)],
    });
  }

  async function processPending(limit?: number) {
    const recoveryTime = now();
    await deps.db.update(certdrillScenarioGenerationJobs).set({
      status: "pending",
      startedAt: null,
      completedAt: null,
      generatedCount: null,
      errorMessage: null,
      updatedAt: recoveryTime,
    }).where(and(
      eq(certdrillScenarioGenerationJobs.status, "running"),
      lte(certdrillScenarioGenerationJobs.startedAt, new Date(recoveryTime.getTime() - STALE_RUNNING_JOB_MS)),
    ));
    const jobs = await deps.db.query.certdrillScenarioGenerationJobs.findMany({
      where: eq(certdrillScenarioGenerationJobs.status, "pending"),
      orderBy: [asc(certdrillScenarioGenerationJobs.createdAt)],
      limit: normalizeLimit(limit),
    }) as JobRow[];
    let completed = 0;
    let failed = 0;

    for (const row of jobs) {
      const startedAt = now();
      const [claimed] = await deps.db.update(certdrillScenarioGenerationJobs).set({ status: "running", startedAt, updatedAt: startedAt })
        .where(and(eq(certdrillScenarioGenerationJobs.id, row.id), eq(certdrillScenarioGenerationJobs.status, "pending"))).returning() as JobRow[];
      if (!claimed) continue;
      try {
        const certification = await deps.db.query.certdrillCertifications.findFirst({ where: eq(certdrillCertifications.id, claimed.certificationId) });
        if (!certification) throw new Error("Certification not found for scenario generation job.");
        const resources = await loadResources(deps.db, claimed.certificationId, claimed.resourceIds);
        assertUsableResources(resources, claimed.resourceIds);
        const expectedChecksums = claimed.resourceChecksumsJson as Record<string, string>;
        if (resources.some((resource) => expectedChecksums[resource.id] !== checksum(resource.rawContent!))) {
          throw new Error("A source snapshot changed after the scenario generation job was queued.");
        }
        const existing = await deps.db.query.certdrillScenarios.findMany({
          where: eq(certdrillScenarios.certificationId, claimed.certificationId),
          columns: { title: true },
        }) as Array<{ title: string }>;
        const result = await generateInBatches(deps.generator, {
          certification: { code: certification.code, name: certification.name, vendor: certification.vendor },
          resources: resources.map((resource) => ({ id: resource.id, title: resource.title, url: resource.url, rawContent: resource.rawContent! })),
          requestedCount: claimed.requestedCount,
          difficulty: claimed.difficulty,
          focus: claimed.focus,
          instructions: claimed.instructions,
          existingTitles: existing.map((scenario) => scenario.title),
        });
        for (const scenario of result.proposal.scenarios) validateScenarioGraph(scenario.contentJson);
        const completedAt = now();
        await transaction(deps.db, async (db) => {
          await db.insert(certdrillScenarios).values(result.proposal.scenarios.map((scenario) => ({
            certificationId: claimed.certificationId,
            sourceResourceIds: claimed.resourceIds,
            generationJobId: claimed.id,
            createdBy: "ai" as const,
            title: scenario.title,
            description: scenario.description,
            difficulty: scenario.difficulty,
            estimatedMinutes: scenario.estimatedMinutes,
            status: "draft" as const,
            contentJson: scenario.contentJson,
            validatedAt: null,
          }))).returning();
          await db.update(certdrillScenarioGenerationJobs).set({
            status: "completed",
            generatedCount: result.proposal.scenarios.length,
            rawOutput: result.rawOutput,
            errorMessage: null,
            completedAt,
            updatedAt: completedAt,
          }).where(eq(certdrillScenarioGenerationJobs.id, claimed.id)).returning();
        });
        completed += 1;
      } catch (error) {
        const completedAt = now();
        await deps.db.update(certdrillScenarioGenerationJobs).set({
          status: "failed",
          generatedCount: 0,
          rawOutput: error instanceof ScenarioGeneratorError ? error.rawOutput ?? null : null,
          errorMessage: boundError(error),
          completedAt,
          updatedAt: completedAt,
        }).where(eq(certdrillScenarioGenerationJobs.id, claimed.id)).returning();
        failed += 1;
      }
    }
    return { checked: jobs.length, completed, failed };
  }

  return { start, get, list, processPending };
}

async function generateInBatches(generator: ScenarioGenerator, input: ScenarioGeneratorInput): Promise<ScenarioGeneratorResult> {
  const scenarios: ScenarioGeneratorResult["proposal"]["scenarios"] = [];
  const rawOutputs: string[] = [];
  while (scenarios.length < input.requestedCount) {
    const requestedCount = Math.min(MAX_GENERATOR_BATCH_SIZE, input.requestedCount - scenarios.length);
    const result = await generator.generate({
      ...input,
      requestedCount,
      existingTitles: [...input.existingTitles, ...scenarios.map((scenario) => scenario.title)],
    });
    if (result.proposal.scenarios.length !== requestedCount) throw new Error(`Generator returned ${result.proposal.scenarios.length} scenarios; expected ${requestedCount}.`);
    scenarios.push(...result.proposal.scenarios);
    rawOutputs.push(result.rawOutput);
  }
  return { proposal: { scenarios }, rawOutput: rawOutputs.length === 1 ? rawOutputs[0]! : JSON.stringify({ batches: rawOutputs }) };
}

async function loadResources(db: any, certificationId: string, ids: string[]): Promise<ResourceRow[]> {
  if (ids.length === 0) return [];
  return db.query.certdrillLearnResources.findMany({ where: and(eq(certdrillLearnResources.certificationId, certificationId), inArray(certdrillLearnResources.id, ids)) });
}
function assertUsableResources(resources: ResourceRow[], requestedIds: string[]) {
  if (requestedIds.length === 0) throw new ScenarioGenerationServiceError("SCENARIO_GENERATION_RESOURCE_UNAVAILABLE", "At least one ingested deep-content source is required.");
  const ids = new Set(resources.map((resource) => resource.id));
  if (requestedIds.some((id) => !ids.has(id))) throw new ScenarioGenerationServiceError("SCENARIO_GENERATION_RESOURCE_NOT_FOUND", "A scenario generation source was not found for the certification.");
  if (resources.some((resource) => resource.status !== "ingested" || !resource.ingestedAt || !resource.rawContent?.trim() || resource.contentMode !== "deep_content")) {
    throw new ScenarioGenerationServiceError("SCENARIO_GENERATION_RESOURCE_UNAVAILABLE", "Every scenario generation source must be an ingested deep-content resource.");
  }
}
function checksum(value: string) { return createHash("sha256").update(value).digest("hex"); }
function normalizeLimit(limit?: number) { return Number.isInteger(limit) && Number(limit) > 0 ? Math.min(Number(limit), MAX_PROCESS_LIMIT) : 3; }
function boundError(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MESSAGE_LIMIT); }
async function transaction<T>(db: any, callback: (tx: any) => Promise<T>) { return typeof db.transaction === "function" ? db.transaction(callback) : callback(db); }
