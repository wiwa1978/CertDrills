import { load } from "cheerio";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, sep } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath, pathToFileURL } from "node:url";

export type ExtractedResourceContentType = "text/html" | "application/pdf";

export type ExtractedResourceDocument = {
  title: string | null;
  text: string;
  contentType: ExtractedResourceContentType;
};

export type ResourceExtractionErrorCode =
  | "UNSUPPORTED_CONTENT_TYPE"
  | "EMPTY_CONTENT"
  | "EXTRACTED_TEXT_TOO_LARGE";

export class ResourceExtractionError extends Error {
  constructor(public readonly code: ResourceExtractionErrorCode, message: string) {
    super(message);
    this.name = "ResourceExtractionError";
  }
}

const MAX_EXTRACTED_TEXT_LENGTH = 100_000;
const NON_CONTENT_SELECTOR = "script, style, nav, footer, noscript, svg";
const BLOCK_WITH_BLANK_LINES = new Set([
  "article",
  "aside",
  "blockquote",
  "div",
  "figure",
  "figcaption",
  "header",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "main",
  "p",
  "section",
]);

const BLOCK_WITH_SINGLE_LINES = new Set([
  "dd",
  "dt",
  "li",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
]);

const LIST_CONTAINER_TAGS = new Set(["dl", "ol", "ul"]);
const pdfjsDistPackageDir = dirname(createRequire(import.meta.url).resolve("pdfjs-dist/package.json"));
const pdfjsDistStandardFontDataUrl = pathToFileURL(join(pdfjsDistPackageDir, "standard_fonts") + sep).toString();
const pdfjsDistCMapUrl = pathToFileURL(join(pdfjsDistPackageDir, "cmaps") + sep).toString();

type ExtractResourceDocumentInput = {
  contentType: string;
  body: string | ArrayBuffer | ArrayBufferView;
};

type DomNode = {
  type?: string;
  name?: string;
  data?: string;
  children?: DomNode[];
};

type PdfTextItem = {
  str?: string;
  hasEOL?: boolean;
  transform?: number[];
};

export function normalizeResourceText(value: string) {
  const lines = value.replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/\s+/g, " ").trim());
  const normalizedLines: string[] = [];

  for (const line of lines) {
    if (line.length === 0) {
      if (normalizedLines.at(-1) !== "") {
        normalizedLines.push("");
      }
      continue;
    }

    normalizedLines.push(line);
  }

  while (normalizedLines[0] === "") {
    normalizedLines.shift();
  }

  while (normalizedLines.at(-1) === "") {
    normalizedLines.pop();
  }

  return normalizedLines.join("\n");
}

export async function extractResourceDocument(input: ExtractResourceDocumentInput): Promise<ExtractedResourceDocument> {
  const contentType = normalizeContentType(input.contentType);

  if (contentType === "text/html") {
    return extractHtmlDocument(input.body);
  }

  if (contentType === "application/pdf") {
    return extractPdfDocument(input.body);
  }

  throw new ResourceExtractionError("UNSUPPORTED_CONTENT_TYPE", `Unsupported content type: ${contentType || input.contentType}`);
}

async function extractHtmlDocument(body: string | ArrayBuffer | ArrayBufferView): Promise<ExtractedResourceDocument> {
  const html = typeof body === "string" ? body : decodeTextBody(body);
  const $ = load(html);
  const title = normalizeResourceTitle($("title").first().text());
  const root = $("main").first().length > 0 ? $("main").first() : $("article").first().length > 0 ? $("article").first() : $("body").first();

  root.find(NON_CONTENT_SELECTOR).remove();
  const text = normalizeResourceText(renderCheerioNode(root.get(0)));

  if (!text) {
    throw new ResourceExtractionError("EMPTY_CONTENT", "No extractable text was found.");
  }

  if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
    throw new ResourceExtractionError("EXTRACTED_TEXT_TOO_LARGE", `Extracted text exceeds ${MAX_EXTRACTED_TEXT_LENGTH} characters.`);
  }

  return {
    title,
    text,
    contentType: "text/html",
  };
}

async function extractPdfDocument(body: string | ArrayBuffer | ArrayBufferView): Promise<ExtractedResourceDocument> {
  const data = toUint8Array(body);
  const loadingTask = getDocument({
    data,
    cMapUrl: pdfjsDistCMapUrl,
    cMapPacked: true,
    standardFontDataUrl: pdfjsDistStandardFontDataUrl,
    useWorkerFetch: false,
    BinaryDataFactory: LocalBinaryDataFactory,
  });
  const document = await loadingTask.promise;

  try {
    const pageTexts: string[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const textContent = await page.getTextContent();
      pageTexts.push(renderPdfTextContent(textContent.items as PdfTextItem[]));
    }

    const metadata = await document.getMetadata().catch(() => null) as { info?: { Title?: unknown } } | null;
    const title = normalizeResourceTitle(typeof metadata?.info?.Title === "string" ? metadata.info.Title : null);
    const text = normalizeResourceText(pageTexts.join("\n\n"));

    if (!text) {
      throw new ResourceExtractionError("EMPTY_CONTENT", "No extractable text was found.");
    }

    if (text.length > MAX_EXTRACTED_TEXT_LENGTH) {
      throw new ResourceExtractionError("EXTRACTED_TEXT_TOO_LARGE", `Extracted text exceeds ${MAX_EXTRACTED_TEXT_LENGTH} characters.`);
    }

    return {
      title,
      text,
      contentType: "application/pdf",
    };
  } finally {
    await loadingTask.destroy();
  }
}

class LocalBinaryDataFactory {
  cMapUrl: string | null;
  standardFontDataUrl: string | null;
  wasmUrl: string | null;

  constructor({
    cMapUrl = null,
    standardFontDataUrl = null,
    wasmUrl = null,
  }: {
    cMapUrl?: string | null;
    standardFontDataUrl?: string | null;
    wasmUrl?: string | null;
  }) {
    this.cMapUrl = cMapUrl;
    this.standardFontDataUrl = standardFontDataUrl;
    this.wasmUrl = wasmUrl;
  }

  async fetch({
    kind,
    filename,
  }: {
    kind: "cMapUrl" | "standardFontDataUrl" | "wasmUrl";
    filename: string;
  }) {
    const baseUrl = this[kind];
    if (!baseUrl) {
      throw new Error(`Ensure that the \`${kind}\` API parameter is provided.`);
    }

    const url = `${baseUrl}${filename}`;
    if (url.startsWith("file://")) {
      return new Uint8Array(await readFile(fileURLToPath(url)));
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Unable to load ${kind} data at: ${url}`);
      }

      return new Uint8Array(await response.arrayBuffer());
    }

    throw new Error(`Unable to load ${kind} data at: ${url}`);
  }
}

function renderCheerioNode(node: DomNode | undefined): string {
  if (!node) {
    return "";
  }

  if (node.type === "text") {
    return node.data?.replace(/\s+/g, " ") ?? "";
  }

  if (node.type !== "tag") {
    return renderCheerioChildren(node.children ?? []);
  }

  const tagName = node.name?.toLowerCase() ?? "";
  if (tagName === "br") {
    return "\n";
  }

  if (LIST_CONTAINER_TAGS.has(tagName)) {
    return `\n${renderCheerioChildren(node.children ?? [])}\n`;
  }

  if (BLOCK_WITH_SINGLE_LINES.has(tagName)) {
    return `${renderCheerioChildren(node.children ?? [])}\n`;
  }

  if (BLOCK_WITH_BLANK_LINES.has(tagName)) {
    return `\n${renderCheerioChildren(node.children ?? [])}\n`;
  }

  return renderCheerioChildren(node.children ?? []);
}

function renderCheerioChildren(children: DomNode[]) {
  return children.map((child) => renderCheerioNode(child)).join("");
}

function renderPdfTextContent(items: PdfTextItem[]) {
  let text = "";
  let previousLineY: number | null = null;

  for (const item of items) {
    const value = typeof item?.str === "string" ? item.str : "";
    if (!value) {
      continue;
    }

    const lineY = typeof item.transform?.[5] === "number" ? item.transform[5] : null;
    const isNewLine = previousLineY !== null && lineY !== null && Math.abs(lineY - previousLineY) > 0.5;

    if (isNewLine && text && !text.endsWith("\n")) {
      text += "\n";
    } else if (text && !text.endsWith("\n") && !text.endsWith(" ")) {
      text += " ";
    }

    text += value;
    previousLineY = lineY ?? previousLineY;

    if (item.hasEOL && !text.endsWith("\n")) {
      text += "\n";
    }
  }

  return text;
}

function normalizeResourceTitle(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeContentType(contentType: string) {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

function decodeTextBody(body: ArrayBuffer | ArrayBufferView) {
  const bytes = toUint8Array(body);
  return new TextDecoder().decode(bytes);
}

function toUint8Array(body: ArrayBuffer | ArrayBufferView | string) {
  if (typeof body === "string") {
    return new TextEncoder().encode(body);
  }

  if (body instanceof Uint8Array) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }

  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}
