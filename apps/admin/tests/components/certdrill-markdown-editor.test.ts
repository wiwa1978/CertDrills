import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MarkdownPreview } from "@/modules/certdrill/markdown";

const markdownSource = readFileSync(new URL("../../src/modules/certdrill/markdown.tsx", import.meta.url), "utf8");

function renderMarkdown(markdown: string) {
  return renderToStaticMarkup(createElement(MarkdownPreview, { markdown }));
}

describe("CertDrill markdown preview", () => {
  it("renders lightweight markdown for headings, bold, inline code, code blocks, and links", () => {
    const markup = renderMarkdown(`# Heading\n\nThis is **important** with \`az login\`.\n\n\`\`\`bash\naz account show\n\`\`\`\n\nSee [the docs](https://learn.microsoft.com/docs).`);

    expect(markup).toContain("<h2");
    expect(markup).toContain("Heading</h2>");
    expect(markup).toContain("<strong>important</strong>");
    expect(markup).toContain("<code>az login</code>");
    expect(markup).toContain("<pre");
    expect(markup).toContain("<code>az account show</code>");
    expect(markup).toContain('href="https://learn.microsoft.com/docs"');
    expect(markup).toContain('rel="noreferrer"');
    expect(markup).toContain("the docs</a>");
  });

  it("escapes raw html instead of rendering it", () => {
    const markup = renderMarkdown("<script>alert('xss')</script> **safe**");

    expect(markup).not.toContain("<script>");
    expect(markup).toContain("&lt;script&gt;alert(&#x27;xss&#x27;)&lt;/script&gt;");
    expect(markup).toContain("<strong>safe</strong>");
  });

  it("keeps textarea value and preview synchronized when defaultValue changes", () => {
    expect(markdownSource).toContain("previousDefaultValue !== normalizedDefaultValue");
    expect(markdownSource).toContain("setMarkdown(normalizedDefaultValue)");
    expect(markdownSource).toContain("value={markdown}");
  });

  it("associates markdown textarea labels with their textarea", () => {
    expect(markdownSource).toContain("<Label htmlFor={id}>");
    expect(markdownSource).toContain("<Textarea");
    expect(markdownSource).toContain("id={id}");
  });
});
