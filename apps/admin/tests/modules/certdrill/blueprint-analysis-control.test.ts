import { existsSync, readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
  CertDrillAdminResource,
  CertDrillBlueprintCategoryProposal,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";

type BlueprintCategoryWithOptionalRange = CertDrillBlueprintCategoryProposal & {
  weightMinPct?: number | null;
  weightMaxPct?: number | null;
};

const controlPath = new URL("../../../src/modules/certdrill/blueprint-analysis-control.tsx", import.meta.url);
const clientPath = new URL("../../../src/modules/certdrill/blueprint-analysis-client.ts", import.meta.url);

function readSourceIfPresent(path: URL) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function createResource(overrides: Partial<CertDrillAdminResource> = {}): CertDrillAdminResource {
  return {
    id: "resource-1",
    certificationId: "11111111-1111-4111-8111-111111111111",
    categoryId: null,
    url: "https://example.com/blueprint",
    title: "Contoso blueprint",
    sourceType: "study-guide",
    contentMode: "outline_blueprint",
    status: "ingested",
    rawContent: null,
    ...overrides,
  };
}

function createRun(overrides: Partial<CertDrillBlueprintParseRun> = {}): CertDrillBlueprintParseRun {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    certificationId: "11111111-1111-4111-8111-111111111111",
    resourceId: "resource-1",
    status: "completed",
    provider: "azure-ai-foundry",
    model: "gpt-4.1",
    contentChecksum: "checksum-1",
    proposalJson: {
      confidence: "high",
      warnings: ["Weight totals need a manual review."],
      categories: [],
    },
    confidence: "high",
    warningsJson: ["Weight totals need a manual review."],
    errorMessage: null,
    startedAt: "2026-08-07T10:01:00.000Z",
    completedAt: "2026-08-07T10:02:00.000Z",
    createdAt: "2026-08-07T10:00:00.000Z",
    updatedAt: "2026-08-07T10:02:00.000Z",
    ...overrides,
  };
}

function createCategory(
  overrides: Partial<BlueprintCategoryWithOptionalRange> = {},
): BlueprintCategoryWithOptionalRange {
  return {
    code: "A",
    name: "Category",
    parentCode: null,
    weightPct: 50,
    sortOrder: 0,
    evidence: [],
    ...overrides,
  };
}

async function loadControlModule() {
  return existsSync(controlPath)
    ? import("@/modules/certdrill/blueprint-analysis-control")
    : null;
}

async function loadClientModule() {
  return existsSync(clientPath)
    ? import("@/modules/certdrill/blueprint-analysis-client")
    : null;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Blueprint analysis control", () => {
  it("keeps the control wired as a client dialog with poller cleanup affordances", () => {
    const controlSource = readSourceIfPresent(controlPath);

    expect(controlSource).toContain('"use client"');
    expect(controlSource).toContain("createBlueprintRunPoller");
    expect(controlSource).toContain("startBlueprintAnalysis");
    expect(controlSource).toContain("getBlueprintAnalysisRun");
    expect(controlSource).toContain("onOpenChange={handleDialogOpenChange}");
    expect(controlSource).toContain('aria-live="polite"');
    expect(controlSource).toContain("Analyze again");
    expect(controlSource).toContain("Retry status check");
    expect(controlSource).toContain("pollerRef.current?.stop()");
    expect(controlSource).toContain("mountedRef.current = false");
    expect(controlSource).toContain("pendingStartRequestIdRef.current !== null");
  });

  it("resets mountedRef in a StrictMode-safe lifecycle effect", () => {
    const controlSource = readSourceIfPresent(controlPath);

    expect(controlSource).toMatch(
      /useEffect\(\(\) => {\s*mountedRef\.current = true;\s*return \(\) => {\s*mountedRef\.current = false;\s*dialogGenerationRef\.current \+= 1;\s*pollerRef\.current\?\.stop\(\);\s*};\s*}, \[\]\);/,
    );
  });

  it("renders completed analysis details as a read-only ordered proposal", async () => {
    const controlModule = await loadControlModule();
    expect(controlModule).not.toBeNull();

    const { BlueprintAnalysisDetails } = controlModule!;
    const run = createRun({
      proposalJson: {
        confidence: "medium",
        warnings: ["Keep the inherited weight under review."],
        categories: [
          createCategory({
            code: "B",
            name: "Second domain",
            parentCode: null,
            weightPct: null,
            weightMinPct: 20,
            weightMaxPct: 25,
            sortOrder: 1,
            evidence: [
              { excerpt: "Second-domain evidence", location: "Appendix B" },
            ],
          }),
          createCategory({
            code: "A.1",
            name: "Nested skill",
            parentCode: "A",
            weightPct: 20,
            weightMinPct: 20,
            weightMaxPct: 20,
            sortOrder: 2,
            evidence: [{ excerpt: "Nested evidence", location: null }],
          }),
          createCategory({
            code: "A",
            name: "Top level domain",
            parentCode: null,
            weightPct: 15,
            sortOrder: 0,
            evidence: [{ excerpt: "Top-level evidence", location: "Overview section" }],
          }),
          createCategory({
            code: "C",
            name: "Unspecified domain",
            parentCode: null,
            weightPct: null,
            weightMinPct: null,
            weightMaxPct: null,
            sortOrder: 3,
            evidence: [{ excerpt: "Missing weight evidence", location: "Appendix C" }],
          }),
        ],
      },
      confidence: "medium",
    });

    const markup = renderToStaticMarkup(createElement(BlueprintAnalysisDetails, {
      resource: createResource(),
      run,
      requestState: "idle",
      requestError: null,
      pollError: "Status endpoint unavailable.",
      pollTimedOut: true,
      onAnalyzeAgain: () => undefined,
      analyzeAgainDisabled: false,
      onRetryStatusCheck: () => undefined,
      retryStatusCheckDisabled: false,
    }));

    expect(markup).toContain("Contoso blueprint");
    expect(markup).toContain("Completed");
    expect(markup).toContain("azure-ai-foundry");
    expect(markup).toContain("gpt-4.1");
    expect(markup).toContain("2026-08-07T10:00:00.000Z");
    expect(markup).toContain("2026-08-07T10:01:00.000Z");
    expect(markup).toContain("2026-08-07T10:02:00.000Z");
    expect(markup).toContain('<dt class="text-sm font-medium">Confidence</dt>');
    expect(markup).toContain('<dd class="text-sm text-muted-foreground"><span data-slot="badge"');
    expect(markup).toContain(">Medium</span></dd>");
    expect(markup).toContain("Keep the inherited weight under review.");
    expect(markup).toContain("<table");
    expect(markup).toContain('scope="col">Code</th>');
    expect(markup).toContain('scope="col">Name</th>');
    expect(markup).toContain('scope="col">Parent</th>');
    expect(markup).toContain('scope="col">Weight</th>');
    expect(markup).toContain('scope="col">Evidence</th>');
    expect(markup.indexOf('scope="col">Code</th>')).toBeLessThan(markup.indexOf('scope="col">Name</th>'));
    expect(markup.indexOf('scope="col">Name</th>')).toBeLessThan(markup.indexOf('scope="col">Parent</th>'));
    expect(markup.indexOf('scope="col">Parent</th>')).toBeLessThan(markup.indexOf('scope="col">Weight</th>'));
    expect(markup.indexOf('scope="col">Weight</th>')).toBeLessThan(markup.indexOf('scope="col">Evidence</th>'));
    expect(markup).toContain(">B</td>");
    expect(markup).toContain(">A.1</td>");
    expect(markup).toContain(">A</td>");
    expect(markup).toContain(">C</td>");
    expect(markup).toContain("Second domain");
    expect(markup).toContain("Top level");
    expect(markup).toContain("20–25%");
    expect(markup).toContain(">20%</td>");
    expect(markup).toContain(">15%</td>");
    expect(markup).toContain("Not provided");
    expect(markup).toContain("Second-domain evidence");
    expect(markup).toContain("Appendix B");
    expect(markup).toContain("Top-level evidence");
    expect(markup).toContain("Overview section");
    expect(markup).toContain("Nested evidence");
    expect(markup).toContain("Location not provided.");
    expect(markup).toContain("Status endpoint unavailable.");
    expect(markup).toContain("Status check timed out.");
    expect(markup).toContain("Analyze again");
    expect(markup).toContain("Retry status check");
    expect(markup).toContain("style=\"padding-left:16px\"");
    expect(markup.indexOf(">B</td>")).toBeLessThan(markup.indexOf(">A.1</td>"));
    expect(markup.indexOf(">A.1</td>")).toBeLessThan(markup.indexOf(">A</td>"));
    expect(markup.indexOf(">A</td>")).toBeLessThan(markup.indexOf(">C</td>"));
    expect(markup).not.toContain(">Save<");
    expect(markup).not.toContain(">Import<");
  });

  it("formats blueprint weights for range, exact, legacy exact, and missing values", async () => {
    const controlModule = await loadControlModule();
    expect(controlModule).not.toBeNull();

    const formatBlueprintWeight = (controlModule! as Record<string, unknown>).formatBlueprintWeight;
    expect(typeof formatBlueprintWeight).toBe("function");

    const formatter = formatBlueprintWeight as (category: {
      weightPct: number | null;
      weightMinPct?: number | null;
      weightMaxPct?: number | null;
    }) => string;

    expect(formatter({
      weightPct: null,
      weightMinPct: 20,
      weightMaxPct: 25,
    })).toBe("20–25%");
    expect(formatter({
      weightPct: 20,
      weightMinPct: 20,
      weightMaxPct: 20,
    })).toBe("20%");
    expect(formatter({
      weightPct: 15,
    })).toBe("15%");
    expect(formatter({
      weightPct: null,
      weightMinPct: null,
      weightMaxPct: null,
    })).toBe("Not provided");
  });

  it("omits confidence details for non-completed runs", async () => {
    const controlModule = await loadControlModule();
    expect(controlModule).not.toBeNull();

    const { BlueprintAnalysisDetails } = controlModule!;
    const markup = renderToStaticMarkup(createElement(BlueprintAnalysisDetails, {
      resource: createResource(),
      run: createRun({
        status: "running",
        proposalJson: {
          confidence: "medium",
          warnings: ["Still processing"],
          categories: [
            createCategory({
              code: "A",
              name: "Should stay hidden",
              evidence: [{ excerpt: "Hidden evidence", location: "Section 1" }],
            }),
          ],
        },
        confidence: "medium",
        warningsJson: ["Still processing"],
        completedAt: null,
      }),
      requestState: "idle",
      requestError: null,
      pollError: null,
      pollTimedOut: false,
    }));

    expect(markup).toContain("Analyzing");
    expect(markup).not.toContain(">Confidence<");
    expect(markup).not.toContain(">Medium<");
    expect(markup).not.toContain("Proposed categories");
    expect(markup).not.toContain("Should stay hidden");
  });

  it("renders resource-titled actions and the exact eligibility reason", async () => {
    const controlModule = await loadControlModule();
    expect(controlModule).not.toBeNull();

    const { BlueprintAnalysisControl } = controlModule!;
    const disabledMarkup = renderToStaticMarkup(createElement(BlueprintAnalysisControl, {
      certificationId: "11111111-1111-4111-8111-111111111111",
      resource: createResource({ status: "pending" }),
    }));
    const runMarkup = renderToStaticMarkup(createElement(BlueprintAnalysisControl, {
      certificationId: "11111111-1111-4111-8111-111111111111",
      resource: createResource(),
      initialRun: createRun({ status: "running" }),
    }));

    expect(disabledMarkup).toContain("Analyze");
    expect(disabledMarkup).toContain('aria-label="Analyze Contoso blueprint"');
    expect(disabledMarkup).toContain("Ingest this resource before analysis.");
    expect(disabledMarkup).toContain("aria-describedby");
    expect(runMarkup).toContain("View analysis");
    expect(runMarkup).toContain('aria-label="View analysis for Contoso blueprint"');
  });
});

describe("blueprint analysis client helpers", () => {
  it("starts blueprint analysis with a strict same-origin JSON request", async () => {
    const clientModule = await loadClientModule();
    expect(clientModule).not.toBeNull();

    const { startBlueprintAnalysis } = clientModule!;
    const run = createRun({ status: "pending", proposalJson: null, confidence: null, warningsJson: [] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: run,
    }), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startBlueprintAnalysis(
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    )).resolves.toEqual(run);

    expect(fetchMock).toHaveBeenCalledWith("/api/certdrill/blueprint-parse-runs", {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify({
        certificationId: "11111111-1111-4111-8111-111111111111",
        resourceId: "33333333-3333-4333-8333-333333333333",
      }),
    });
  });

  it("loads an existing run with same-origin credentials", async () => {
    const clientModule = await loadClientModule();
    expect(clientModule).not.toBeNull();

    const { getBlueprintAnalysisRun } = clientModule!;
    const run = createRun({ status: "running", proposalJson: null, confidence: null, warningsJson: [] });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      success: true,
      data: run,
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBlueprintAnalysisRun(run.id)).resolves.toEqual(run);

    expect(fetchMock).toHaveBeenCalledWith(`/api/certdrill/blueprint-parse-runs/${run.id}`, {
      credentials: "same-origin",
      headers: {
        accept: "application/json",
      },
    });
  });

  it("surfaces trimmed envelope errors and falls back safely for malformed responses", async () => {
    const clientModule = await loadClientModule();
    expect(clientModule).not.toBeNull();

    const { getBlueprintAnalysisRun, startBlueprintAnalysis } = clientModule!;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: false,
        error: { message: "  Queue unavailable.  " },
      }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        success: true,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }))
      .mockResolvedValueOnce(new Response("not-json", {
        status: 502,
        headers: { "content-type": "text/plain" },
      }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startBlueprintAnalysis(
      "11111111-1111-4111-8111-111111111111",
      "33333333-3333-4333-8333-333333333333",
    )).rejects.toThrow("Queue unavailable.");
    await expect(getBlueprintAnalysisRun("22222222-2222-4222-8222-222222222222")).rejects.toThrow(
      "Blueprint analysis response was invalid.",
    );
    await expect(getBlueprintAnalysisRun("44444444-4444-4444-8444-444444444444")).rejects.toThrow(
      "Blueprint analysis status check failed.",
    );
  });
});
