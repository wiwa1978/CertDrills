import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBlueprintParseRunMock } = vi.hoisted(() => ({
  getBlueprintParseRunMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/certdrill.server", () => ({
  getCertDrillAdminBlueprintParseRunServer: getBlueprintParseRunMock,
}));

import { GET } from "@/app/api/certdrill/blueprint-parse-runs/[runId]/route";

const runId = "33333333-3333-4333-8333-333333333333";
const run = { id: runId, status: "pending" };

describe("blueprint parse run status route", () => {
  beforeEach(() => getBlueprintParseRunMock.mockReset());

  it("keeps the route module server-only", () => {
    const source = readFileSync(new URL("../../src/app/api/certdrill/blueprint-parse-runs/[runId]/route.ts", import.meta.url), "utf8");
    expect(source).not.toContain('"use client"');
  });

  it("returns parse run details for valid async route params", async () => {
    getBlueprintParseRunMock.mockResolvedValueOnce(run);
    const response = await GET(new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`), {
      params: Promise.resolve({ runId }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: run });
    expect(getBlueprintParseRunMock).toHaveBeenCalledWith(runId);
  });

  it("rejects invalid detail ids without delegating", async () => {
    const response = await GET(new Request("http://admin/api/certdrill/blueprint-parse-runs/not-a-uuid"), {
      params: Promise.resolve({ runId: "not-a-uuid" }),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Invalid blueprint analysis request." },
    });
    expect(getBlueprintParseRunMock).not.toHaveBeenCalled();
  });

  it("propagates bounded Error messages and hides non-Error internals", async () => {
    getBlueprintParseRunMock
      .mockRejectedValueOnce(new Error(` ${"B".repeat(320)} `))
      .mockRejectedValueOnce({ message: "Hidden internals", stack: "secret stack" });

    const request = () => GET(new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`), {
      params: Promise.resolve({ runId }),
    });
    const boundedResponse = await request();
    const hiddenResponse = await request();

    expect(boundedResponse.status).toBe(500);
    await expect(boundedResponse.json()).resolves.toEqual({ success: false, error: { message: "B".repeat(300) } });
    await expect(hiddenResponse.json()).resolves.toEqual({
      success: false,
      error: { message: "Blueprint analysis request failed." },
    });
  });
});
