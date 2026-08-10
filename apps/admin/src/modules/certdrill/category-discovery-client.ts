import type { CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";

const START_CATEGORY_DISCOVERY_ERROR_MESSAGE = "Category discovery request failed.";
const GET_CATEGORY_DISCOVERY_ERROR_MESSAGE = "Category discovery status check failed.";
const INVALID_CATEGORY_DISCOVERY_RESPONSE_MESSAGE = "Category discovery response was invalid.";
const CATEGORY_DISCOVERIES_PATH = "/api/certdrill/category-discoveries";
const BLUEPRINT_PARSE_RUNS_PATH = "/api/certdrill/blueprint-parse-runs";

type BlueprintAnalysisEnvelope<T> = {
  success?: boolean;
  data?: T;
  error?: {
    message?: unknown;
  };
};

function safeErrorMessage(message: unknown) {
  return typeof message === "string" && message.trim().length > 0
    ? message.trim()
    : null;
}

function safeTransportError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = safeErrorMessage(error.message);

    if (message !== null) {
      return new Error(message);
    }
  }

  return new Error(fallback);
}

async function parseBlueprintAnalysisEnvelope<T>(
  response: Response,
): Promise<BlueprintAnalysisEnvelope<T> | null> {
  try {
    return await response.json() as BlueprintAnalysisEnvelope<T>;
  } catch {
    return null;
  }
}

function envelopeError(response: Response, envelope: BlueprintAnalysisEnvelope<unknown> | null, fallback: string) {
  const message = safeErrorMessage(envelope?.error?.message);

  if (message !== null) {
    return new Error(message);
  }

  if (response.ok) {
    return new Error(INVALID_CATEGORY_DISCOVERY_RESPONSE_MESSAGE);
  }

  return new Error(fallback);
}

async function requestBlueprintAnalysisRun(
  path: string,
  init: RequestInit,
  fallback: string,
): Promise<CertDrillBlueprintParseRun> {
  let response: Response;

  try {
    response = await fetch(path, {
      ...init,
      credentials: "same-origin",
    });
  } catch (error) {
    throw safeTransportError(error, fallback);
  }

  const envelope = await parseBlueprintAnalysisEnvelope<CertDrillBlueprintParseRun>(response);

  if (!response.ok || envelope?.success !== true || envelope.data === undefined) {
    throw envelopeError(response, envelope, fallback);
  }

  return envelope.data;
}

export async function startCategoryDiscovery(
  certificationId: string,
  url: string,
): Promise<CertDrillBlueprintParseRun> {
  return requestBlueprintAnalysisRun(
    CATEGORY_DISCOVERIES_PATH,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        certificationId,
        url,
      }),
    },
    START_CATEGORY_DISCOVERY_ERROR_MESSAGE,
  );
}

export async function getBlueprintAnalysisRun(
  runId: string,
): Promise<CertDrillBlueprintParseRun> {
  return requestBlueprintAnalysisRun(
    `${BLUEPRINT_PARSE_RUNS_PATH}/${runId}`,
    {
      headers: {
        accept: "application/json",
      },
    },
    GET_CATEGORY_DISCOVERY_ERROR_MESSAGE,
  );
}
