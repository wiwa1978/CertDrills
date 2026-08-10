import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertDrillScenarioGenerationJob } from "@/lib/api/certdrill.server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/admin/certdrill/11111111-1111-4111-8111-111111111111",
  useSearchParams: () => new URLSearchParams(),
}));

import { ScenarioGenerationControl, ScenarioGenerationStatusBanner } from "@/modules/certdrill/scenario-generation-control";
import { getScenarioGenerationJob, startScenarioGeneration } from "@/modules/certdrill/scenario-generation-client";

const certificationId = "11111111-1111-4111-8111-111111111111";
const resourceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";

function job(overrides: Partial<CertDrillScenarioGenerationJob> = {}): CertDrillScenarioGenerationJob {
  return {
    id: jobId,
    certificationId,
    resourceIds: [resourceId],
    requestedCount: 2,
    difficulty: "medium",
    focus: "Identity",
    instructions: null,
    provider: "azure-ai-foundry",
    modelUsed: "gpt-5.5",
    status: "pending",
    generatedCount: null,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    createdAt: "2026-08-09T12:00:00.000Z",
    updatedAt: "2026-08-09T12:00:00.000Z",
    ...overrides,
  };
}

const input = {
  resourceIds: [resourceId],
  sourceUrls: ["https://docs.example.com/guide"],
  requestedCount: 2,
  difficulty: "medium" as const,
  focus: "Identity",
  instructions: null,
};

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ScenarioGenerationControl", () => {
  it("keeps manual creation and adds review-first autonomous generation", () => {
    const markup = renderToStaticMarkup(createElement(ScenarioGenerationControl, { certificationId, resources: [] }));
    const source = readFileSync(new URL("../../../src/modules/certdrill/scenario-generation-control.tsx", import.meta.url), "utf8");

    expect(markup).toContain(`aria-controls="scenario-${certificationId}-generation-dialog"`);
    expect(markup).toContain("Generate Scenarios with AI");
    expect(source).toContain("Previously added sources");
    expect(source).toContain("New source URLs");
    expect(source).toContain("saved as Drafts for your review and validation");
    expect(source).toContain("setOpen(false)");
    expect(source).toContain("onJobStarted?.(job)");
    expect(source).toContain('next.set("scenarioGenerationJob", job.id)');
    expect(source).toContain('next.set("scenariosGenerated"');
  });

  it("shows generation progress outside the modal until completion", () => {
    const pending = renderToStaticMarkup(createElement(ScenarioGenerationStatusBanner, { initialJob: job() }));
    const completed = renderToStaticMarkup(createElement(ScenarioGenerationStatusBanner, { initialJob: job({ status: "completed", generatedCount: 2 }) }));
    expect(pending).toContain("Using AI to generate scenarios");
    expect(pending).toContain("appear here as Drafts");
    expect(completed).not.toContain("Using AI to generate scenarios");
  });
});

describe("scenario generation client", () => {
  it("starts generation and reads job status", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: job() }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: job({ status: "running" }) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startScenarioGeneration(certificationId, input)).resolves.toMatchObject({ status: "pending" });
    await expect(getScenarioGenerationJob(jobId)).resolves.toMatchObject({ status: "running" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/certdrill/scenario-generation-jobs", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ certificationId, ...input }),
    });
  });
});
