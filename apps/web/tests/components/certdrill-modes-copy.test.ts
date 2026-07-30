import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../../src/modules/certdrill/start-page.tsx", import.meta.url), "utf8");
const runnerSource = readFileSync(new URL("../../src/modules/certdrill/exam-runner.tsx", import.meta.url), "utf8");
const resultsSource = readFileSync(new URL("../../src/modules/certdrill/results-page.tsx", import.meta.url), "utf8");
const historySource = readFileSync(new URL("../../src/modules/certdrill/attempt-history-page.tsx", import.meta.url), "utf8");
const catalogSource = readFileSync(new URL("../../src/modules/certdrill/catalog-page.tsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("../../src/lib/api/certdrill.server.ts", import.meta.url), "utf8");
const examsPageSource = readFileSync(new URL("../../src/app/[locale]/(backend)/exams/page.tsx", import.meta.url), "utf8");

describe("CertDrill mode copy", () => {
  it("shows the approved practice and exam options", () => {
    expect(source).toContain("Quick Drill");
    expect(source).toContain("Category Drill");
    expect(source).toContain("Missed Questions Review");
    expect(source).toContain("Weak Areas Drill");
    expect(source).toContain("Exam Simulation");
    expect(source).toContain("Exam Form");
  });

  it("marks selectable mode and confidence buttons as pressed for assistive tech", () => {
    expect(source).toContain("aria-pressed={active}");
    expect(runnerSource).toContain("aria-pressed={confidence === option.value}");
    expect(runnerSource).toContain("aria-pressed={selected}");
  });

  it("exposes timed attempts as a polite timer for assistive tech", () => {
    expect(runnerSource).toContain('role="timer"');
    expect(runnerSource).toContain('aria-live="polite"');
  });

  it("uses published exam form names without prefixing them again", () => {
    expect(source).toContain("title={form.name}");
    expect(source).not.toContain("`Exam Form ${form.name}`");
  });

  it("uses exam form names when attempts include them", () => {
    expect(runnerSource).toContain("examFormName");
    expect(resultsSource).toContain("examFormName");
    expect(historySource).toContain("examFormName");
  });

  it("fetches and renders readiness cards on the exam catalog", () => {
    expect(apiSource).toContain("getCertDrillReadinessServer");
    expect(apiSource).toContain("/api/certdrill/readiness");
    expect(examsPageSource).toContain("getCertDrillReadinessServer");
    expect(catalogSource).toContain("Readiness snapshot");
    expect(catalogSource).toContain("Completed attempts");
    expect(catalogSource).toContain("Average score");
    expect(catalogSource).toContain("Missed questions");
    expect(catalogSource).toContain("Weak categories");
  });
});
