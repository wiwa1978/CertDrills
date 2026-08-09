"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  CertDrillAdminResource,
  CertDrillBlueprintCategoryProposal,
  CertDrillBlueprintParseRun,
} from "@/lib/api/certdrill.server";
import {
  blueprintAnalysisEligibility,
  blueprintCategoryDepths,
  createBlueprintRunPoller,
} from "@/modules/certdrill/blueprint-analysis";
import {
  getBlueprintAnalysisRun,
  startBlueprintAnalysis,
} from "@/modules/certdrill/blueprint-analysis-client";

const POLL_TIMEOUT_MESSAGE = "Status check timed out.";
const START_ANALYSIS_ERROR_MESSAGE = "Blueprint analysis request failed.";

type RequestState = "idle" | "pending";

type BlueprintAnalysisDetailsProps = {
  resource: CertDrillAdminResource;
  run: CertDrillBlueprintParseRun | null;
  requestState: RequestState;
  requestError: string | null;
  pollError: string | null;
  pollTimedOut: boolean;
  onAnalyzeAgain?: () => void | Promise<void>;
  analyzeAgainDisabled?: boolean;
  onRetryStatusCheck?: () => void | Promise<void>;
  retryStatusCheckDisabled?: boolean;
};

export type BlueprintAnalysisControlProps = {
  certificationId: string;
  resource: CertDrillAdminResource;
  initialRun?: CertDrillBlueprintParseRun;
};

function isPollingStatus(status: CertDrillBlueprintParseRun["status"]) {
  return status === "pending" || status === "running";
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim();

    if (message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function statusLabel(status: CertDrillBlueprintParseRun["status"]) {
  switch (status) {
    case "pending":
      return "Queued";
    case "running":
      return "Analyzing";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
  }
}

function confidenceLabel(run: CertDrillBlueprintParseRun) {
  const confidence = run.confidence ?? run.proposalJson?.confidence ?? null;

  if (confidence === null) {
    return "Not provided";
  }

  return confidence.charAt(0).toUpperCase() + confidence.slice(1);
}

function warningMessages(run: CertDrillBlueprintParseRun) {
  return run.proposalJson?.warnings ?? run.warningsJson;
}

function categoryDepth(categoriesByCode: Map<string, number>, category: CertDrillBlueprintCategoryProposal) {
  return categoriesByCode.get(category.code.trim().toUpperCase()) ?? 0;
}

export function formatBlueprintWeight(
  category: Pick<CertDrillBlueprintCategoryProposal, "weightPct" | "weightMinPct" | "weightMaxPct">,
) {
  const { weightPct, weightMinPct, weightMaxPct } = category;

  if (weightMinPct != null && weightMaxPct != null) {
    return weightMinPct === weightMaxPct
      ? `${weightMinPct}%`
      : `${weightMinPct}–${weightMaxPct}%`;
  }

  return weightPct == null ? "Not provided" : `${weightPct}%`;
}

export function BlueprintAnalysisDetails({
  resource,
  run,
  requestState,
  requestError,
  pollError,
  pollTimedOut,
  onAnalyzeAgain,
  analyzeAgainDisabled = false,
  onRetryStatusCheck,
  retryStatusCheckDisabled = false,
}: BlueprintAnalysisDetailsProps) {
  const isCompletedRun = run?.status === "completed";
  const categories = isCompletedRun ? run.proposalJson?.categories ?? [] : [];
  const categoryDepths = blueprintCategoryDepths(categories);
  const warnings = run ? warningMessages(run) : [];

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{resource.title}</h2>
        <p className="text-sm text-muted-foreground">Review the latest read-only AI blueprint analysis for this resource.</p>
      </div>

      <div aria-live="polite" className="space-y-2">
        {run ? <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{statusLabel(run.status)}</Badge> : null}
        {requestState === "pending" ? (
          <p role="status" className="text-sm text-muted-foreground">Submitting analysis request...</p>
        ) : null}
      </div>

      {requestError ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {requestError}
        </div>
      ) : null}

      {pollError ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {pollError}
        </div>
      ) : null}

      {pollTimedOut ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {POLL_TIMEOUT_MESSAGE}
        </div>
      ) : null}

      {run ? (
        <>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <dt className="text-sm font-medium">Provider</dt>
              <dd className="text-sm text-muted-foreground">{run.provider}</dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">Model</dt>
              <dd className="text-sm text-muted-foreground">{run.model}</dd>
            </div>
            {isCompletedRun ? (
              <div className="space-y-1">
                <dt className="text-sm font-medium">Confidence</dt>
                <dd className="text-sm text-muted-foreground">
                  <Badge variant="secondary">{confidenceLabel(run)}</Badge>
                </dd>
              </div>
            ) : null}
            <div className="space-y-1">
              <dt className="text-sm font-medium">Created</dt>
              <dd className="text-sm text-muted-foreground"><time dateTime={run.createdAt}>{run.createdAt}</time></dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">Started</dt>
              <dd className="text-sm text-muted-foreground">
                {run.startedAt ? <time dateTime={run.startedAt}>{run.startedAt}</time> : "Not started"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">Completed</dt>
              <dd className="text-sm text-muted-foreground">
                {run.completedAt ? <time dateTime={run.completedAt}>{run.completedAt}</time> : "Not completed"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-sm font-medium">Updated</dt>
              <dd className="text-sm text-muted-foreground"><time dateTime={run.updatedAt}>{run.updatedAt}</time></dd>
            </div>
          </dl>

          <div className="space-y-2">
            <h3 className="text-sm font-medium">Warnings</h3>
            {warnings.length > 0 ? (
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {warnings.map((warning) => <li key={warning}>{warning}</li>)}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No warnings.</p>
            )}
          </div>

          {run.status === "failed" && run.errorMessage ? (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Failed error</h3>
              <p className="text-sm text-destructive">{run.errorMessage}</p>
            </div>
          ) : null}

          {run.status === "completed" && run.proposalJson ? (
            <div className="space-y-4">
              <h3 className="text-sm font-medium">Proposed categories</h3>
              <Table aria-label="Completed blueprint proposal categories" className="min-w-[720px]">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col">Code</TableHead>
                    <TableHead scope="col">Name</TableHead>
                    <TableHead scope="col">Parent</TableHead>
                    <TableHead scope="col">Weight</TableHead>
                    <TableHead scope="col">Evidence</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category, index) => (
                    <TableRow key={`${category.code}-${index}`}>
                      <TableCell>{category.code}</TableCell>
                      <TableCell>
                        <div className="space-y-1" style={{ paddingLeft: categoryDepth(categoryDepths, category) * 16 }}>
                          <p className="font-medium">{category.name}</p>
                        </div>
                      </TableCell>
                      <TableCell>{category.parentCode ?? "Top level"}</TableCell>
                      <TableCell>{formatBlueprintWeight(category)}</TableCell>
                      <TableCell>
                        <ul className="space-y-2">
                          {category.evidence.map((evidence, evidenceIndex) => (
                            <li key={`${category.code}-evidence-${evidenceIndex}`} className="rounded-md bg-muted/40 p-3 text-sm">
                              <p>{evidence.excerpt}</p>
                              <p className="text-muted-foreground">{evidence.location ?? "Location not provided."}</p>
                            </li>
                          ))}
                        </ul>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">No analysis run is available yet.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {onAnalyzeAgain ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onAnalyzeAgain()}
            disabled={analyzeAgainDisabled}
            aria-label={`Analyze ${resource.title} again`}
          >
            Analyze again
          </Button>
        ) : null}
        {onRetryStatusCheck ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => void onRetryStatusCheck()}
            disabled={retryStatusCheckDisabled}
            aria-label={`Retry status check for ${resource.title}`}
          >
            Retry status check
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BlueprintAnalysisControl({
  certificationId,
  resource,
  initialRun,
}: BlueprintAnalysisControlProps) {
  const eligibility = useMemo(() => blueprintAnalysisEligibility(resource), [resource]);
  const [open, setOpen] = useState(false);
  const [run, setRun] = useState<CertDrillBlueprintParseRun | null>(initialRun ?? null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollerRef = useRef<ReturnType<typeof createBlueprintRunPoller> | null>(null);
  const mountedRef = useRef(true);
  const dialogGenerationRef = useRef(0);
  const startRequestIdRef = useRef(0);
  const pendingStartRequestIdRef = useRef<number | null>(null);
  const reasonId = `${resource.id}-blueprint-analysis-reason`;
  const shouldPoll = open && run !== null && isPollingStatus(run.status);

  useEffect(() => {
    setRun(initialRun ?? null);
  }, [initialRun]);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      dialogGenerationRef.current += 1;
      pollerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    pollerRef.current?.stop();
    pollerRef.current = null;

    if (!shouldPoll || run === null) {
      return;
    }

    const poller = createBlueprintRunPoller({
      fetchRun: getBlueprintAnalysisRun,
      onRun: (nextRun) => {
        if (!mountedRef.current) {
          return;
        }

        setRun(nextRun);
        setPollError(null);
        setPollTimedOut(false);
      },
      onError: (message) => {
        if (!mountedRef.current) {
          return;
        }

        setPollError(message);
      },
      onTimeout: () => {
        if (!mountedRef.current) {
          return;
        }

        setPollTimedOut(true);
      },
    });

    pollerRef.current = poller;
    poller.start(run.id);

    return () => {
      poller.stop();

      if (pollerRef.current === poller) {
        pollerRef.current = null;
      }
    };
  }, [run?.id, shouldPoll]);

  function resetTransientState() {
    setRequestState("idle");
    setRequestError(null);
    setPollError(null);
    setPollTimedOut(false);
  }

  function handleDialogOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);

    if (!nextOpen) {
      dialogGenerationRef.current += 1;
      pollerRef.current?.stop();
      pollerRef.current = null;
      resetTransientState();
    }
  }

  function openDialog() {
    resetTransientState();
    setOpen(true);
  }

  async function handleAnalyze() {
    if (!eligibility.eligible || requestState === "pending" || pendingStartRequestIdRef.current !== null) {
      return;
    }

    const dialogGeneration = dialogGenerationRef.current;
    const requestId = ++startRequestIdRef.current;
    pendingStartRequestIdRef.current = requestId;

    setOpen(true);
    setRequestState("pending");
    setRequestError(null);
    setPollError(null);
    setPollTimedOut(false);
    pollerRef.current?.stop();
    pollerRef.current = null;

    try {
      const nextRun = await startBlueprintAnalysis(certificationId, resource.id);

      if (
        !mountedRef.current
        || dialogGenerationRef.current !== dialogGeneration
        || startRequestIdRef.current !== requestId
      ) {
        return;
      }

      setRun(nextRun);
      setRequestState("idle");
    } catch (error) {
      if (
        !mountedRef.current
        || dialogGenerationRef.current !== dialogGeneration
        || startRequestIdRef.current !== requestId
      ) {
        return;
      }

      setRequestState("idle");
      setRequestError(describeError(error, START_ANALYSIS_ERROR_MESSAGE));
    } finally {
      if (pendingStartRequestIdRef.current === requestId) {
        pendingStartRequestIdRef.current = null;
      }
    }
  }

  async function handleRetryStatusCheck() {
    if (pollerRef.current === null) {
      return;
    }

    setPollError(null);
    setPollTimedOut(false);
    await pollerRef.current.retry();
  }

  if (run !== null) {
    return (
      <>
        <Button
          type="button"
          variant="outline"
          onClick={openDialog}
          aria-label={`View analysis for ${resource.title}`}
        >
          View analysis
        </Button>
        <Dialog open={open} onOpenChange={handleDialogOpenChange}>
          <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
            <DialogHeader className="sr-only">
              <DialogTitle>{resource.title}</DialogTitle>
              <DialogDescription>Review the latest read-only AI blueprint analysis for this resource.</DialogDescription>
            </DialogHeader>
            <BlueprintAnalysisDetails
              resource={resource}
              run={run}
              requestState={requestState}
              requestError={requestError}
              pollError={pollError}
              pollTimedOut={pollTimedOut}
              onAnalyzeAgain={eligibility.eligible ? handleAnalyze : undefined}
              analyzeAgainDisabled={requestState === "pending"}
              onRetryStatusCheck={shouldPoll && (pollError !== null || pollTimedOut) ? handleRetryStatusCheck : undefined}
              retryStatusCheckDisabled={requestState === "pending"}
            />
          </DialogContent>
        </Dialog>
      </>
    );
  }

  if (!eligibility.eligible) {
    return (
      <div className="inline-flex flex-col items-end gap-1">
        <Button
          type="button"
          variant="outline"
          disabled
          aria-label={`Analyze ${resource.title}`}
          aria-describedby={reasonId}
        >
          Analyze
        </Button>
        <span id={reasonId} className="max-w-56 text-right text-xs text-muted-foreground">{eligibility.reason}</span>
      </div>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => void handleAnalyze()}
        disabled={requestState === "pending"}
        aria-label={`Analyze ${resource.title}`}
      >
        Analyze
      </Button>
      <Dialog open={open} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader className="sr-only">
            <DialogTitle>{resource.title}</DialogTitle>
            <DialogDescription>Review the latest read-only AI blueprint analysis for this resource.</DialogDescription>
          </DialogHeader>
          <BlueprintAnalysisDetails
            resource={resource}
            run={run}
            requestState={requestState}
            requestError={requestError}
            pollError={pollError}
            pollTimedOut={pollTimedOut}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
