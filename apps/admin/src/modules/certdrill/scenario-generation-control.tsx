"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CertDrillAdminResource, CertDrillScenarioGenerationJob } from "@/lib/api/certdrill.server";
import { createAsyncRunPoller } from "./async-run-poller";
import { getScenarioGenerationJob, startScenarioGeneration } from "./scenario-generation-client";

const POLL_TIMEOUT_MESSAGE = "Status check timed out. The job may still complete in the background.";

function usableSource(resource: CertDrillAdminResource) {
  return resource.contentMode === "deep_content" && resource.status === "ingested" && Boolean(resource.ingestedAt);
}
function isPolling(job?: CertDrillScenarioGenerationJob | null) {
  return job?.status === "pending" || job?.status === "running";
}

type ControlProps = {
  certificationId: string;
  resources: CertDrillAdminResource[];
  onJobStarted?: (job: CertDrillScenarioGenerationJob) => void;
};

export function ScenarioGenerationControl({ certificationId, resources, onJobStarted }: ControlProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const deepContentResources = resources.filter((resource) => resource.contentMode === "deep_content");
  const [open, setOpen] = useState(false);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [sourceUrls, setSourceUrls] = useState([""]);
  const [requestedCount, setRequestedCount] = useState(1);
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [focus, setFocus] = useState("");
  const [instructions, setInstructions] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const dialogId = `scenario-${certificationId}-generation-dialog`;
  const requestRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const sourceCount = resourceIds.length + sourceUrls.filter((url) => url.trim()).length;
  function toggleResource(id: string, checked: boolean) {
    setResourceIds((current) => checked ? [...new Set([...current, id])] : current.filter((value) => value !== id));
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (requestRef.current) return;
    const urls = sourceUrls.map((url) => url.trim()).filter(Boolean);
    if (resourceIds.length + urls.length === 0) { setError("Select an ingested source or add a source URL."); return; }
    requestRef.current = true;
    setPending(true);
    setError(null);
    try {
      const job = await startScenarioGeneration(certificationId, {
        resourceIds,
        sourceUrls: urls,
        requestedCount,
        difficulty,
        focus: focus.trim() || null,
        instructions: instructions.trim() || null,
      });
      if (mountedRef.current) {
        onJobStarted?.(job);
        setOpen(false);
        const next = new URLSearchParams(searchParams.toString());
        next.set("tab", "scenarios");
        next.set("scenarioGenerationJob", job.id);
        next.delete("scenariosGenerated");
        router.replace(`${pathname}?${next.toString()}`);
      }
    } catch (cause) {
      if (mountedRef.current) setError(cause instanceof Error ? cause.message : "Scenario generation request failed.");
    } finally {
      requestRef.current = false;
      if (mountedRef.current) setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button type="button" aria-controls={dialogId} variant="secondary">Generate Scenarios with AI</Button></DialogTrigger>
      <DialogContent id={dialogId} className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate Scenarios with AI</DialogTitle>
          <DialogDescription>Select grounded source material. Generated branching scenarios are saved as Drafts for your review and validation.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={submit}>
          <fieldset className="space-y-2" disabled={pending}>
            <legend className="text-sm font-medium">Previously added sources</legend>
            {deepContentResources.length === 0 ? <p className="text-sm text-muted-foreground">No deep-content sources have been added yet. Add a URL below.</p> : (
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
                {deepContentResources.map((resource) => {
                  const usable = usableSource(resource);
                  const selected = resourceIds.includes(resource.id);
                  return <label key={resource.id} className="flex items-start gap-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={selected} onChange={(event) => toggleResource(resource.id, event.currentTarget.checked)} disabled={!usable || (!selected && sourceCount >= 10)} />
                    <span className="min-w-0 flex-1"><span className="block font-medium">{resource.title}</span><span className="block truncate text-xs text-muted-foreground">{resource.url}</span></span>
                    <Badge variant={usable ? "outline" : "destructive"}>{usable ? "Ready" : resource.status ?? "Pending"}</Badge>
                  </label>;
                })}
              </div>
            )}
          </fieldset>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3"><Label>New source URLs</Label><Button type="button" size="sm" variant="outline" disabled={pending || sourceCount >= 10} onClick={() => setSourceUrls((current) => [...current, ""])}>Add URL</Button></div>
            {sourceUrls.map((url, index) => <div key={index} className="flex gap-2">
              <Input type="url" aria-label={`Scenario source URL ${index + 1}`} placeholder="https://learn.microsoft.com/..." value={url} onChange={(event) => setSourceUrls((current) => current.map((value, currentIndex) => currentIndex === index ? event.currentTarget.value : value))} disabled={pending} />
              {sourceUrls.length > 1 ? <Button type="button" variant="outline" disabled={pending} onClick={() => setSourceUrls((current) => current.filter((_, currentIndex) => currentIndex !== index))}>Remove</Button> : null}
            </div>)}
            <p className="text-xs text-muted-foreground">New public HTML or PDF URLs are ingested before the generation job is queued. Maximum 10 sources total.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="scenario-generation-count">Number of scenarios</Label><Input id="scenario-generation-count" type="number" min={1} max={10} value={requestedCount} onChange={(event) => setRequestedCount(Number(event.currentTarget.value))} disabled={pending} required /></div>
            <div className="space-y-2"><Label htmlFor="scenario-generation-difficulty">Difficulty</Label><select id="scenario-generation-difficulty" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={difficulty} onChange={(event) => setDifficulty(event.currentTarget.value as typeof difficulty)} disabled={pending}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
          </div>
          <div className="space-y-2"><Label htmlFor="scenario-generation-focus">Optional focus or topic</Label><Input id="scenario-generation-focus" maxLength={500} value={focus} onChange={(event) => setFocus(event.currentTarget.value)} disabled={pending} placeholder="Identity governance incident response" /></div>
          <div className="space-y-2"><Label htmlFor="scenario-generation-instructions">Optional additional instructions</Label><Textarea id="scenario-generation-instructions" maxLength={2000} value={instructions} onChange={(event) => setInstructions(event.currentTarget.value)} disabled={pending} placeholder="Emphasize tradeoffs between containment and business continuity." /></div>
          {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={pending || sourceCount === 0}>{pending ? "Ingesting sources…" : "Generate Drafts"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ScenarioGenerationStatusBanner({ initialJob }: { initialJob?: CertDrillScenarioGenerationJob }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const requestedId = searchParams.get("scenarioGenerationJob");
  const runId = requestedId ?? (isPolling(initialJob) ? initialJob!.id : null);
  const [polled, setPolled] = useState<CertDrillScenarioGenerationJob | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const mountedRef = useRef(true);
  const pollerRef = useRef<ReturnType<typeof createAsyncRunPoller<CertDrillScenarioGenerationJob>> | null>(null);
  const job = polled?.id === runId ? polled : initialJob?.id === runId ? initialJob : null;

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; pollerRef.current?.stop(); };
  }, []);
  useEffect(() => {
    pollerRef.current?.stop();
    if (!runId) return;
    const poller = createAsyncRunPoller<CertDrillScenarioGenerationJob>({
      fetchRun: getScenarioGenerationJob,
      errorFallback: "Scenario generation status check failed.",
      onRun: (nextJob) => {
        if (!mountedRef.current) return;
        setPolled(nextJob); setPollError(null); setTimedOut(false);
        if (nextJob.status === "completed") {
          const next = new URLSearchParams(searchQuery);
          next.set("tab", "scenarios");
          next.set("scenariosGenerated", String(nextJob.generatedCount ?? 0));
          next.delete("scenarioGenerationJob");
          router.replace(`${pathname}?${next.toString()}`);
          router.refresh();
        }
      },
      onError: setPollError,
      onTimeout: () => setTimedOut(true),
    });
    pollerRef.current = poller;
    poller.start(runId);
    return () => { poller.stop(); if (pollerRef.current === poller) pollerRef.current = null; };
  }, [pathname, router, runId, searchQuery]);

  if (!runId || job?.status === "completed") return null;
  if (job?.status === "failed") return <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"><p className="font-medium">AI scenario generation failed.</p>{job.errorMessage ? <p className="mt-1">{job.errorMessage}</p> : null}</div>;
  return <div role="status" className="rounded-md border border-blue-600/40 bg-blue-600/10 p-3 text-sm"><p className="font-medium">Using AI to generate scenarios</p><p className="mt-1 text-muted-foreground">The generated scenarios will appear here as Drafts when they are ready.</p>{pollError ? <p role="alert" className="mt-2 text-destructive">{pollError}</p> : null}{timedOut ? <div className="mt-2 flex flex-wrap items-center gap-2"><p className="text-destructive">{POLL_TIMEOUT_MESSAGE}</p><Button type="button" size="sm" variant="outline" onClick={() => void pollerRef.current?.retry()}>Check status again</Button></div> : null}</div>;
}
