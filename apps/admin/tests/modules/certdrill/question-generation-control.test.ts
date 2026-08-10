import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertDrillQuestionGenerationJob } from "@/lib/api/certdrill.server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/en/admin/certdrill/11111111-1111-4111-8111-111111111111",
  useSearchParams: () => new URLSearchParams(),
}));

import { QuestionGenerationControl, QuestionGenerationStatusBanner } from "@/modules/certdrill/question-generation-control";
import { getQuestionGenerationJob, startQuestionGeneration } from "@/modules/certdrill/question-generation-client";

const certificationId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";
const resourceId = "33333333-3333-4333-8333-333333333333";
const jobId = "44444444-4444-4444-8444-444444444444";

function job(overrides: Partial<CertDrillQuestionGenerationJob> = {}): CertDrillQuestionGenerationJob {
  return {
    id: jobId,
    certificationId,
    categoryId,
    resourceIds: [resourceId],
    requestedCount: 5,
    provider: "azure-ai-foundry",
    status: "pending",
    modelUsed: "gpt-5.5",
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
  categoryId,
  resourceIds: [resourceId],
  sourceUrls: ["https://docs.example.com/guide"],
  requestedCount: 5,
  focus: "Identity",
  systemInstructions: "Use detailed answer choices.",
  instructions: null,
  questionTypes: ["single_choice", "fill_blank", "matching"] as Array<"single_choice" | "fill_blank" | "matching">,
  difficultyMix: { easy: 20, medium: 60, hard: 20 },
  deliveryPurpose: "practice" as const,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("QuestionGenerationControl", () => {
  it("places grounded generation on the Questions workflow with review-first settings", () => {
    const markup = renderToStaticMarkup(createElement(QuestionGenerationControl, {
      certificationId,
      categories: [{ id: categoryId, certificationId, code: "D1", name: "Identity" }],
      resources: [],
      defaultCategoryId: categoryId,
    }));
    const source = readFileSync(new URL("../../../src/modules/certdrill/question-generation-control.tsx", import.meta.url), "utf8");

    expect(markup).toContain("Generate Questions with AI");
    expect(source).toContain("Previously added sources");
    expect(source).toContain("New source URLs");
    expect(source).toContain("Difficulty distribution");
    expect(source).toContain("All categories — AI assigns each question");
    expect(source).toContain("Question type");
    expect(source).toContain("System prompt instructions");
    expect(source).toContain("User prompt instructions");
    expect(source).toContain("Core grounding, citation, correctness, and output-format rules remain enforced.");
    expect(source).toContain("Drag and drop matching");
    expect(source).toContain("Fill in the gap");
    expect(source).toContain('<option value="practice">Practice</option>');
    expect(source).toContain('<option value="assessment">Assessment</option>');
    expect(source).toContain("saved as drafts for review and publishing");
    expect(source).toContain('next.set("questionStatus", "draft")');
    expect(source).toContain('next.set("questionCategoryId"');
    expect(source).toContain("setOpen(false)");
    expect(source).toContain('next.set("generationJob", nextJob.id)');
  });

  it("shows generation progress outside the dialog until the job completes", () => {
    const pendingMarkup = renderToStaticMarkup(createElement(QuestionGenerationStatusBanner, { initialJob: job() }));
    const completedMarkup = renderToStaticMarkup(createElement(QuestionGenerationStatusBanner, { initialJob: job({ status: "completed", generatedCount: 5 }) }));

    expect(pendingMarkup).toContain("Using AI to generate questions");
    expect(pendingMarkup).toContain("will appear here as drafts");
    expect(completedMarkup).not.toContain("Using AI to generate questions");
  });
});

describe("question generation client", () => {
  it("starts generation and reads job status", async () => {
    const pending = job();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: pending }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: job({ status: "running" }) }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startQuestionGeneration(certificationId, input)).resolves.toEqual(pending);
    await expect(getQuestionGenerationJob(jobId)).resolves.toMatchObject({ status: "running" });
    expect(fetchMock).toHaveBeenNthCalledWith(1, "/api/certdrill/question-generation-jobs", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ certificationId, ...input }),
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, `/api/certdrill/question-generation-jobs/${jobId}`, {
      headers: { accept: "application/json" },
      credentials: "same-origin",
    });
  });

  it("surfaces bounded API errors and rejects malformed successful envelopes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { message: "Source ingestion failed." } }), { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { id: "invalid" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startQuestionGeneration(certificationId, input)).rejects.toThrow("Source ingestion failed.");
    await expect(getQuestionGenerationJob(jobId)).rejects.toThrow("response was invalid");
  });
});
