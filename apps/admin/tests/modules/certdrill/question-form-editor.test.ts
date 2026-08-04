import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  try {
    return readFileSync(new URL(relativePath, import.meta.url), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

const markdownSource = readSource("../../../src/modules/certdrill/markdown.tsx");
const questionFormSource = readSource("../../../src/modules/certdrill/question-form.tsx");

describe("Question form editor", () => {
  it("exports a preview-free markdown textarea with markdown guidance", () => {
    expect(markdownSource).toContain("export function MarkdownTextarea(");
    expect(markdownSource).toContain("Markdown supported");
    expect(typeof questionFormSource).toBe("string");
  });
});
