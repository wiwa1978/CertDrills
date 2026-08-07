import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getBlueprintParseRunMock, startBlueprintParseRunMock } = vi.hoisted(() => ({
  getBlueprintParseRunMock: vi.fn(),
  startBlueprintParseRunMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
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

  it("extracts shared route responses into a server-only module", () => {
    const responsesPath = new URL("../../src/app/api/certdrill/blueprint-parse-runs/responses.ts", import.meta.url);
    const startRouteSource = readFileSync(new URL("../../src/app/api/certdrill/blueprint-parse-runs/route.ts", import.meta.url), "utf8");
    const detailRouteSource = readFileSync(new URL("../../src/app/api/certdrill/blueprint-parse-runs/[runId]/route.ts", import.meta.url), "utf8");

    expect(existsSync(responsesPath)).toBe(true);

    const responsesSource = readFileSync(responsesPath, "utf8");
    expect(responsesSource).toContain('import "server-only"');
    expect(startRouteSource).toContain('from "./responses"');
    expect(detailRouteSource).toContain('from "../responses"');
    expect(startRouteSource).not.toContain("Invalid blueprint analysis request.");
    expect(detailRouteSource).not.toContain("Invalid blueprint analysis request.");
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

  it("propagates trimmed Error messages from start route failures", async () => {
    startBlueprintParseRunMock.mockRejectedValueOnce(new Error("  Blueprint queue unavailable.  "));

    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, resourceId }),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Blueprint queue unavailable." },
    });
  });

  it("bounds propagated start route Error messages to 300 characters", async () => {
    const longMessage = ` ${"A".repeat(320)} `;
    startBlueprintParseRunMock.mockRejectedValueOnce(new Error(longMessage));

    const response = await POST(new Request("http://admin/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, resourceId }),
    }));
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: { message: "A".repeat(300) },
    });
    expect(payload.error.message).toHaveLength(300);
  });

  it("falls back to the generic message for empty Error messages", async () => {
    startBlueprintParseRunMock.mockRejectedValueOnce(new Error("   "));

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

  it("propagates trimmed Error messages from detail route failures", async () => {
    getBlueprintParseRunMock.mockRejectedValueOnce(new Error("  Blueprint parse run missing.  "));

    const response = await GET(
      new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`),
      { params: Promise.resolve({ runId }) },
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Blueprint parse run missing." },
    });
  });

  it("bounds propagated detail route Error messages to 300 characters", async () => {
    const longMessage = ` ${"B".repeat(320)} `;
    getBlueprintParseRunMock.mockRejectedValueOnce(new Error(longMessage));

    const response = await GET(
      new Request(`http://admin/api/certdrill/blueprint-parse-runs/${runId}`),
      { params: Promise.resolve({ runId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(payload).toEqual({
      success: false,
      error: { message: "B".repeat(300) },
    });
    expect(payload.error.message).toHaveLength(300);
  });

  it("falls back to the generic message for non-Error detail failures", async () => {
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
