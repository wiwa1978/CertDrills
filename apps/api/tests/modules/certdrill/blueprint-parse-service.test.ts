import { describe, expect, it, vi } from "vitest";

import { BlueprintParserError } from "../../../src/modules/certdrill/blueprint-parser";
import {
  BlueprintParseServiceError,
  createBlueprintParseService,
} from "../../../src/modules/certdrill/blueprint-parse-service";

const ids = {
  cert: "22222222-2222-4222-8222-222222222222",
  otherCert: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  resource: "88888888-8888-4888-8888-888888888888",
  otherResource: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  runA: "11111111-1111-4111-8111-111111111111",
  runB: "12121212-1212-4121-8121-121212121212",
};

const fixedNow = new Date("2026-08-06T12:34:56.000Z");
const ingestedAt = new Date("2026-08-05T10:00:00.000Z");

describe("Blueprint parse service", () => {
  it("rejects missing certifications and cross-certification resources when starting runs", async () => {
    const parser = createParser();
    const missingCertDb = createBlueprintParseDb({
      resources: [resourceRow()],
    });
    const crossCertDb = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow({ certificationId: ids.otherCert })],
    });

    const missingCertService = createBlueprintParseService({ db: missingCertDb.db, parser, now: () => fixedNow });
    const crossCertService = createBlueprintParseService({ db: crossCertDb.db, parser, now: () => fixedNow });

    await expect(missingCertService.start({ certificationId: ids.cert, resourceId: ids.resource })).rejects.toMatchObject({
      code: "CERTDRILL_BLUEPRINT_PARSE_CERTIFICATION_NOT_FOUND",
      message: "Certification not found.",
    });
    await expect(crossCertService.start({ certificationId: ids.cert, resourceId: ids.resource })).rejects.toMatchObject({
      code: "CERTDRILL_BLUEPRINT_PARSE_RESOURCE_NOT_FOUND",
      message: "Resource not found for certification.",
    });

    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("rejects start when the resource snapshot is missing or unusable", async () => {
    const parser = createParser();
    const { db } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow({
        rawContent: "Previous snapshot",
        ingestedAt,
        status: "failed",
      })],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.start({ certificationId: ids.cert, resourceId: ids.resource })).rejects.toMatchObject({
      code: "CERTDRILL_BLUEPRINT_PARSE_SNAPSHOT_UNAVAILABLE",
      message: "Resource does not have a usable ingested snapshot.",
    });

    expect(parser.parse).not.toHaveBeenCalled();
  });

  it("stores pending runs with the parser metadata and snapshot checksum", async () => {
    const parser = createParser({ provider: "test-provider", model: "test-model" });
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow({
        rawContent: "Skills measured\n- Domain 1\n- Domain 2",
        ingestedAt,
      })],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    const run = await service.start({ certificationId: ids.cert, resourceId: ids.resource });

    expect(run).toMatchObject({
      certificationId: ids.cert,
      resourceId: ids.resource,
      status: "pending",
      provider: "test-provider",
      model: "test-model",
      proposalJson: null,
      rawOutput: null,
      confidence: null,
      warningsJson: [],
      errorMessage: null,
    });
    expect(run.contentChecksum).toHaveLength(64);
    expect(state.runs).toHaveLength(1);
    expect(state.runs[0]).toMatchObject({
      id: run.id,
      provider: "test-provider",
      model: "test-model",
      contentChecksum: run.contentChecksum,
      status: "pending",
    });
  });

  it("creates a new row for each retry instead of overwriting run history", async () => {
    const parser = createParser();
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    const first = await service.start({ certificationId: ids.cert, resourceId: ids.resource });
    const second = await service.start({ certificationId: ids.cert, resourceId: ids.resource });

    expect(first.id).not.toBe(second.id);
    expect(state.runs.map((run) => run.id)).toEqual([first.id, second.id]);
    expect(state.runs.every((run) => run.status === "pending")).toBe(true);
  });

  it("returns individual runs and lists them newest first", async () => {
    const parser = createParser();
    const older = runRow({
      id: ids.runA,
      createdAt: new Date("2026-08-05T09:00:00.000Z"),
      updatedAt: new Date("2026-08-05T09:00:00.000Z"),
    });
    const newer = runRow({
      id: ids.runB,
      createdAt: new Date("2026-08-06T09:00:00.000Z"),
      updatedAt: new Date("2026-08-06T09:00:00.000Z"),
    });
    const { db } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
      runs: [older, newer],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.get(ids.runA)).resolves.toEqual(older);
    await expect(service.list(ids.cert)).resolves.toEqual([newer, older]);
  });

  it("claims pending runs atomically and skips rows claimed elsewhere", async () => {
    const parser = createParser();
    const firstRun = runRow({
      id: ids.runA,
      createdAt: new Date("2026-08-05T09:00:00.000Z"),
      updatedAt: new Date("2026-08-05T09:00:00.000Z"),
    });
    const secondRun = runRow({
      id: ids.runB,
      createdAt: new Date("2026-08-05T10:00:00.000Z"),
      updatedAt: new Date("2026-08-05T10:00:00.000Z"),
    });
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
      runs: [firstRun, secondRun],
      lostClaimRunIds: [ids.runA],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.processPending(2)).resolves.toEqual({ checked: 2, completed: 1, failed: 0 });

    expect(parser.parse).toHaveBeenCalledTimes(1);
    expect(parser.parse).toHaveBeenCalledWith({
      certification: {
        code: "AWS-SAA-C03",
        name: "AWS Architect",
        vendor: "AWS",
      },
      resource: {
        id: ids.resource,
        title: "Study guide",
        url: "https://learn.example/guide",
        rawContent: "Skills measured",
      },
    });
    expect(state.runs.find((run) => run.id === ids.runA)?.status).toBe("pending");
    expect(state.runs.find((run) => run.id === ids.runB)).toMatchObject({
      status: "completed",
      startedAt: fixedNow,
      completedAt: fixedNow,
      updatedAt: fixedNow,
    });
  });

  it("persists completed proposals and calls the parser with the claimed snapshot metadata", async () => {
    const parser = createParser({
      parseResult: {
        rawOutput: "{\"confidence\":\"high\"}",
        proposal: proposal({ confidence: "high" }),
      },
    });
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });
    const run = await service.start({ certificationId: ids.cert, resourceId: ids.resource });

    await expect(service.processPending()).resolves.toEqual({ checked: 1, completed: 1, failed: 0 });

    expect(parser.parse).toHaveBeenCalledWith({
      certification: {
        code: "AWS-SAA-C03",
        name: "AWS Architect",
        vendor: "AWS",
      },
      resource: {
        id: ids.resource,
        title: "Study guide",
        url: "https://learn.example/guide",
        rawContent: "Skills measured",
      },
    });
    expect(state.runs.find((entry) => entry.id === run.id)).toMatchObject({
      status: "completed",
      proposalJson: proposal({ confidence: "high" }),
      confidence: "high",
      warningsJson: ["Preserve vendor wording."],
      rawOutput: "{\"confidence\":\"high\"}",
      errorMessage: null,
      startedAt: fixedNow,
      completedAt: fixedNow,
      updatedAt: fixedNow,
    });
    expect(state.runs.find((entry) => entry.id === run.id)?.proposalJson).toEqual(proposal({ confidence: "high" }));
  });

  it("persists parser raw output when a typed parser error includes diagnostics", async () => {
    const parser = createParser({
      parseError: new BlueprintParserError(
        "BLUEPRINT_PARSER_INVALID_OUTPUT",
        "Blueprint proposal failed validation.",
        { rawOutput: "{\"confidence\":\"low\"}" },
      ),
    });
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
      runs: [runRow()],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.processPending()).resolves.toEqual({ checked: 1, completed: 0, failed: 1 });

    expect(state.runs[0]).toMatchObject({
      status: "failed",
      errorMessage: "Blueprint proposal failed validation.",
      rawOutput: "{\"confidence\":\"low\"}",
      startedAt: fixedNow,
      completedAt: fixedNow,
      updatedAt: fixedNow,
    });
  });

  it("bounds provider failure messages and leaves raw output empty when unavailable", async () => {
    const parser = createParser({
      parseError: new BlueprintParserError(
        "BLUEPRINT_PARSER_REQUEST_FAILED",
        "X".repeat(800),
      ),
    });
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
      runs: [runRow()],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.processPending()).resolves.toEqual({ checked: 1, completed: 0, failed: 1 });

    expect(state.runs[0].status).toBe("failed");
    expect(state.runs[0].rawOutput).toBeNull();
    expect(state.runs[0].errorMessage).toHaveLength(500);
  });

  it("fails claimed runs explicitly when referenced resources disappear after enqueue", async () => {
    const parser = createParser();
    const dbState = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
    });
    const service = createBlueprintParseService({ db: dbState.db, parser, now: () => fixedNow });
    const run = await service.start({ certificationId: ids.cert, resourceId: ids.resource });

    dbState.state.resources.splice(0, dbState.state.resources.length);

    await expect(service.processPending()).resolves.toEqual({ checked: 1, completed: 0, failed: 1 });

    expect(parser.parse).not.toHaveBeenCalled();
    expect(dbState.state.runs.find((entry) => entry.id === run.id)).toMatchObject({
      status: "failed",
      errorMessage: "Resource not found for blueprint parse run.",
      completedAt: fixedNow,
      updatedAt: fixedNow,
    });
  });

  it("continues processing later rows after a generic failure and reports aggregate counts", async () => {
    const parser = {
      provider: "test-provider",
      model: "test-model",
      parse: vi.fn()
        .mockRejectedValueOnce(new Error("Provider connection dropped."))
        .mockResolvedValueOnce({
          rawOutput: "{\"confidence\":\"high\"}",
          proposal: proposal({ confidence: "high", warnings: [] }),
        }),
    };
    const { db, state } = createBlueprintParseDb({
      certifications: [certificationRow()],
      resources: [resourceRow()],
      runs: [
        runRow({
          id: ids.runA,
          createdAt: new Date("2026-08-05T09:00:00.000Z"),
          updatedAt: new Date("2026-08-05T09:00:00.000Z"),
        }),
        runRow({
          id: ids.runB,
          createdAt: new Date("2026-08-05T10:00:00.000Z"),
          updatedAt: new Date("2026-08-05T10:00:00.000Z"),
        }),
      ],
    });
    const service = createBlueprintParseService({ db, parser, now: () => fixedNow });

    await expect(service.processPending(2)).resolves.toEqual({ checked: 2, completed: 1, failed: 1 });

    expect(parser.parse).toHaveBeenCalledTimes(2);
    expect(state.runs.find((run) => run.id === ids.runA)).toMatchObject({
      status: "failed",
      errorMessage: "Provider connection dropped.",
      completedAt: fixedNow,
    });
    expect(state.runs.find((run) => run.id === ids.runB)).toMatchObject({
      status: "completed",
      confidence: "high",
      completedAt: fixedNow,
    });
  });
});

function createParser(input: {
  provider?: string;
  model?: string;
  parseResult?: {
    rawOutput: string;
    proposal: ReturnType<typeof proposal>;
  };
  parseError?: unknown;
} = {}) {
  return {
    provider: input.provider ?? "test-provider",
    model: input.model ?? "test-model",
    parse: input.parseError
      ? vi.fn().mockRejectedValue(input.parseError)
      : vi.fn().mockResolvedValue(input.parseResult ?? {
          rawOutput: "{\"confidence\":\"medium\"}",
          proposal: proposal(),
        }),
  };
}

function proposal(overrides: Partial<ReturnType<typeof proposalBase>> = {}) {
  return {
    ...proposalBase(),
    ...overrides,
  };
}

function proposalBase() {
  return {
    confidence: "medium" as const,
    warnings: ["Preserve vendor wording."],
    categories: [
      {
        code: "D1",
        name: "Domain 1",
        parentCode: null,
        weightPct: 50,
        weightMinPct: 50,
        weightMaxPct: 50,
        sortOrder: 0,
        evidence: [{ excerpt: "Domain 1 (50%) details", location: "page 1" }],
      },
      {
        code: "D2",
        name: "Domain 2",
        parentCode: null,
        weightPct: 50,
        weightMinPct: 50,
        weightMaxPct: 50,
        sortOrder: 1,
        evidence: [{ excerpt: "Domain 2 (50%) details", location: "page 2" }],
      },
    ],
  };
}

function certificationRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.cert,
    code: "AWS-SAA-C03",
    name: "AWS Architect",
    vendor: "AWS",
    ...overrides,
  };
}

function resourceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.resource,
    certificationId: ids.cert,
    title: "Study guide",
    url: "https://learn.example/guide",
    rawContent: "Skills measured",
    ingestedAt,
    status: "ingested",
    ...overrides,
  };
}

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.runA,
    certificationId: ids.cert,
    resourceId: ids.resource,
    status: "pending",
    provider: "test-provider",
    model: "test-model",
    contentChecksum: "565d6fbcc7ba745d29dee235fb888569c44e3cfac6ea797dbcb003ec27eb0b4a",
    proposalJson: null,
    rawOutput: null,
    confidence: null,
    warningsJson: [],
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: new Date("2026-08-05T09:00:00.000Z"),
    updatedAt: new Date("2026-08-05T09:00:00.000Z"),
    ...overrides,
  };
}

function createBlueprintParseDb(input: {
  certifications?: Array<Record<string, unknown>>;
  resources?: Array<Record<string, unknown>>;
  runs?: Array<Record<string, unknown>>;
  lostClaimRunIds?: string[];
}) {
  const state = {
    certifications: [...(input.certifications ?? [])],
    resources: [...(input.resources ?? [])],
    runs: [...(input.runs ?? [])],
  };
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  let runSequence = 0;
  const lostClaimRunIds = new Set(input.lostClaimRunIds ?? []);

  const db = {
    query: {
      certdrillCertifications: {
        findFirst: vi.fn(async (options?: { where?: unknown }) => firstMatch(state.certifications, options?.where)),
      },
      certdrillLearnResources: {
        findFirst: vi.fn(async (options?: { where?: unknown }) => firstMatch(state.resources, options?.where)),
      },
      certdrillBlueprintParseRuns: {
        findFirst: vi.fn(async (options?: { where?: unknown }) => firstMatch(state.runs, options?.where)),
        findMany: vi.fn(async (options?: { where?: unknown; orderBy?: unknown[]; limit?: number }) =>
          manyMatches(state.runs, options)),
      },
    },
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        returning: vi.fn(async () => {
          runSequence += 1;
          const createdAt = new Date(`2026-08-06T12:00:0${runSequence}.000Z`);
          const row = {
            id: `run-${runSequence}`,
            proposalJson: null,
            rawOutput: null,
            confidence: null,
            warningsJson: [],
            errorMessage: null,
            startedAt: null,
            completedAt: null,
            createdAt,
            updatedAt: createdAt,
            ...values,
          };
          state.runs.push(row);
          return [cloneRow(row)];
        }),
      }),
    }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: vi.fn(async () => {
            const matches = state.runs.filter((row) => rowMatches(row, where));
            if (values.status === "running" && matches[0]?.id && lostClaimRunIds.has(String(matches[0].id))) {
              return [];
            }
            if (matches.length === 0) {
              return [];
            }

            return matches.map((row) => {
              Object.assign(row, values);
              updates.push({ table: "certdrill_blueprint_parse_runs", values });
              return cloneRow(row);
            });
          }),
        }),
      }),
    }),
  };

  return { db, state, updates };
}

function manyMatches(
  rows: Array<Record<string, unknown>>,
  options?: { where?: unknown; orderBy?: unknown[]; limit?: number },
) {
  const matched = rows.filter((row) => rowMatches(row, options?.where));

  if (options?.orderBy?.length) {
    matched.sort((left, right) => {
      for (const clause of options.orderBy ?? []) {
        const details = parseOrderBy(clause);
        if (!details) continue;
        const leftValue = left[details.key];
        const rightValue = right[details.key];
        if (leftValue === rightValue) continue;
        const multiplier = details.direction === "asc" ? 1 : -1;
        return leftValue < rightValue ? -1 * multiplier : 1 * multiplier;
      }

      return 0;
    });
  }

  return matched.slice(0, options?.limit ?? matched.length).map(cloneRow);
}

function firstMatch(rows: Array<Record<string, unknown>>, where?: unknown) {
  const row = rows.find((candidate) => rowMatches(candidate, where));
  return row ? cloneRow(row) : null;
}

function rowMatches(row: Record<string, unknown>, where?: unknown) {
  const comparisons = extractComparisons(where);
  return comparisons.every(({ column, value }) => row[toCamelCase(column)] === value);
}

function extractComparisons(value: unknown): Array<{ column: string; value: unknown }> {
  if (!value || typeof value !== "object") {
    return [];
  }

  const chunks = Array.isArray((value as { queryChunks?: unknown[] }).queryChunks)
    ? (value as { queryChunks: unknown[] }).queryChunks
    : [];
  const comparisons: Array<{ column: string; value: unknown }> = [];

  for (let index = 0; index < chunks.length - 3; index += 1) {
    const column = chunks[index + 1] as { name?: unknown } | undefined;
    const operator = chunks[index + 2] as { value?: unknown[] } | undefined;
    const param = chunks[index + 3] as { value?: unknown; constructor?: { name?: string } } | undefined;

    if (
      typeof column?.name === "string"
      && Array.isArray(operator?.value)
      && operator.value.join("").includes("=")
      && param?.constructor?.name === "Param"
    ) {
      comparisons.push({ column: column.name, value: param.value });
    }
  }

  for (const chunk of chunks) {
    comparisons.push(...extractComparisons(chunk));
  }

  return comparisons;
}

function parseOrderBy(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const chunks = Array.isArray((value as { queryChunks?: unknown[] }).queryChunks)
    ? (value as { queryChunks: unknown[] }).queryChunks
    : [];
  const column = chunks.find((chunk) => chunk && typeof chunk === "object" && typeof (chunk as { name?: unknown }).name === "string") as
    | { name: string }
    | undefined;
  const direction = chunks
    .filter((chunk) => chunk && typeof chunk === "object" && Array.isArray((chunk as { value?: unknown[] }).value))
    .map((chunk) => (chunk as { value: unknown[] }).value.join(""))
    .find((entry) => entry.includes(" asc") || entry.includes(" desc"));

  if (!column || !direction) {
    return null;
  }

  return {
    key: toCamelCase(column.name),
    direction: direction.includes(" asc") ? "asc" : "desc",
  } as const;
}

function toCamelCase(value: string) {
  return value.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase());
}

function cloneRow<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    warningsJson: Array.isArray(row.warningsJson) ? [...row.warningsJson] : row.warningsJson,
    proposalJson: row.proposalJson && typeof row.proposalJson === "object"
      ? structuredClone(row.proposalJson)
      : row.proposalJson,
  } as T;
}

void BlueprintParseServiceError;
