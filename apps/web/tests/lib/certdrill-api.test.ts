import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/lib/api/client", () => ({
  apiRequest: vi.fn(async (path: string, init?: RequestInit) => ({ path, init })),
  ApiRequestError: class ApiRequestError extends Error {
    status: number;
    errorCode?: string;

    constructor({ status, message, errorCode }: { status: number; message: string; errorCode?: string }) {
      super(message);
      this.name = "ApiRequestError";
      this.status = status;
      this.errorCode = errorCode;
    }
  },
}));

vi.mock("../../src/lib/api/client.server", () => ({
  serverApiRequest: vi.fn(async (path: string) => ({ data: { path } })),
}));

describe("CertDrill browser API helpers", () => {
  it("posts create attempt payloads with mode and confidence fields", async () => {
    const { createCertDrillAttempt } = await import("../../src/lib/api/certdrill");
    const result = await createCertDrillAttempt({
      certificationId: "00000000-0000-0000-0000-000000000001",
      testMode: "practice",
      testVariant: "category_drill",
      categoryIds: ["00000000-0000-0000-0000-000000000002"],
      confidenceEnabled: true,
    });

    expect(result).toEqual({
      path: "/api/certdrill/exams",
      init: expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          certificationId: "00000000-0000-0000-0000-000000000001",
          testMode: "practice",
          testVariant: "category_drill",
          categoryIds: ["00000000-0000-0000-0000-000000000002"],
          confidenceEnabled: true,
        }),
      }),
    });
  });

  it("posts answer payloads to the CertDrill API", async () => {
    const { answerCertDrillQuestion } = await import("../../src/lib/api/certdrill");
    const result = await answerCertDrillQuestion("attempt-1", { questionId: "q1", selectedOptionId: "o1" });
    expect(result).toEqual({ path: "/api/certdrill/exams/attempt-1/answers", init: expect.objectContaining({ method: "POST" }) });
  });

  it("rethrows specific adaptive empty-state API errors for UI display", async () => {
    const { ApiRequestError } = await import("../../src/lib/api/client");
    const { createCertDrillAttempt } = await import("../../src/lib/api/certdrill");
    const { apiRequest } = await import("../../src/lib/api/client");
    vi.mocked(apiRequest).mockRejectedValueOnce(new ApiRequestError({
      status: 400,
      errorCode: "CERTDRILL_NO_WEAK_AREAS",
      message: "API request failed (400): No weak areas are available yet. Complete at least one attempt with answered questions first.",
    }));

    await expect(createCertDrillAttempt({
      certificationId: "00000000-0000-0000-0000-000000000001",
      testMode: "practice",
      testVariant: "weak_areas",
    })).rejects.toMatchObject({
      errorCode: "CERTDRILL_NO_WEAK_AREAS",
      message: "API request failed (400): No weak areas are available yet. Complete at least one attempt with answered questions first.",
    });
  });

  it("gets resumable attempts from the server API", async () => {
    const { getCertDrillAttemptServer } = await import("../../src/lib/api/certdrill.server");
    const result = await getCertDrillAttemptServer("attempt/with spaces");

    expect(result).toEqual({ path: "/api/certdrill/exams/attempt%2Fwith%20spaces" });
  });
});
