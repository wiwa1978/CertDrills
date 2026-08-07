import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CertDrillAdminResource,
  CertDrillBlueprintCategoryProposal,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";
import {
  blueprintAnalysisEligibility,
  blueprintCategoryDepths,
  createBlueprintRunPoller,
  newestBlueprintRunByResource,
} from "@/modules/certdrill/blueprint-analysis";

function createResource(overrides: Partial<CertDrillAdminResource> = {}): CertDrillAdminResource {
  return {
    id: "resource-1",
    certificationId: "cert-1",
    url: "https://example.com/blueprint",
    title: "Blueprint resource",
    sourceType: "study-guide",
    contentMode: "outline_blueprint",
    status: "ingested",
    ...overrides,
  };
}

function createRun(overrides: Partial<CertDrillBlueprintParseRun> = {}): CertDrillBlueprintParseRun {
  return {
    id: "run-1",
    certificationId: "cert-1",
    resourceId: "resource-1",
    status: "pending",
    provider: "azure-ai-foundry",
    model: "gpt-4.1",
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

function createCategory(
  overrides: Partial<CertDrillBlueprintCategoryProposal> = {},
): CertDrillBlueprintCategoryProposal {
  return {
    code: "D1",
    name: "Domain 1",
    parentCode: null,
    weightPct: 50,
    sortOrder: 0,
    evidence: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, resolve, reject };
}

async function flushAsyncWork() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("blueprintAnalysisEligibility", () => {
  it.each([
    ["study-guide"],
    ["exam-blueprint"],
  ] as const)("accepts ingested outline resources for %s sources", (sourceType) => {
    expect(blueprintAnalysisEligibility(createResource({ sourceType }))).toEqual({ eligible: true });
  });

  it("prioritizes the ingest reason before content mode or source checks", () => {
    expect(blueprintAnalysisEligibility(createResource({
      status: "pending",
      contentMode: "deep_content",
      sourceType: "module",
    }))).toEqual({
      eligible: false,
      reason: "Ingest this resource before analysis.",
    });
  });

  it("returns the content mode reason before the source reason", () => {
    expect(blueprintAnalysisEligibility(createResource({
      contentMode: "deep_content",
      sourceType: "module",
    }))).toEqual({
      eligible: false,
      reason: "Use outline blueprint content mode for analysis.",
    });
  });

  it("returns the source reason for unsupported ingested outline resources", () => {
    expect(blueprintAnalysisEligibility(createResource({ sourceType: "doc" }))).toEqual({
      eligible: false,
      reason: "Only study-guide and exam-blueprint resources can be analyzed.",
    });
  });
});

describe("newestBlueprintRunByResource", () => {
  it("keeps the newest createdAt run for each resource", () => {
    const newest = createRun({
      id: "run-newest",
      createdAt: "2026-08-07T12:00:00.000Z",
      updatedAt: "2026-08-07T12:00:00.000Z",
    });
    const selected = newestBlueprintRunByResource([
      createRun({ id: "resource-1-old" }),
      createRun({ id: "resource-2-only", resourceId: "resource-2" }),
      newest,
    ]);

    expect(selected.get("resource-1")).toEqual(newest);
    expect(selected.get("resource-2")?.id).toBe("resource-2-only");
  });

  it("breaks createdAt ties by preferring the later array entry", () => {
    const olderEntry = createRun({ id: "run-b" });
    const laterEntry = createRun({ id: "run-a" });

    expect(newestBlueprintRunByResource([olderEntry, laterEntry]).get("resource-1")).toEqual(laterEntry);
  });
});

describe("blueprintCategoryDepths", () => {
  it("maps normalized category codes to their hierarchy depth", () => {
    const depths = blueprintCategoryDepths([
      createCategory({ code: " d1 " }),
      createCategory({ code: "d1.1", name: "Skill 1", parentCode: " d1 ", weightPct: null, sortOrder: 1 }),
      createCategory({ code: "d1.1.a", name: "Detail", parentCode: "d1.1", weightPct: null, sortOrder: 2 }),
    ]);

    expect(depths.get("D1")).toBe(0);
    expect(depths.get("D1.1")).toBe(1);
    expect(depths.get("D1.1.A")).toBe(2);
  });

  it("falls back to depth 0 when a parent is missing", () => {
    const depths = blueprintCategoryDepths([
      createCategory({ code: "child", parentCode: "missing", weightPct: null }),
    ]);

    expect(depths.get("CHILD")).toBe(0);
  });

  it("terminates safely for cyclic parent chains", () => {
    const depths = blueprintCategoryDepths([
      createCategory({ code: "A", parentCode: "B", weightPct: null }),
      createCategory({ code: "B", parentCode: "A", weightPct: null }),
      createCategory({ code: "SELF", parentCode: "SELF", weightPct: null }),
    ]);

    expect(depths.get("A")).toBe(0);
    expect(depths.get("B")).toBe(0);
    expect(depths.get("SELF")).toBe(0);
  });
});

describe("createBlueprintRunPoller", () => {
  it("fetches immediately on start and waits for each request to settle before scheduling the next one", async () => {
    vi.useFakeTimers();
    const firstRequest = deferred<CertDrillBlueprintParseRun>();
    const secondRequest = deferred<CertDrillBlueprintParseRun>();
    const fetchRun = vi.fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const onRun = vi.fn();
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun,
      onError: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");

    expect(fetchRun).toHaveBeenCalledTimes(1);
    expect(fetchRun).toHaveBeenNthCalledWith(1, "run-1");

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchRun).toHaveBeenCalledTimes(1);

    firstRequest.resolve(createRun({ id: "run-1", status: "pending" }));
    await firstRequest.promise;
    await flushAsyncWork();

    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ id: "run-1", status: "pending" }));

    await vi.advanceTimersByTimeAsync(1_999);
    expect(fetchRun).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(fetchRun).toHaveBeenCalledTimes(2);

    secondRequest.resolve(createRun({ id: "run-1", status: "completed" }));
    await secondRequest.promise;
    await flushAsyncWork();

    expect(onRun).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    ["completed"],
    ["failed"],
  ] as const)("stops polling after a %s run", async (status) => {
    vi.useFakeTimers();
    const fetchRun = vi.fn().mockResolvedValue(createRun({ id: "run-1", status }));
    const onRun = vi.fn();
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun,
      onError: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ status }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reports trimmed transport errors and stops polling", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const fetchRun = vi.fn().mockRejectedValueOnce(new Error("  Status endpoint unavailable.  "));
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun: vi.fn(),
      onError,
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    await flushAsyncWork();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(onError).toHaveBeenCalledWith("Status endpoint unavailable.");
    expect(fetchRun).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("falls back to a safe error message for unknown transport failures", async () => {
    vi.useFakeTimers();
    const onError = vi.fn();
    const fetchRun = vi.fn().mockRejectedValueOnce({ code: "boom" });
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun: vi.fn(),
      onError,
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    await flushAsyncWork();

    expect(onError).toHaveBeenCalledWith("Blueprint analysis status check failed.");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retries the current run immediately and resumes polling only while the run stays pending or running", async () => {
    vi.useFakeTimers();
    const onRun = vi.fn();
    const fetchRun = vi.fn()
      .mockRejectedValueOnce(new Error("Transport"))
      .mockResolvedValueOnce(createRun({ id: "run-1", status: "pending" }))
      .mockResolvedValueOnce(createRun({ id: "run-1", status: "completed" }));
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun,
      onError: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    await flushAsyncWork();

    await poller.retry();
    expect(fetchRun).toHaveBeenCalledTimes(2);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ status: "pending" }));

    await vi.advanceTimersByTimeAsync(2_000);

    expect(fetchRun).toHaveBeenCalledTimes(3);
    expect(onRun).toHaveBeenCalledWith(expect.objectContaining({ status: "completed" }));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancels timers on stop and ignores late request resolutions", async () => {
    vi.useFakeTimers();
    const request = deferred<CertDrillBlueprintParseRun>();
    const onRun = vi.fn();
    const poller = createBlueprintRunPoller({
      fetchRun: vi.fn().mockReturnValueOnce(request.promise),
      onRun,
      onError: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    poller.stop();

    request.resolve(createRun({ id: "run-1", status: "pending" }));
    await request.promise;
    await flushAsyncWork();

    expect(onRun).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out once and ignores any later result", async () => {
    vi.useFakeTimers();
    const request = deferred<CertDrillBlueprintParseRun>();
    const onRun = vi.fn();
    const onTimeout = vi.fn();
    const poller = createBlueprintRunPoller({
      fetchRun: vi.fn().mockReturnValueOnce(request.promise),
      onRun,
      onError: vi.fn(),
      onTimeout,
      intervalMs: 20,
      timeoutMs: 50,
    });

    poller.start("run-1");
    await vi.advanceTimersByTimeAsync(50);

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    request.resolve(createRun({ id: "run-1", status: "pending" }));
    await request.promise;
    await flushAsyncWork();

    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onRun).not.toHaveBeenCalled();
  });

  it.each([
    ["same", "run-1"],
    ["different", "run-2"],
  ] as const)("resets its generation cleanly when start is called again for the %s run", async (_label, nextRunId) => {
    vi.useFakeTimers();
    const firstRequest = deferred<CertDrillBlueprintParseRun>();
    const secondRequest = deferred<CertDrillBlueprintParseRun>();
    const fetchRun = vi.fn()
      .mockReturnValueOnce(firstRequest.promise)
      .mockReturnValueOnce(secondRequest.promise);
    const onRun = vi.fn();
    const poller = createBlueprintRunPoller({
      fetchRun,
      onRun,
      onError: vi.fn(),
      onTimeout: vi.fn(),
      intervalMs: 2_000,
      timeoutMs: 10_000,
    });

    poller.start("run-1");
    poller.start(nextRunId);

    firstRequest.resolve(createRun({ id: "run-1", status: "pending" }));
    await firstRequest.promise;
    await flushAsyncWork();

    secondRequest.resolve(createRun({ id: nextRunId, status: "completed" }));
    await secondRequest.promise;
    await flushAsyncWork();

    expect(fetchRun).toHaveBeenNthCalledWith(1, "run-1");
    expect(fetchRun).toHaveBeenNthCalledWith(2, nextRunId);
    expect(onRun).toHaveBeenCalledTimes(1);
    expect(onRun).toHaveBeenLastCalledWith(expect.objectContaining({ id: nextRunId, status: "completed" }));
    expect(vi.getTimerCount()).toBe(0);
  });
});
