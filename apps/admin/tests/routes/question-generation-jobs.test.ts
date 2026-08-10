import { beforeEach, describe, expect, it, vi } from "vitest";

const { startMock, getMock } = vi.hoisted(() => ({ startMock: vi.fn(), getMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api/certdrill.server", () => ({
  startCertDrillAdminQuestionGenerationServer: startMock,
  getCertDrillAdminQuestionGenerationJobServer: getMock,
}));

import { POST } from "@/app/api/certdrill/question-generation-jobs/route";
import { GET } from "@/app/api/certdrill/question-generation-jobs/[jobId]/route";

const certificationId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const resourceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";
const payload = {
  certificationId,
  categoryId: null,
  resourceIds: [resourceId],
  sourceUrls: ["https://docs.example.com/guide"],
  requestedCount: 5,
  focus: "Identity",
  systemInstructions: "Use detailed answer choices.",
  instructions: null,
  questionTypes: ["single_choice", "fill_blank", "matching"],
  difficultyMix: { easy: 20, medium: 60, hard: 20 },
  deliveryPurpose: "assessment",
};

beforeEach(() => {
  startMock.mockReset();
  getMock.mockReset();
});

describe("question generation BFF routes", () => {
  it("forwards strict generation input and job status", async () => {
    const pending = { id: jobId, status: "pending" };
    startMock.mockResolvedValueOnce(pending);
    getMock.mockResolvedValueOnce(pending);

    const startResponse = await POST(new Request("http://admin/api/certdrill/question-generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));
    const statusResponse = await GET(new Request(`http://admin/api/certdrill/question-generation-jobs/${jobId}`), {
      params: Promise.resolve({ jobId }),
    });

    expect(startResponse.status).toBe(201);
    expect(statusResponse.status).toBe(200);
    expect(startMock).toHaveBeenCalledWith(certificationId, {
      categoryId: null,
      resourceIds: [resourceId],
      sourceUrls: ["https://docs.example.com/guide"],
      requestedCount: 5,
      focus: "Identity",
      systemInstructions: "Use detailed answer choices.",
      instructions: null,
      questionTypes: ["single_choice", "fill_blank", "matching"],
      difficultyMix: { easy: 20, medium: 60, hard: 20 },
      deliveryPurpose: "assessment",
    });
    expect(getMock).toHaveBeenCalledWith(jobId);
  });

  it("rejects missing sources, invalid difficulty totals, and malformed ids", async () => {
    const noSources = await POST(new Request("http://admin/api/certdrill/question-generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, resourceIds: [], sourceUrls: [] }),
    }));
    const badMix = await POST(new Request("http://admin/api/certdrill/question-generation-jobs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, difficultyMix: { easy: 50, medium: 60, hard: 20 } }),
    }));
    const invalidStatus = await GET(new Request("http://admin/api/certdrill/question-generation-jobs/invalid"), {
      params: Promise.resolve({ jobId: "invalid" }),
    });

    expect(noSources.status).toBe(400);
    expect(badMix.status).toBe(400);
    expect(invalidStatus.status).toBe(400);
    expect(startMock).not.toHaveBeenCalled();
    expect(getMock).not.toHaveBeenCalled();
  });
});
