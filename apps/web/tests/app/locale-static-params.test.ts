import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

describe("locale route static params", () => {
  it("rejects unknown locale params at the route boundary", async () => {
    const source = await readFile(join(process.cwd(), "src/app/[locale]/layout.tsx"), "utf8");

    expect(source).toContain("export function generateStaticParams()");
    expect(source).toMatch(/export\s+const\s+dynamicParams\s*=\s*false/);
  });
});
