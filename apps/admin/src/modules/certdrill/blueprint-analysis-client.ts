import type { CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";

const START_BLUEPRINT_ANALYSIS_ERROR_MESSAGE = "Blueprint analysis request failed.";
const GET_BLUEPRINT_ANALYSIS_ERROR_MESSAGE = "Blueprint analysis status check failed.";
const INVALID_BLUEPRINT_ANALYSIS_RESPONSE_MESSAGE = "Blueprint analysis response was invalid.";
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
    return new Error(INVALID_BLUEPRINT_ANALYSIS_RESPONSE_MESSAGE);
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

export async function startBlueprintAnalysis(
  certificationId: string,
  resourceId: string,
): Promise<CertDrillBlueprintParseRun> {
  return requestBlueprintAnalysisRun(
    BLUEPRINT_PARSE_RUNS_PATH,
    {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        certificationId,
        resourceId,
      }),
    },
    START_BLUEPRINT_ANALYSIS_ERROR_MESSAGE,
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
    GET_BLUEPRINT_ANALYSIS_ERROR_MESSAGE,
  );
}
