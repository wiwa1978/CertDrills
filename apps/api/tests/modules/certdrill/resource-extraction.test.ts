import { PDFDocument, StandardFonts } from "pdf-lib";
import { describe, expect, it } from "vitest";

import {
  extractResourceDocument,
  normalizeResourceText,
  ResourceExtractionError,
} from "../../../src/modules/certdrill/resource-extraction";

describe("normalizeResourceText", () => {
  it("collapses repeated whitespace while preserving blank lines", () => {
    expect(normalizeResourceText("  Hello   world \n\n  Next\tline  \n \n Third   line  ")).toBe("Hello world\n\nNext line\n\nThird line");
  });
});

describe("extractResourceDocument", () => {
  it("extracts title and normalized html text while ignoring non-content nodes", async () => {
    const html = `
      <html>
        <head>
          <title>Resource Title</title>
          <style>body { color: red; }</style>
          <script>console.log("ignore me");</script>
        </head>
        <body>
          <nav>Navigation</nav>
          <main>
            <h1>Heading One</h1>
            <p>Paragraph one.</p>
            <ul>
              <li>First item</li>
              <li>Second item</li>
            </ul>
            <article>
              <h2>Nested article heading</h2>
              <p>Article paragraph.</p>
            </article>
            <noscript>Ignore me</noscript>
            <svg><text>Ignore SVG</text></svg>
          </main>
          <footer>Footer</footer>
        </body>
      </html>
    `;

    await expect(extractResourceDocument({ contentType: "text/html", body: html })).resolves.toEqual({
      title: "Resource Title",
      contentType: "text/html",
      text: "Heading One\n\nParagraph one.\n\nFirst item\nSecond item\n\nNested article heading\n\nArticle paragraph.",
    });
  });

  it("extracts title and text from a real pdf", async () => {
    const pdf = await PDFDocument.create();
    pdf.setTitle("PDF Resource Title");
    const page = pdf.addPage([400, 400]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    page.drawText("First page text", { x: 40, y: 340, size: 18, font });
    page.drawText("Second line", { x: 40, y: 310, size: 18, font });

    const bytes = await pdf.save();

    await expect(extractResourceDocument({ contentType: "application/pdf", body: bytes })).resolves.toEqual({
      title: "PDF Resource Title",
      contentType: "application/pdf",
      text: "First page text\nSecond line",
    });
  });

  it("throws a typed error for unsupported content types", async () => {
    await expect(extractResourceDocument({ contentType: "text/plain", body: "hello" })).rejects.toMatchObject({
      name: "ResourceExtractionError",
      code: "UNSUPPORTED_CONTENT_TYPE",
    });
  });

  it("throws when the extracted content is empty", async () => {
    await expect(extractResourceDocument({ contentType: "text/html", body: "<html><body><nav>Only nav</nav></body></html>" })).rejects.toMatchObject({
      code: "EMPTY_CONTENT",
    });
  });

  it("throws when extracted text exceeds the maximum size", async () => {
    const body = `<html><body><main>${"a".repeat(100_001)}</main></body></html>`;

    await expect(extractResourceDocument({ contentType: "text/html", body })).rejects.toMatchObject({
      code: "EXTRACTED_TEXT_TOO_LARGE",
    });
  });

  it("exports typed extraction errors", () => {
    const error = new ResourceExtractionError("EMPTY_CONTENT", "No content");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("EMPTY_CONTENT");
    expect(error.name).toBe("ResourceExtractionError");
  });
});
