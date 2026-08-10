import { beforeEach, describe, expect, it, vi } from "vitest";

const { startMock, getMock } = vi.hoisted(() => ({ startMock: vi.fn(), getMock: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/certdrill.server", () => ({
  startCertDrillAdminScenarioGenerationServer: startMock,
  getCertDrillAdminScenarioGenerationJobServer: getMock,
}));

import { POST } from "@/app/api/certdrill/scenario-generation-jobs/route";
import { GET } from "@/app/api/certdrill/scenario-generation-jobs/[jobId]/route";

const certificationId = "11111111-1111-4111-8111-111111111111";
const resourceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const payload = {
  certificationId,
  resourceIds: [resourceId],
  sourceUrls: ["https://docs.example.com/guide"],
  requestedCount: 2,
  difficulty: "hard",
  focus: "Identity incident",
  instructions: null,
};

beforeEach(() => { startMock.mockReset(); getMock.mockReset(); });

describe("scenario generation BFF routes", () => {
  it("forwards strict generation input and job status", async () => {
    const pending = { id: jobId, status: "pending" };
    startMock.mockResolvedValueOnce(pending);
    getMock.mockResolvedValueOnce(pending);
    const startResponse = await POST(new Request("http://admin/api/certdrill/scenario-generation-jobs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
    }));
    const statusResponse = await GET(new Request(`http://admin/api/certdrill/scenario-generation-jobs/${jobId}`), { params: Promise.resolve({ jobId }) });

    expect(startResponse.status).toBe(201);
    expect(statusResponse.status).toBe(200);
    expect(startMock).toHaveBeenCalledWith(certificationId, {
      resourceIds: [resourceId], sourceUrls: ["https://docs.example.com/guide"], requestedCount: 2,
      difficulty: "hard", focus: "Identity incident", instructions: null,
    });
    expect(getMock).toHaveBeenCalledWith(jobId);
  });

  it("rejects missing sources, excessive counts, and malformed ids", async () => {
    const noSources = await POST(new Request("http://admin/api/certdrill/scenario-generation-jobs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, resourceIds: [], sourceUrls: [] }),
    }));
    const tooMany = await POST(new Request("http://admin/api/certdrill/scenario-generation-jobs", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...payload, requestedCount: 11 }),
    }));
    const invalidStatus = await GET(new Request("http://admin/api/certdrill/scenario-generation-jobs/invalid"), { params: Promise.resolve({ jobId: "invalid" }) });

    expect(noSources.status).toBe(400);
    expect(tooMany.status).toBe(400);
    expect(invalidStatus.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });
});
