import type {
  CertDrillAdminResource,
  CertDrillBlueprintCategoryProposal,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";

const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 300_000;
const POLLER_ERROR_FALLBACK = "Blueprint analysis status check failed.";

function normalizeCategoryCode(code: string | null | undefined): string | null {
  if (typeof code !== "string") {
    return null;
  }

  const normalized = code.trim().toUpperCase();
  return normalized.length > 0 ? normalized : null;
}

export function blueprintAnalysisEligibility(
  resource: CertDrillAdminResource,
): { eligible: true } | { eligible: false; reason: string } {
  if (resource.status !== "ingested") {
    return {
      eligible: false,
      reason: "Ingest this resource before analysis.",
    };
  }

  if (resource.contentMode !== "outline_blueprint") {
    return {
      eligible: false,
      reason: "Use outline blueprint content mode for analysis.",
    };
  }

  if (resource.sourceType !== "study-guide" && resource.sourceType !== "exam-blueprint") {
    return {
      eligible: false,
      reason: "Only study-guide and exam-blueprint resources can be analyzed.",
    };
  }

  return { eligible: true };
}

// If createdAt ties for the same resource, the later array entry wins.
export function newestBlueprintRunByResource(
  runs: CertDrillBlueprintParseRun[],
): Map<string, CertDrillBlueprintParseRun> {
  const newestRuns = new Map<string, CertDrillBlueprintParseRun>();

  for (const run of runs) {
    const existing = newestRuns.get(run.resourceId);

    if (existing === undefined || run.createdAt >= existing.createdAt) {
      newestRuns.set(run.resourceId, run);
    }
  }

  return newestRuns;
}

export function blueprintCategoryDepths(
  categories: CertDrillBlueprintCategoryProposal[],
): Map<string, number> {
  const categoriesByCode = new Map<string, CertDrillBlueprintCategoryProposal>();

  for (const category of categories) {
    const normalizedCode = normalizeCategoryCode(category.code);

    if (normalizedCode !== null) {
      categoriesByCode.set(normalizedCode, category);
    }
  }

  const cachedDepths = new Map<string, number | null>();
  const resolvingCodes = new Set<string>();

  const resolveDepth = (code: string): number | null => {
    const cached = cachedDepths.get(code);

    if (cached !== undefined) {
      return cached;
    }

    const category = categoriesByCode.get(code);

    if (!category || resolvingCodes.has(code)) {
      cachedDepths.set(code, null);
      return null;
    }

    resolvingCodes.add(code);

    const parentCode = normalizeCategoryCode(category.parentCode);
    let depth: number | null;

    if (parentCode === null) {
      depth = 0;
    } else if (parentCode === code || !categoriesByCode.has(parentCode)) {
      depth = null;
    } else {
      const parentDepth = resolveDepth(parentCode);
      depth = parentDepth === null ? null : parentDepth + 1;
    }

    resolvingCodes.delete(code);
    cachedDepths.set(code, depth);
    return depth;
  };

  const depths = new Map<string, number>();

  for (const category of categories) {
    const normalizedCode = normalizeCategoryCode(category.code);

    if (normalizedCode !== null) {
      depths.set(normalizedCode, resolveDepth(normalizedCode) ?? 0);
    }
  }

  return depths;
}

function isPollingStatus(status: CertDrillBlueprintParseRun["status"]) {
  return status === "pending" || status === "running";
}

function describePollerError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : POLLER_ERROR_FALLBACK;
  }

  return POLLER_ERROR_FALLBACK;
}

export function createBlueprintRunPoller(deps: {
  fetchRun: (runId: string) => Promise<CertDrillBlueprintParseRun>;
  onRun: (run: CertDrillBlueprintParseRun) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  const intervalMs = deps.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;

  let generation = 0;
  let active = false;
  let currentRunId: string | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  const clearTimers = () => {
    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    if (timeoutTimer !== null) {
      clearTimeout(timeoutTimer);
      timeoutTimer = null;
    }
  };

  const stopCurrentGeneration = () => {
    generation += 1;
    active = false;
    clearTimers();
  };

  const isCurrentGeneration = (runId: string, requestGeneration: number) => (
    active
    && generation === requestGeneration
    && currentRunId === runId
  );

  const scheduleNextPoll = (runId: string, requestGeneration: number) => {
    if (!isCurrentGeneration(runId, requestGeneration)) {
      return;
    }

    pollTimer = setTimeout(() => {
      void requestRun(runId, requestGeneration);
    }, intervalMs);
  };

  const requestRun = async (runId: string, requestGeneration: number) => {
    try {
      const run = await deps.fetchRun(runId);

      if (!isCurrentGeneration(runId, requestGeneration)) {
        return;
      }

      deps.onRun(run);

      if (!isPollingStatus(run.status)) {
        stopCurrentGeneration();
        return;
      }

      scheduleNextPoll(runId, requestGeneration);
    } catch (error) {
      if (!isCurrentGeneration(runId, requestGeneration)) {
        return;
      }

      deps.onError(describePollerError(error));
      stopCurrentGeneration();
    }
  };

  const beginPolling = (runId: string) => {
    currentRunId = runId;
    generation += 1;
    active = true;
    clearTimers();

    const requestGeneration = generation;
    timeoutTimer = setTimeout(() => {
      if (!isCurrentGeneration(runId, requestGeneration)) {
        return;
      }

      stopCurrentGeneration();
      deps.onTimeout();
    }, timeoutMs);

    return requestRun(runId, requestGeneration);
  };

  return {
    start(runId: string) {
      void beginPolling(runId);
    },
    async retry() {
      if (currentRunId === null) {
        return;
      }

      await beginPolling(currentRunId);
    },
    stop() {
      stopCurrentGeneration();
    },
  };
}
