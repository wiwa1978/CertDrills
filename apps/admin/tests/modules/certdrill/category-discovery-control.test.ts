import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import {
  CategoryDiscoveryControl,
  CategoryDiscoveryDetails,
  formatBlueprintWeight,
} from "@/modules/certdrill/category-discovery-control";
import {
  getBlueprintAnalysisRun,
  startCategoryDiscovery,
} from "@/modules/certdrill/category-discovery-client";

const certificationId = "11111111-1111-4111-8111-111111111111";
const runId = "22222222-2222-4222-8222-222222222222";

function createRun(overrides: Partial<CertDrillBlueprintParseRun> = {}): CertDrillBlueprintParseRun {
  return {
    id: runId,
    certificationId,
    resourceId: "33333333-3333-4333-8333-333333333333",
    status: "completed",
    provider: "azure-ai-foundry",
    model: "gpt-5.5",
    contentChecksum: "checksum",
    proposalJson: {
      confidence: "high",
      warnings: ["Review the percentage range."],
      categories: [
        {
          code: "D1",
          name: "Design identity",
          parentCode: null,
          weightPct: null,
          weightMinPct: 20,
          weightMaxPct: 25,
          sortOrder: 0,
          evidence: [],
        },
      ],
    },
    confidence: "high",
    warningsJson: ["Review the percentage range."],
    errorMessage: null,
    startedAt: "2026-08-09T10:00:00.000Z",
    completedAt: "2026-08-09T10:01:00.000Z",
    createdAt: "2026-08-09T09:59:00.000Z",
    updatedAt: "2026-08-09T10:01:00.000Z",
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CategoryDiscoveryControl", () => {
  it("renders the category action and a study-guide URL modal", () => {
    const markup = renderToStaticMarkup(createElement(CategoryDiscoveryControl, {
      certificationId,
      defaultUrl: "https://learn.example.com/study-guide",
    }));
    const source = readFileSync(new URL("../../../src/modules/certdrill/category-discovery-control.tsx", import.meta.url), "utf8");

    expect(markup).toContain("Find Categories with AI");
    expect(source).toContain("Study guide URL");
    expect(source).toContain('type="url"');
    expect(source).toContain("startCategoryDiscovery(certificationId, url)");
    expect(source).toContain("router.refresh()");
    expect(source).toContain("setOpen(false)");
    expect(source).toContain("Blueprint code");
    expect(source).toContain("createBlueprintRunPoller");
  });

  it("shows completed categories as persisted and available for manual review", () => {
    const markup = renderToStaticMarkup(createElement(CategoryDiscoveryDetails, { run: createRun() }));

    expect(markup).toContain("Categories created");
    expect(markup).toContain("now in the database");
    expect(markup).toContain("Existing categories with matching codes were kept unchanged.");
    expect(markup).toContain("Discovered categories");
    expect(markup).toContain("D1");
    expect(markup).toContain("Design identity");
    expect(markup).toContain("20–25%");
    expect(markup).toContain("Review the percentage range.");
  });

  it("shows running and failed states without claiming categories were created", () => {
    const running = renderToStaticMarkup(createElement(CategoryDiscoveryDetails, {
      run: createRun({ status: "running", proposalJson: null, completedAt: null }),
    }));
    const failed = renderToStaticMarkup(createElement(CategoryDiscoveryDetails, {
      run: createRun({ status: "failed", proposalJson: null, errorMessage: "Provider failed." }),
    }));

    expect(running).toContain("Finding categories");
    expect(running).toContain("being analyzed");
    expect(running).not.toContain("now in the database");
    expect(failed).toContain("Provider failed.");
    expect(failed).not.toContain("now in the database");
  });

  it("formats exact, ranged, and missing weights", () => {
    expect(formatBlueprintWeight({ weightPct: 20, weightMinPct: 20, weightMaxPct: 20 })).toBe("20%");
    expect(formatBlueprintWeight({ weightPct: null, weightMinPct: 20, weightMaxPct: 25 })).toBe("20–25%");
    expect(formatBlueprintWeight({ weightPct: null, weightMinPct: null, weightMaxPct: null })).toBe("Not provided");
  });
});

describe("category discovery client", () => {
  it("starts discovery with the study-guide URL", async () => {
    const run = createRun({ status: "pending", proposalJson: null, completedAt: null });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: run }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startCategoryDiscovery(certificationId, "https://learn.example.com/study-guide")).resolves.toEqual(run);
    expect(fetchMock).toHaveBeenCalledWith("/api/certdrill/category-discoveries", {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ certificationId, url: "https://learn.example.com/study-guide" }),
    });
  });

  it("loads status and surfaces API errors", async () => {
    const run = createRun({ status: "running", proposalJson: null, completedAt: null });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: run }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ success: false, error: { message: "  Fetch failed.  " } }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBlueprintAnalysisRun(run.id)).resolves.toEqual(run);
    await expect(startCategoryDiscovery(certificationId, "https://learn.example.com/study-guide")).rejects.toThrow("Fetch failed.");
  });
});
