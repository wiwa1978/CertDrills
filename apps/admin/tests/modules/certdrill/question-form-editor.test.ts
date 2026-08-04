import { readFileSync } from "node:fs";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownTextarea } from "@/modules/certdrill/markdown";

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
    expect(markdownSource).toContain("aria-invalid={errorMessages.length > 0 || undefined}");
    expect(markdownSource).toContain("errorMessages.map((message, index) => (");
    expect(typeof questionFormSource).toBe("string");
  });

  it("renders markdown textarea accessibility affordances at the markup level", () => {
    const id = "question-stem";
    const markup = renderToStaticMarkup(
      createElement(MarkdownTextarea, {
        id,
        name: "stem",
        label: "Stem",
        helperText: "Provide the full prompt.",
        errorMessages: ["Stem is required."],
        required: true,
      }),
    );

    expect(markup).toContain(">Stem");
    expect(markup).toContain(`for="${id}"`);
    expect(markup).toContain(`id="${id}"`);
    expect(markup).toContain('name="stem"');
    expect(markup).toContain("required");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain(`aria-describedby="${id}-error ${id}-helper"`);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Stem is required.");
    expect(markup).toContain("Provide the full prompt.");
    expect(markup).toContain("Markdown supported");
  });

  it("omits aria-invalid when there are no markdown textarea errors", () => {
    const markup = renderToStaticMarkup(
      createElement(MarkdownTextarea, {
        id: "question-notes",
        name: "notes",
        label: "Notes",
      }),
    );

    expect(markup).not.toContain("aria-invalid=");
  });
});
