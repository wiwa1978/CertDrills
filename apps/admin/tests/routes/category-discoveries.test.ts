import { beforeEach, describe, expect, it, vi } from "vitest";

const { startCategoryDiscoveryMock } = vi.hoisted(() => ({
  startCategoryDiscoveryMock: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/certdrill.server", () => ({
  startCertDrillAdminCategoryDiscoveryServer: startCategoryDiscoveryMock,
}));

import { POST } from "@/app/api/certdrill/category-discoveries/route";

const certificationId = "11111111-1111-4111-8111-111111111111";
const studyGuideUrl = "https://learn.example.com/study-guide";
const run = { id: "33333333-3333-4333-8333-333333333333", status: "pending" };

describe("category discovery route", () => {
  beforeEach(() => startCategoryDiscoveryMock.mockReset());

  it("starts discovery with strict URL input", async () => {
    startCategoryDiscoveryMock.mockResolvedValueOnce(run);
    const response = await POST(new Request("http://admin/api/certdrill/category-discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, url: studyGuideUrl }),
    }));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ success: true, data: run });
    expect(startCategoryDiscoveryMock).toHaveBeenCalledWith(certificationId, studyGuideUrl);
  });

  it("rejects malformed JSON, invalid URLs, UUIDs, and unknown fields", async () => {
    const malformed = await POST(new Request("http://admin/api/certdrill/category-discoveries", {
      method: "POST",
      body: "{",
    }));
    const invalid = await POST(new Request("http://admin/api/certdrill/category-discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId: "invalid", url: "invalid", extra: true }),
    }));

    expect(malformed.status).toBe(400);
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      success: false,
      error: { message: "Invalid blueprint analysis request." },
    });
    expect(startCategoryDiscoveryMock).not.toHaveBeenCalled();
  });

  it("propagates trimmed helper errors", async () => {
    startCategoryDiscoveryMock.mockRejectedValueOnce(new Error("  Study guide fetch failed.  "));
    const response = await POST(new Request("http://admin/api/certdrill/category-discoveries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ certificationId, url: studyGuideUrl }),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: { message: "Study guide fetch failed." },
    });
  });
});
