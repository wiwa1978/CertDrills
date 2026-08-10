"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CertDrillBlueprintCategoryProposal, CertDrillBlueprintParseRun } from "@/lib/api/certdrill.server";
import { createBlueprintRunPoller } from "@/modules/certdrill/blueprint-analysis";
import { formatCategoryWeight } from "@/modules/certdrill/category-weight";
import { getBlueprintAnalysisRun, startCategoryDiscovery } from "@/modules/certdrill/category-discovery-client";

const POLL_TIMEOUT_MESSAGE = "Status check timed out.";
const START_DISCOVERY_ERROR_MESSAGE = "Category discovery request failed.";

type RequestState = "idle" | "pending";

export type CategoryDiscoveryControlProps = {
  certificationId: string;
  defaultUrl?: string;
  initialRun?: CertDrillBlueprintParseRun;
};

function isPollingStatus(status: CertDrillBlueprintParseRun["status"]) {
  return status === "pending" || status === "running";
}

function describeError(error: unknown, fallback: string) {
  if (error instanceof Error) {
    const message = error.message.trim();
    if (message.length > 0) return message;
  }
  return fallback;
}

function statusLabel(status: CertDrillBlueprintParseRun["status"]) {
  switch (status) {
    case "pending":
      return "Queued";
    case "running":
      return "Finding categories";
    case "completed":
      return "Categories created";
    case "failed":
      return "Failed";
  }
}

export function formatBlueprintWeight(
  category: Pick<CertDrillBlueprintCategoryProposal, "weightPct" | "weightMinPct" | "weightMaxPct">,
) {
  const formattedWeight = formatCategoryWeight(category);
  return formattedWeight === "-" ? "Not provided" : formattedWeight;
}

export function CategoryDiscoveryDetails({ run }: { run: CertDrillBlueprintParseRun | null }) {
  if (!run) {
    return <p className="text-sm text-muted-foreground">Enter a study guide URL to start.</p>;
  }

  const warnings = run.proposalJson?.warnings ?? run.warningsJson;
  const categories = run.status === "completed" ? run.proposalJson?.categories ?? [] : [];

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={run.status === "failed" ? "destructive" : "outline"}>{statusLabel(run.status)}</Badge>
        {isPollingStatus(run.status) ? <span role="status" className="text-sm text-muted-foreground">The study guide is being analyzed.</span> : null}
      </div>

      {run.status === "completed" ? (
        <div role="status" className="rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm">
          The discovered categories are now in the database. Existing categories with matching codes were kept unchanged.
        </div>
      ) : null}

      {run.status === "failed" && run.errorMessage ? (
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {run.errorMessage}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Warnings</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </div>
      ) : null}

      {categories.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Discovered categories</h3>
          <Table aria-label="Discovered certification categories">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Blueprint code</TableHead>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Weight</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((category) => (
                <TableRow key={category.code}>
                  <TableCell className="font-medium">{category.code}</TableCell>
                  <TableCell>{category.name}</TableCell>
                  <TableCell>{formatBlueprintWeight(category)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}
    </div>
  );
}

export function CategoryDiscoveryControl({ certificationId, defaultUrl = "", initialRun }: CategoryDiscoveryControlProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(defaultUrl);
  const [run, setRun] = useState<CertDrillBlueprintParseRun | null>(initialRun ?? null);
  const [requestState, setRequestState] = useState<RequestState>("idle");
  const [requestError, setRequestError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [pollTimedOut, setPollTimedOut] = useState(false);
  const pollerRef = useRef<ReturnType<typeof createBlueprintRunPoller> | null>(null);
  const mountedRef = useRef(true);
  const refreshedRunIdRef = useRef<string | null>(null);
  const pendingRequestRef = useRef(false);
  const shouldPoll = open && run !== null && isPollingStatus(run.status);

  useEffect(() => {
    setRun(initialRun ?? null);
  }, [initialRun]);

  useEffect(() => {
    if (!open) setUrl(defaultUrl);
  }, [defaultUrl, open]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pollerRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    pollerRef.current?.stop();
    pollerRef.current = null;

    if (!shouldPoll || run === null) return;

    const poller = createBlueprintRunPoller({
      fetchRun: getBlueprintAnalysisRun,
      onRun: (nextRun) => {
        if (!mountedRef.current) return;
        setRun(nextRun);
        setPollError(null);
        setPollTimedOut(false);
        if (nextRun.status === "completed" && refreshedRunIdRef.current !== nextRun.id) {
          refreshedRunIdRef.current = nextRun.id;
          setOpen(false);
          router.refresh();
        }
      },
      onError: (message) => {
        if (mountedRef.current) setPollError(message);
      },
      onTimeout: () => {
        if (mountedRef.current) setPollTimedOut(true);
      },
    });

    pollerRef.current = poller;
    poller.start(run.id);

    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [router, run?.id, shouldPoll]);

  function resetTransientState() {
    setRequestError(null);
    setPollError(null);
    setPollTimedOut(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      pollerRef.current?.stop();
      pollerRef.current = null;
      resetTransientState();
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRequestRef.current) return;

    pendingRequestRef.current = true;
    setRequestState("pending");
    resetTransientState();
    pollerRef.current?.stop();
    pollerRef.current = null;

    try {
      const nextRun = await startCategoryDiscovery(certificationId, url);
      if (!mountedRef.current) return;
      setRun(nextRun);
    } catch (error) {
      if (mountedRef.current) setRequestError(describeError(error, START_DISCOVERY_ERROR_MESSAGE));
    } finally {
      pendingRequestRef.current = false;
      if (mountedRef.current) setRequestState("idle");
    }
  }

  async function handleRetryStatusCheck() {
    setPollError(null);
    setPollTimedOut(false);
    await pollerRef.current?.retry();
  }

  const requestPending = requestState === "pending";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button type="button">Find Categories with AI</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Find Categories with AI</DialogTitle>
          <DialogDescription>
            Enter the official study guide URL. AI will extract the certification categories and create any missing categories in the database.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <Label htmlFor="category-discovery-url">Study guide URL</Label>
            <Input
              id="category-discovery-url"
              name="url"
              type="url"
              required
              placeholder="https://learn.microsoft.com/..."
              value={url}
              onChange={(event) => setUrl(event.currentTarget.value)}
              disabled={requestPending}
            />
            <p className="text-xs text-muted-foreground">The URL must be publicly accessible HTML or PDF.</p>
          </div>
          <Button type="submit" disabled={requestPending || url.trim().length === 0}>
            {requestPending ? "Starting..." : "Find categories"}
          </Button>
        </form>

        {requestError ? <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{requestError}</div> : null}
        {pollError ? <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{pollError}</div> : null}
        {pollTimedOut ? <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{POLL_TIMEOUT_MESSAGE}</div> : null}

        <CategoryDiscoveryDetails run={run} />

        {shouldPoll && (pollError !== null || pollTimedOut) ? (
          <Button type="button" variant="outline" onClick={() => void handleRetryStatusCheck()} disabled={requestPending}>
            Retry status check
          </Button>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
