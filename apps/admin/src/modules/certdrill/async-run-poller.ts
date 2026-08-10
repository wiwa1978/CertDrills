const DEFAULT_POLL_INTERVAL_MS = 2_000;
const DEFAULT_POLL_TIMEOUT_MS = 300_000;

type PollableRun = { status: "pending" | "running" | "completed" | "failed" };

export function createAsyncRunPoller<Run extends PollableRun>(deps: {
  fetchRun: (runId: string) => Promise<Run>;
  onRun: (run: Run) => void;
  onError: (message: string) => void;
  onTimeout: () => void;
  intervalMs?: number;
  timeoutMs?: number;
  errorFallback?: string;
}) {
  const intervalMs = deps.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  let generation = 0;
  let active = false;
  let currentRunId: string | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

  function clearTimers() {
    if (pollTimer !== null) clearTimeout(pollTimer);
    if (timeoutTimer !== null) clearTimeout(timeoutTimer);
    pollTimer = null;
    timeoutTimer = null;
  }
  function stop() { generation += 1; active = false; clearTimers(); }
  function isCurrent(runId: string, requestGeneration: number) {
    return active && generation === requestGeneration && currentRunId === runId;
  }
  function schedule(runId: string, requestGeneration: number) {
    if (!isCurrent(runId, requestGeneration)) return;
    pollTimer = setTimeout(() => { void request(runId, requestGeneration); }, intervalMs);
  }
  async function request(runId: string, requestGeneration: number) {
    try {
      const run = await deps.fetchRun(runId);
      if (!isCurrent(runId, requestGeneration)) return;
      deps.onRun(run);
      if (run.status !== "pending" && run.status !== "running") { stop(); return; }
      schedule(runId, requestGeneration);
    } catch (error) {
      if (!isCurrent(runId, requestGeneration)) return;
      const message = error instanceof Error && error.message.trim() ? error.message.trim() : deps.errorFallback ?? "Status check failed.";
      deps.onError(message);
      stop();
    }
  }
  function begin(runId: string) {
    currentRunId = runId;
    generation += 1;
    active = true;
    clearTimers();
    const requestGeneration = generation;
    timeoutTimer = setTimeout(() => {
      if (!isCurrent(runId, requestGeneration)) return;
      stop();
      deps.onTimeout();
    }, timeoutMs);
    return request(runId, requestGeneration);
  }

  return {
    start(runId: string) { void begin(runId); },
    async retry() { if (currentRunId !== null) await begin(currentRunId); },
    stop,
  };
}
