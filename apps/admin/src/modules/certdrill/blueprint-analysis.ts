import type { CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";

import { createAsyncRunPoller } from "./async-run-poller";

const POLLER_ERROR_FALLBACK = "Blueprint analysis status check failed.";

export function createBlueprintRunPoller(deps: {
  fetchRun: (runId: string) => Promise<CertDrillBlueprintParseRun>;
  onRun: (run: CertDrillBlueprintParseRun) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
  intervalMs?: number;
  timeoutMs?: number;
}) {
  return createAsyncRunPoller({ ...deps, errorFallback: POLLER_ERROR_FALLBACK });
}
