import { createHash } from "node:crypto";

import { and, asc, desc, eq } from "drizzle-orm";

import {
  certdrillBlueprintParseRuns,
  certdrillCertifications,
  certdrillExamCategories,
  certdrillLearnResources,
} from "@platform/platform-db";

import { BlueprintParserError, type BlueprintParser } from "./blueprint-parser";
import type { BlueprintProposal } from "./blueprint-proposal";
import { validateCategorySiblingWeights } from "./validation";

const DEFAULT_PROCESS_LIMIT = 5;
const MAX_PROCESS_LIMIT = 25;
const ERROR_MESSAGE_LIMIT = 500;

type BlueprintParseRun = typeof certdrillBlueprintParseRuns.$inferSelect;
type CertificationRow = Pick<typeof certdrillCertifications.$inferSelect, "id" | "code" | "name" | "vendor">;
type ResourceRow = Pick<
  typeof certdrillLearnResources.$inferSelect,
  "id" | "certificationId" | "title" | "url" | "rawContent" | "ingestedAt" | "status"
>;
type CategoryRow = Pick<
  typeof certdrillExamCategories.$inferSelect,
  "id" | "code" | "parentCategoryId" | "weightPct"
>;

export type BlueprintParseServiceErrorCode =
  | "CERTDRILL_BLUEPRINT_PARSE_CERTIFICATION_NOT_FOUND"
  | "CERTDRILL_BLUEPRINT_PARSE_RESOURCE_NOT_FOUND"
  | "CERTDRILL_BLUEPRINT_PARSE_SNAPSHOT_UNAVAILABLE";

export class BlueprintParseServiceError extends Error {
  constructor(
    public readonly code: BlueprintParseServiceErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "BlueprintParseServiceError";
  }
}

export function createBlueprintParseService(deps: {
  db: any;
  parser: BlueprintParser;
  now?: () => Date;
}) {
  const now = deps.now ?? (() => new Date());

  async function start(input: { certificationId: string; resourceId: string }): Promise<BlueprintParseRun> {
    const certification = await deps.db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.id, input.certificationId),
    }) as CertificationRow | null;
    if (!certification) {
      throw new BlueprintParseServiceError(
        "CERTDRILL_BLUEPRINT_PARSE_CERTIFICATION_NOT_FOUND",
        "Certification not found.",
      );
    }

    const resource = await deps.db.query.certdrillLearnResources.findFirst({
      where: and(
        eq(certdrillLearnResources.id, input.resourceId),
        eq(certdrillLearnResources.certificationId, input.certificationId),
      ),
    }) as ResourceRow | null;
    if (!resource) {
      throw new BlueprintParseServiceError(
        "CERTDRILL_BLUEPRINT_PARSE_RESOURCE_NOT_FOUND",
        "Resource not found for certification.",
      );
    }

    if (!hasUsableSnapshot(resource)) {
      throw new BlueprintParseServiceError(
        "CERTDRILL_BLUEPRINT_PARSE_SNAPSHOT_UNAVAILABLE",
        "Resource does not have a usable ingested snapshot.",
      );
    }

    const [row] = await deps.db.insert(certdrillBlueprintParseRuns).values({
      certificationId: certification.id,
      resourceId: resource.id,
      status: "pending",
      provider: deps.parser.provider,
      model: deps.parser.model,
      contentChecksum: calculateChecksum(resource.rawContent),
      proposalJson: null,
      rawOutput: null,
      confidence: null,
      warningsJson: [],
      errorMessage: null,
      startedAt: null,
      completedAt: null,
    }).returning();

    return row;
  }

  async function get(id: string): Promise<BlueprintParseRun | null> {
    return deps.db.query.certdrillBlueprintParseRuns.findFirst({
      where: eq(certdrillBlueprintParseRuns.id, id),
    });
  }

  async function list(certificationId: string): Promise<BlueprintParseRun[]> {
    return deps.db.query.certdrillBlueprintParseRuns.findMany({
      where: eq(certdrillBlueprintParseRuns.certificationId, certificationId),
      orderBy: [desc(certdrillBlueprintParseRuns.createdAt)],
    });
  }

  async function processPending(limit?: number): Promise<{ checked: number; completed: number; failed: number }> {
    const rows = await deps.db.query.certdrillBlueprintParseRuns.findMany({
      where: eq(certdrillBlueprintParseRuns.status, "pending"),
      orderBy: [asc(certdrillBlueprintParseRuns.createdAt)],
      limit: normalizeLimit(limit),
    }) as BlueprintParseRun[];

    let completed = 0;
    let failed = 0;

    for (const row of rows) {
      const claimedAt = now();
      const [claimed] = await deps.db.update(certdrillBlueprintParseRuns).set({
        status: "running",
        startedAt: claimedAt,
        updatedAt: claimedAt,
      }).where(and(
        eq(certdrillBlueprintParseRuns.id, row.id),
        eq(certdrillBlueprintParseRuns.status, "pending"),
      )).returning() as BlueprintParseRun[];

      if (!claimed) {
        continue;
      }

      try {
        const certification = await deps.db.query.certdrillCertifications.findFirst({
          where: eq(certdrillCertifications.id, claimed.certificationId),
        }) as CertificationRow | null;
        if (!certification) {
          throw new Error("Certification not found for blueprint parse run.");
        }

        const resource = await deps.db.query.certdrillLearnResources.findFirst({
          where: and(
            eq(certdrillLearnResources.id, claimed.resourceId),
            eq(certdrillLearnResources.certificationId, claimed.certificationId),
          ),
        }) as ResourceRow | null;
        if (!resource) {
          throw new Error("Resource not found for blueprint parse run.");
        }
        if (!hasUsableSnapshot(resource)) {
          throw new Error("Resource snapshot is no longer available for blueprint parse run.");
        }

        const currentChecksum = calculateChecksum(resource.rawContent);
        if (currentChecksum !== claimed.contentChecksum) {
          throw new Error("Resource snapshot changed after the parse run was queued.");
        }

        const result = await deps.parser.parse({
          certification: {
            code: certification.code,
            name: certification.name,
            vendor: certification.vendor,
          },
          resource: {
            id: resource.id,
            title: resource.title,
            url: resource.url,
            rawContent: resource.rawContent,
          },
        });

        const completedAt = now();
        await withTransaction(deps.db, async (db) => {
          await persistDiscoveredCategories(db, claimed.certificationId, result.proposal);
          await db.update(certdrillBlueprintParseRuns).set({
            status: "completed",
            proposalJson: result.proposal,
            rawOutput: result.rawOutput,
            confidence: result.proposal.confidence,
            warningsJson: result.proposal.warnings,
            errorMessage: null,
            completedAt,
            updatedAt: completedAt,
          }).where(eq(certdrillBlueprintParseRuns.id, claimed.id)).returning();
        });
        completed += 1;
      } catch (error) {
        const completedAt = now();
        await deps.db.update(certdrillBlueprintParseRuns).set({
          status: "failed",
          proposalJson: null,
          rawOutput: error instanceof BlueprintParserError ? error.rawOutput ?? null : null,
          confidence: null,
          warningsJson: [],
          errorMessage: boundErrorMessage(error),
          completedAt,
          updatedAt: completedAt,
        }).where(eq(certdrillBlueprintParseRuns.id, claimed.id)).returning();
        failed += 1;
      }
    }

    return {
      checked: rows.length,
      completed,
      failed,
    };
  }

  return {
    start,
    get,
    list,
    processPending,
  };
}

async function persistDiscoveredCategories(db: any, certificationId: string, proposal: BlueprintProposal) {
  const existingCategories = await db.query.certdrillExamCategories.findMany({
    where: eq(certdrillExamCategories.certificationId, certificationId),
  }) as CategoryRow[];
  const existingCodes = new Set(existingCategories.map((category) => normalizeCategoryCode(category.code)));
  const discoveredCategories = proposal.categories.filter((category) => !existingCodes.has(normalizeCategoryCode(category.code)));

  if (discoveredCategories.length === 0) {
    return;
  }

  const weightValidation = validateCategorySiblingWeights([
    ...existingCategories
      .filter((category) => category.parentCategoryId === null)
      .map((category) => ({ id: category.id, weightPct: category.weightPct })),
    ...discoveredCategories.map((category) => ({ id: category.code, weightPct: category.weightPct })),
  ]);
  if (!weightValidation.valid) {
    throw new Error(`Discovered categories could not be created. ${weightValidation.message}`);
  }

  const insert = db.insert(certdrillExamCategories).values(discoveredCategories.map((category) => ({
    certificationId,
    parentCategoryId: null,
    code: category.code,
    name: category.name,
    weightPct: category.weightPct,
    weightMinPct: category.weightMinPct,
    weightMaxPct: category.weightMaxPct,
    sortOrder: category.sortOrder,
  })));

  if (typeof insert.onConflictDoNothing === "function") {
    await insert.onConflictDoNothing({
      target: [certdrillExamCategories.certificationId, certdrillExamCategories.code],
    }).returning();
    return;
  }

  await insert.returning();
}

function normalizeCategoryCode(code: string) {
  return code.trim().toUpperCase();
}

async function withTransaction<T>(db: any, callback: (transaction: any) => Promise<T>): Promise<T> {
  return typeof db.transaction === "function" ? db.transaction(callback) : callback(db);
}

function normalizeLimit(limit?: number) {
  if (!Number.isInteger(limit) || Number(limit) <= 0) {
    return DEFAULT_PROCESS_LIMIT;
  }

  return Math.min(Number(limit), MAX_PROCESS_LIMIT);
}

function hasUsableSnapshot(resource: ResourceRow | null): resource is ResourceRow & { rawContent: string; ingestedAt: Date } {
  return Boolean(
    resource
    && typeof resource.rawContent === "string"
    && resource.rawContent.trim().length > 0
    && resource.ingestedAt instanceof Date
    && resource.status === "ingested",
  );
}

function calculateChecksum(rawContent: string) {
  return createHash("sha256").update(rawContent).digest("hex");
}

function boundErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length <= ERROR_MESSAGE_LIMIT ? message : message.slice(0, ERROR_MESSAGE_LIMIT);
}
