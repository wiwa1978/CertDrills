"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type {
  CertDrillAdminCategory,
  CertDrillAdminResource,
  CertDrillQuestionGenerationJob,
} from "@/lib/api/certdrill.server";
import { createAsyncRunPoller } from "./async-run-poller";
import { getQuestionGenerationJob, startQuestionGeneration } from "./question-generation-client";

const POLL_TIMEOUT_MESSAGE = "Status check timed out. The job may still complete in the background.";

type Props = {
  certificationId: string;
  categories: CertDrillAdminCategory[];
  resources: CertDrillAdminResource[];
  defaultCategoryId?: string;
};

type DifficultyMix = { easy: number; medium: number; hard: number };
type GeneratedQuestionType = "single_choice" | "fill_blank" | "matching";

function isPolling(job: CertDrillQuestionGenerationJob | null) {
  return job?.status === "pending" || job?.status === "running";
}


function usableSource(resource: CertDrillAdminResource) {
  return resource.contentMode === "deep_content" && resource.status === "ingested" && Boolean(resource.ingestedAt);
}

export function QuestionGenerationControl({ certificationId, categories, resources, defaultCategoryId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const defaultCategory = categories.some((category) => category.id === defaultCategoryId) ? defaultCategoryId! : "";
  const deepContentResources = resources.filter((resource) => resource.contentMode === "deep_content");
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState(defaultCategory);
  const [resourceIds, setResourceIds] = useState<string[]>([]);
  const [sourceUrls, setSourceUrls] = useState([""]);
  const [requestedCount, setRequestedCount] = useState(5);
  const [focus, setFocus] = useState("");
  const [systemInstructions, setSystemInstructions] = useState("");
  const [instructions, setInstructions] = useState("");
  const [difficultyMix, setDifficultyMix] = useState<DifficultyMix>({ easy: 20, medium: 60, hard: 20 });
  const [questionTypes, setQuestionTypes] = useState<GeneratedQuestionType[]>(["single_choice", "fill_blank", "matching"]);
  const [deliveryPurpose, setDeliveryPurpose] = useState<"practice" | "assessment">("practice");
  const [requestPending, setRequestPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const pendingRequestRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);


  function toggleResource(resourceId: string, selected: boolean) {
    setResourceIds((current) => selected ? [...new Set([...current, resourceId])] : current.filter((id) => id !== resourceId));
  }

  function updateSourceUrl(index: number, value: string) {
    setSourceUrls((current) => current.map((url, currentIndex) => currentIndex === index ? value : url));
  }

  function updateDifficulty(key: keyof DifficultyMix, value: string) {
    const parsed = Number(value);
    setDifficultyMix((current) => ({ ...current, [key]: Number.isFinite(parsed) ? parsed : 0 }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRequestRef.current) return;
    const urls = sourceUrls.map((url) => url.trim()).filter(Boolean);
    if (resourceIds.length + urls.length === 0) {
      setError("Select an ingested source or add a source URL.");
      return;
    }
    if (difficultyMix.easy + difficultyMix.medium + difficultyMix.hard !== 100) {
      setError("Difficulty percentages must total 100.");
      return;
    }

    pendingRequestRef.current = true;
    setRequestPending(true);
    setError(null);
    try {
      const nextJob = await startQuestionGeneration(certificationId, {
        categoryId: categoryId || null,
        resourceIds,
        sourceUrls: urls,
        requestedCount,
        focus: focus.trim() || null,
        systemInstructions: systemInstructions.trim() || null,
        instructions: instructions.trim() || null,
        difficultyMix,
        questionTypes,
        deliveryPurpose,
      });
      if (mountedRef.current) {
        setOpen(false);
        const next = new URLSearchParams(searchParams.toString());
        next.set("tab", "questions");
        next.set("generationJob", nextJob.id);
        next.delete("generated");
        router.replace(`${pathname}?${next.toString()}`);
      }
    } catch (requestError) {
      if (mountedRef.current) setError(requestError instanceof Error ? requestError.message : "Question generation request failed.");
    } finally {
      pendingRequestRef.current = false;
      if (mountedRef.current) setRequestPending(false);
    }
  }

  const sourceCount = resourceIds.length + sourceUrls.filter((url) => url.trim()).length;
  const busy = requestPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">Generate Questions with AI</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Generate Questions with AI</DialogTitle>
          <DialogDescription>
            Select factual source material. Generated questions are saved as drafts for review and publishing.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question-generation-category">Category scope</Label>
              <select id="question-generation-category" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={categoryId} onChange={(event) => setCategoryId(event.currentTarget.value)} disabled={busy}>
                <option value="">All categories — AI assigns each question</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.code} - {category.name}</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-generation-purpose">Question type</Label>
              <select id="question-generation-purpose" className="h-9 w-full rounded-md border bg-transparent px-3 text-sm" value={deliveryPurpose} onChange={(event) => setDeliveryPurpose(event.currentTarget.value as "practice" | "assessment")} disabled={busy}>
                <option value="practice">Practice</option>
                <option value="assessment">Assessment</option>
              </select>
            </div>
          </div>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">Previously added sources</legend>
            {deepContentResources.length === 0 ? (
              <p className="text-sm text-muted-foreground">No deep-content sources have been added yet. Add a URL below.</p>
            ) : (
              <div className="max-h-44 space-y-2 overflow-y-auto rounded-md border p-3">
                {deepContentResources.map((resource) => {
                  const usable = usableSource(resource);
                  const selected = resourceIds.includes(resource.id);
                  return (
                    <label key={resource.id} className="flex items-start gap-3 text-sm">
                      <input type="checkbox" className="mt-1" checked={selected} onChange={(event) => toggleResource(resource.id, event.currentTarget.checked)} disabled={!usable || busy || (!selected && sourceCount >= 10)} />
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{resource.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{resource.url}</span>
                      </span>
                      <Badge variant={usable ? "outline" : "destructive"}>{usable ? "Ready" : resource.status ?? "Pending"}</Badge>
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <Label>New source URLs</Label>
              <Button type="button" size="sm" variant="outline" disabled={busy || sourceCount >= 10} onClick={() => setSourceUrls((current) => [...current, ""])}>Add URL</Button>
            </div>
            {sourceUrls.map((url, index) => (
              <div key={index} className="flex gap-2">
                <Input type="url" aria-label={`Source URL ${index + 1}`} placeholder="https://learn.microsoft.com/..." value={url} onChange={(event) => updateSourceUrl(index, event.currentTarget.value)} disabled={busy} />
                {sourceUrls.length > 1 ? <Button type="button" variant="outline" onClick={() => setSourceUrls((current) => current.filter((_, currentIndex) => currentIndex !== index))} disabled={busy}>Remove</Button> : null}
              </div>
            ))}
            <p className="text-xs text-muted-foreground">New public HTML or PDF URLs are ingested before the generation job is queued. Maximum 10 sources total.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="question-generation-count">Number of questions</Label>
              <Input id="question-generation-count" type="number" min={1} max={25} value={requestedCount} onChange={(event) => setRequestedCount(Number(event.currentTarget.value))} disabled={busy} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-generation-focus">Optional focus or topic</Label>
              <Input id="question-generation-focus" maxLength={500} value={focus} onChange={(event) => setFocus(event.currentTarget.value)} disabled={busy} placeholder="Identity governance" />
            </div>
          </div>

          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">Difficulty distribution</legend>
            <div className="grid grid-cols-3 gap-3">
              {(["easy", "medium", "hard"] as const).map((difficulty) => (
                <div key={difficulty} className="space-y-1">
                  <Label htmlFor={`question-generation-${difficulty}`} className="capitalize">{difficulty} %</Label>
                  <Input id={`question-generation-${difficulty}`} type="number" min={0} max={100} value={difficultyMix[difficulty]} onChange={(event) => updateDifficulty(difficulty, event.currentTarget.value)} />
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">Total: {difficultyMix.easy + difficultyMix.medium + difficultyMix.hard}%</p>
          </fieldset>
          <fieldset className="space-y-2" disabled={busy}>
            <legend className="text-sm font-medium">Question formats</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["single_choice", "Single choice"],
                ["fill_blank", "Fill in the gap"],
                ["matching", "Drag and drop matching"],
              ] as const).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <input
                    type="checkbox"
                    checked={questionTypes.includes(value)}
                    onChange={(event) => setQuestionTypes((current) => event.currentTarget.checked ? [...current, value] : current.filter((type) => type !== value))}
                    disabled={busy || (questionTypes.length === 1 && questionTypes.includes(value))}
                  />
                  {label}
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">AI distributes the batch across the selected formats as evenly as the requested count permits.</p>
          </fieldset>


          <div className="space-y-4 rounded-md border p-4">
            <div>
              <p className="text-sm font-medium">Prompt controls</p>
              <p className="text-xs text-muted-foreground">Optional instructions for this generation run. Core grounding, citation, correctness, and output-format rules remain enforced.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-generation-system-instructions">System prompt instructions</Label>
              <Textarea id="question-generation-system-instructions" maxLength={4000} value={systemInstructions} onChange={(event) => setSystemInstructions(event.currentTarget.value)} disabled={busy} placeholder="Use detailed answer choices and explain each option in 2–3 sentences." />
              <p className="text-xs text-muted-foreground">Controls style, detail, and global generation behavior.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="question-generation-instructions">User prompt instructions</Label>
              <Textarea id="question-generation-instructions" maxLength={2000} value={instructions} onChange={(event) => setInstructions(event.currentTarget.value)} disabled={busy} placeholder="Emphasize scenario-based troubleshooting for identity governance." />
              <p className="text-xs text-muted-foreground">Adds run-specific topic and content guidance.</p>
            </div>
          </div>

          {error ? <p role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || sourceCount === 0 || categories.length === 0}>{requestPending ? "Ingesting sources…" : "Generate drafts"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function QuestionGenerationStatusBanner({ initialJob }: { initialJob?: CertDrillQuestionGenerationJob }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.toString();
  const requestedJobId = searchParams.get("generationJob");
  const runId = requestedJobId ?? (initialJob && isPolling(initialJob) ? initialJob.id : null);
  const [polledJob, setPolledJob] = useState<CertDrillQuestionGenerationJob | null>(null);
  const [pollError, setPollError] = useState<{ runId: string; message: string } | null>(null);
  const [timedOutRunId, setTimedOutRunId] = useState<string | null>(null);
  const job = polledJob?.id === runId ? polledJob : initialJob?.id === runId ? initialJob : null;
  const error = pollError?.runId === runId ? pollError.message : null;
  const pollTimedOut = timedOutRunId === runId;
  const mountedRef = useRef(true);
  const pollerRef = useRef<ReturnType<typeof createAsyncRunPoller<CertDrillQuestionGenerationJob>> | null>(null);

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
    if (!runId) return;

    const poller = createAsyncRunPoller<CertDrillQuestionGenerationJob>({
      fetchRun: getQuestionGenerationJob,
      errorFallback: "Question generation status check failed.",
      onRun: (nextJob) => {
        if (!mountedRef.current) return;
        setPolledJob(nextJob);
        setPollError(null);
        setTimedOutRunId(null);
        if (nextJob.status === "completed") {
          const next = new URLSearchParams(searchQuery);
          next.set("tab", "questions");
          next.set("questionStatus", "draft");
          if (nextJob.categoryId) next.set("questionCategoryId", nextJob.categoryId);
          next.set("generated", String(nextJob.generatedCount ?? 0));
          next.delete("generationJob");
          next.delete("questionPage");
          router.replace(`${pathname}?${next.toString()}`);
          router.refresh();
        }
      },
      onError: (message) => setPollError({ runId, message }),
      onTimeout: () => setTimedOutRunId(runId),
    });
    pollerRef.current = poller;
    poller.start(runId);
    return () => {
      poller.stop();
      if (pollerRef.current === poller) pollerRef.current = null;
    };
  }, [pathname, router, runId, searchQuery]);

  if (!runId || job?.status === "completed") return null;
  if (job?.status === "failed") {
    return (
      <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
        <p className="font-medium">AI question generation failed.</p>
        {job.errorMessage ? <p className="mt-1">{job.errorMessage}</p> : null}
      </div>
    );
  }

  return (
    <div role="status" className="rounded-md border border-blue-600/40 bg-blue-600/10 p-3 text-sm">
      <p className="font-medium">Using AI to generate questions</p>
      <p className="mt-1 text-muted-foreground">The generated questions will appear here as drafts when they are ready.</p>
      {error ? <p role="alert" className="mt-2 text-destructive">{error}</p> : null}
      {pollTimedOut ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <p className="text-destructive">{POLL_TIMEOUT_MESSAGE}</p>
          <Button type="button" size="sm" variant="outline" onClick={() => void pollerRef.current?.retry()}>Check status again</Button>
        </div>
      ) : null}
    </div>
  );
}
