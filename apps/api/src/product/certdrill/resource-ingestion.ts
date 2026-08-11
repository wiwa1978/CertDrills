import { extractResourceDocument } from "./resource-extraction";
import { fetchPublicResource } from "./resource-fetch";

export type ResourceIngestionResult = {
  finalUrl: string;
  title: string | null;
  rawContent: string;
  contentType: "text/html" | "application/pdf";
  ingestedAt: Date;
};

type CreateResourceIngestorDeps = {
  fetchResource?: typeof fetchPublicResource;
  extractDocument?: typeof extractResourceDocument;
  now?: () => Date;
};

export function createResourceIngestor(deps: CreateResourceIngestorDeps = {}) {
  const fetchResource = deps.fetchResource ?? fetchPublicResource;
  const extractDocument = deps.extractDocument ?? extractResourceDocument;
  const now = deps.now ?? (() => new Date());

  return {
    async ingest(url: string): Promise<ResourceIngestionResult> {
      const fetched = await fetchResource(url);
      const extracted = await extractDocument({
        contentType: fetched.contentType ?? "",
        body: fetched.body,
      });

      return {
        finalUrl: fetched.finalUrl,
        title: extracted.title,
        rawContent: extracted.text,
        contentType: extracted.contentType,
        ingestedAt: now(),
      };
    },
  };
}

export type ResourceIngestor = ReturnType<typeof createResourceIngestor>;
