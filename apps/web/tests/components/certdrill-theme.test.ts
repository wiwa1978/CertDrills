import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const componentsSource = readFileSync(new URL("../../src/modules/certdrill/components.tsx", import.meta.url), "utf8");

describe("CertDrill theme tokens", () => {
  it("uses the default app theme instead of CertDrill-specific page backgrounds", () => {
    expect(componentsSource).toContain("bg-background");
    expect(componentsSource).toContain("text-foreground");
    expect(componentsSource).toContain("max-w-7xl");
    expect(componentsSource).not.toContain("--certdrill-bg");
    expect(componentsSource).not.toContain("--certdrill-panel");
    expect(componentsSource).not.toContain("background-image");
    expect(componentsSource).not.toContain("bg-[#0f1720]");
    expect(componentsSource).not.toContain("bg-[#16212f]");
    expect(componentsSource).not.toContain("text-slate-100");
  });
});
