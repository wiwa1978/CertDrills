import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBlueprintParseRunMock, startBlueprintParseRunMock } = vi.hoisted(() => ({
  getBlueprintParseRunMock: vi.fn(),
  startBlueprintParseRunMock: vi.fn(),
}));

vi.mock("@/lib/api/certdrill.server", () => ({
  getCertDrillAdminBlueprintParseRunServer: getBlueprintParseRunMock,
  startCertDrillAdminBlueprintParseRunServer: startBlueprintParseRunMock,
}));

import { GET } from "@/app/api/certdrill/blueprint-parse-runs/[runId]/route";
import { POST } from "@/app/api/certdrill/blueprint-parse-runs/route";

const certificationId = "11111111-1111-4111-8111-111111111111";
const resourceId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";

const run = {
  id: runId,
  certificationId,
  resourceId,
  status: "pending",
};

describe("blueprint parse run routes", () => {
  beforeEach(() => {
    getBlueprintParseRunMock.mockReset();
    startBlueprintParseRunMock.mockReset();
  });

  it("keeps the route modules server-only", () => {
    const startRouteSource = readFileSync(new URL("../../src/app/api/certdrill/blueprint-parse-runs/route.ts", import.meta.url), "utf8");
    const detailRouteSource = readFileSync(new URL("../../src/app/api/certdrill/blueprint-parse-runs/[runId]/route.ts", import.meta.url), "utf8");

    expect(startRouteSource).not.toContain('"use client"');
    expect(detailRouteSource).not.toContain('"use client"');
  });

  it("starts blueprint parse runs with strict JSON validation and exact delegation", async () => {
    startBlueprintParseRunMock.mockResolvedValueOnce(run);

    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, resourceId }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, data: run });
    expect(startBlueprintParseRunMock).toHaveBeenCalledWith(certificationId, resourceId);
  });

  it("rejects malformed JSON without delegating", async () => {
    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Invalid blueprint analysis request." },
    });
    expect(startBlueprintParseRunMock).not.toHaveBeenCalled();
  });

  it("rejects invalid UUIDs and unknown fields without delegating", async () => {
    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        certificationId: "not-a-uuid",
        resourceId: "also-not-a-uuid",
        extra: true,
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Invalid blueprint analysis request." },
    });
    expect(startBlueprintParseRunMock).not.toHaveBeenCalled();
  });

  it("maps thrown Error instances to a safe 500 envelope", async () => {
    startBlueprintParseRunMock.mockRejectedValueOnce(new Error("Blueprint queue unavailable."));

    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, resourceId }),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Blueprint analysis request failed." },
    });
  });

  it("returns parse run details for valid async route params", async () => {
    getBlueprintParseRunMock.mockResolvedValueOnce(run);

    const response = await GET(
      new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, data: run });
    expect(getBlueprintParseRunMock).toHaveBeenCalledWith(runId);
  });

  it("rejects invalid detail ids without delegating", async () => {
    const response = await GET(
      new Request("http://admin/api/certdrill/blueprint-parse-runs/not-a-uuid"),
      { params: Promise.resolve({ runId: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Invalid blueprint analysis request." },
    });
    expect(getBlueprintParseRunMock).not.toHaveBeenCalled();
  });

  it("does not leak arbitrary helper error objects from detail lookups", async () => {
    getBlueprintParseRunMock.mockRejectedValueOnce({
      message: "Hidden internals",
      stack: "secret stack",
      code: "SECRET",
    });

    const response = await GET(
      new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`),
      { params: Promise.resolve({ runId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: { message: "Blueprint analysis request failed." },
    });
    expect(payload.error).not.toHaveProperty("stack");
    expect(JSON.stringify(payload)).not.toContain("Hidden internals");
  });
});
