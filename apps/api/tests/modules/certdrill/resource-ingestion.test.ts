import { describe, expect, it, vi } from "vitest";

import { ResourceExtractionError } from "../../../src/modules/certdrill/resource-extraction";
import { ResourceFetchError } from "../../../src/modules/certdrill/resource-fetch";
import { createResourceIngestor } from "../../../src/modules/certdrill/resource-ingestion";

const textEncoder = new TextEncoder();

describe("createResourceIngestor", () => {
  it("returns the fetched and extracted resource snapshot", async () => {
    const body = textEncoder.encode("<html><body>Guide</body></html>");
    const fetchResource = vi.fn().mockResolvedValue({
      finalUrl: "https://learn.example/guide",
      contentType: "text/html; charset=utf-8",
      body,
    });
    const extractDocument = vi.fn().mockResolvedValue({
      title: "Guide",
      text: "Domain 1",
      contentType: "text/html",
    });
    const ingestedAt = new Date("2026-08-06T12:00:00.000Z");
    const now = vi.fn().mockReturnValue(ingestedAt);
    const ingestor = createResourceIngestor({ fetchResource, extractDocument, now });

    await expect(ingestor.ingest("https://learn.example/guide")).resolves.toEqual({
      finalUrl: "https://learn.example/guide",
      title: "Guide",
      rawContent: "Domain 1",
      contentType: "text/html",
      ingestedAt,
    });

    expect(fetchResource).toHaveBeenCalledWith("https://learn.example/guide");
    expect(extractDocument).toHaveBeenCalledWith({
      contentType: "text/html; charset=utf-8",
      body,
    });
    expect(now).toHaveBeenCalledTimes(1);
  });

  it("propagates typed fetch errors", async () => {
    const fetchError = new ResourceFetchError("FETCH_FAILED", "Request failed");
    const extractDocument = vi.fn();
    const ingestor = createResourceIngestor({
      fetchResource: vi.fn().mockRejectedValue(fetchError),
      extractDocument,
    });

    await expect(ingestor.ingest("https://learn.example/guide")).rejects.toBe(fetchError);
    expect(extractDocument).not.toHaveBeenCalled();
  });

  it("propagates typed extraction errors", async () => {
    const extractionError = new ResourceExtractionError("EMPTY_CONTENT", "No extractable text was found.");
    const ingestor = createResourceIngestor({
      fetchResource: vi.fn().mockResolvedValue({
        finalUrl: "https://learn.example/guide",
        contentType: "text/html",
        body: textEncoder.encode("<html></html>"),
      }),
      extractDocument: vi.fn().mockRejectedValue(extractionError),
    });

    await expect(ingestor.ingest("https://learn.example/guide")).rejects.toBe(extractionError);
  });
});
