import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";
import { createBlueprintRunPoller } from "@/modules/certdrill/blueprint-analysis";


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
