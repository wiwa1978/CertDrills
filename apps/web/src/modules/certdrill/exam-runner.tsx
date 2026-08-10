"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, useTransition, type DragEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnswerCertDrillQuestionResponse, CertDrillConfidence, CertDrillQuestionResponse, CertDrillResumeExamAttemptResponse, CertDrillScenarioDecision, CreateCertDrillExamAttemptResponse } from "@platform/contracts";

import { answerCertDrillQuestion, answerCertDrillScenario, submitCertDrillAttempt } from "@/lib/api/certdrill";
import { cn } from "@/lib/utils";

import { ActionButton, CategoryTag, CertDrillShell, StampBox } from "./components";

export const CERTDRILL_ATTEMPT_STORAGE_PREFIX = "certdrill:attempt:";

type AttemptQuestion = CreateCertDrillExamAttemptResponse["questions"][number];
type ResumableAttempt = CreateCertDrillExamAttemptResponse | CertDrillResumeExamAttemptResponse;

export function ExamRunnerFromSession({ attemptId, resumeAttempt }: { attemptId: string; resumeAttempt?: CertDrillResumeExamAttemptResponse }) {
  const attempt = useSyncExternalStore(
    subscribeToAttemptStorage,
    () => readStoredAttempt(attemptId),
    () => undefined,
  );
  const runnerAttempt = resolveAttemptForRunner(attempt, resumeAttempt);

  if (!runnerAttempt && attempt === undefined) {
    return (
      <CertDrillShell>
        <div className="rounded border border-border bg-card p-6 text-muted-foreground">Loading exam attempt...</div>
      </CertDrillShell>
    );
  }

  if (!runnerAttempt) {
    return <ExamRunnerFallback />;
  }

  return <ExamRunner attempt={runnerAttempt} />;
}

export function ExamRunnerFallback() {
  return (
    <CertDrillShell>
      <div className="max-w-xl rounded border border-border bg-card p-6">
        <h1 className="text-2xl font-semibold text-foreground">Start an exam from the certification page.</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Attempt question payloads are created client-side. Open a certification, choose a mode, and start a fresh attempt.
        </p>
        <Link href="/exams" className="mt-5 inline-flex text-sm font-semibold text-primary hover:opacity-80">
          Back to exams
        </Link>
      </div>
    </CertDrillShell>
  );
}

export function ExamRunner({ attempt }: { attempt: ResumableAttempt }) {
  const router = useRouter();
  const initialQuestionIndex = getResumeQuestionIndex(attempt);
  const initialSelection = getResumeSelection(attempt, initialQuestionIndex);
  const scenarios = attempt.scenarios ?? [];
  const questionsComplete = areQuestionsComplete(attempt);
  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex);
  const [scenarioIndex, setScenarioIndex] = useState(questionsComplete ? getResumeScenarioIndex(attempt) : -1);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialSelection.selectedOptionId);
  const [textAnswer, setTextAnswer] = useState(initialSelection.response?.type === "fill_blank" ? initialSelection.response.text : "");
  const [matches, setMatches] = useState<Record<string, string>>(() => initialSelection.response?.type === "matching" ? Object.fromEntries(initialSelection.response.matches.map((match) => [match.promptId, match.targetId])) : {});
  const [confidence, setConfidence] = useState<CertDrillConfidence>(initialSelection.confidence);
  const [feedback, setFeedback] = useState<AnswerCertDrillQuestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const autoSubmittedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const question = scenarioIndex < 0 ? attempt.questions[questionIndex] : undefined;
  const scenario = scenarioIndex >= 0 ? scenarios[scenarioIndex] : undefined;
  const isPractice = (attempt.testMode ?? attempt.feedbackMode) === "practice";
  const isLastQuestion = questionIndex === attempt.questions.length - 1;
  const expiresAtMs = attempt.expiresAt ? Date.parse(attempt.expiresAt) : null;
  const remainingMs = expiresAtMs ? Math.max(0, expiresAtMs - now) : null;
  const isExpired = remainingMs === 0;

  async function finishAttempt() {
    await finishCertDrillAttempt(attempt.attemptId, router);
  }

  const finishExpiredAttempt = useEffectEvent(async () => {
    await finishCertDrillAttempt(attempt.attemptId, router);
  });

  useEffect(() => {
    const nextQuestionIndex = getResumeQuestionIndex(attempt);
    const nextSelection = getResumeSelection(attempt, nextQuestionIndex);
    setQuestionIndex(nextQuestionIndex);
    setSelectedOptionId(nextSelection.selectedOptionId);
    setTextAnswer(nextSelection.response?.type === "fill_blank" ? nextSelection.response.text : "");
    setMatches(nextSelection.response?.type === "matching" ? Object.fromEntries(nextSelection.response.matches.map((match) => [match.promptId, match.targetId])) : {});
    setConfidence(nextSelection.confidence);
    setFeedback(null);
    setScenarioIndex(areQuestionsComplete(attempt) ? getResumeScenarioIndex(attempt) : -1);
  }, [attempt]);

  useEffect(() => {
    if (!expiresAtMs) {
      return;
    }

    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [expiresAtMs]);

  useEffect(() => {
    if (!expiresAtMs || remainingMs !== 0 || autoSubmittedRef.current) {
      return;
    }

    autoSubmittedRef.current = true;
    startTransition(async () => {
      try {
        await finishExpiredAttempt();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Time expired, but the attempt could not be submitted.");
      }
    });
  }, [expiresAtMs, finishExpiredAttempt, remainingMs]);

  if (scenario) {
    return <ScenarioExamItem attempt={attempt} scenario={scenario} scenarioIndex={scenarioIndex} remainingMs={remainingMs} isExpired={isExpired} onComplete={() => {
      if (scenarioIndex === scenarios.length - 1) return finishAttempt();
      setScenarioIndex((current) => current + 1);
    }} />;
  }

  if (!question) {
    return (
      <CertDrillShell>
        <div className="rounded border border-border bg-card p-6 text-muted-foreground">
          This attempt does not contain any questions.
        </div>
      </CertDrillShell>
    );
  }

  function selectOption(optionId: string) {
    if (isPending || isExpired || (isPractice && feedback)) {
      return;
    }

    setSelectedOptionId(optionId);
    if (!isPractice) submitAnswer({ type: "single_choice", selectedOptionId: optionId });
  }

  function currentResponse(): CertDrillQuestionResponse | null {
    if (!question) return null;
    if (question.questionType === "single_choice") return selectedOptionId ? { type: "single_choice", selectedOptionId } : null;
    if (question.questionType === "fill_blank") return textAnswer.trim() ? { type: "fill_blank", text: textAnswer } : null;
    if (question.interaction?.type !== "matching") return null;
    const responseMatches = question.interaction.prompts.map((prompt) => ({ promptId: prompt.id, targetId: matches[prompt.id] })).filter((match): match is { promptId: string; targetId: string } => Boolean(match.targetId));
    return responseMatches.length === question.interaction.prompts.length ? { type: "matching", matches: responseMatches } : null;
  }

  function submitAnswer(explicitResponse?: CertDrillQuestionResponse) {
    const response = explicitResponse ?? currentResponse();
    if (!response || !question) return;

    setError(null);
    startTransition(async () => {
      try {
        const answerInput = { questionId: question.id, ...response, ...(attempt.confidenceEnabled ? { confidence } : {}) };
        const result = await answerCertDrillQuestion(attempt.attemptId, answerInput);
        if (isPractice) {
          setFeedback(result);
          return;
        }

        if (isLastQuestion) {
          if (scenarios.length > 0) setScenarioIndex(getResumeScenarioIndex(attempt));
          else await finishAttempt();
        } else {
          moveNext();
        }
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not submit this answer.");
      }
    });
  }

  function moveNext() {
    const nextQuestionIndex = questionIndex + 1;
    const nextSelection = getResumeSelection(attempt, nextQuestionIndex);
    setQuestionIndex(nextQuestionIndex);
    setSelectedOptionId(nextSelection.selectedOptionId);
    setTextAnswer(nextSelection.response?.type === "fill_blank" ? nextSelection.response.text : "");
    setMatches(nextSelection.response?.type === "matching" ? Object.fromEntries(nextSelection.response.matches.map((match) => [match.promptId, match.targetId])) : {});
    setConfidence(nextSelection.confidence);
    setFeedback(null);
  }

  function continuePractice() {
    if (!feedback) {
      return;
    }

    if (isLastQuestion) {
      if (scenarios.length > 0) {
        setScenarioIndex(getResumeScenarioIndex(attempt));
      } else {
        setError(null);
        startTransition(async () => {
          try { await finishAttempt(); }
          catch (caught) { setError(caught instanceof Error ? caught.message : "Could not submit this attempt."); }
        });
      }
    } else {
      moveNext();
    }
  }

  const totalItems = attempt.questions.length + scenarios.length;
  const percentComplete = Math.round(((questionIndex + 1) / totalItems) * 100);

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "attempt", value: attempt.attemptId.slice(0, 8) }, { label: "mode", value: testModeLabel(attempt.testMode ?? attempt.feedbackMode) }, { label: "variant", value: testVariantLabel(attempt.testVariant, attempt.examFormName) }]} />
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          <span>Question <b className="text-foreground">{questionIndex + 1}</b> / {totalItems}</span>
          {remainingMs === null ? (
            <span>{percentComplete}%</span>
          ) : (
            <span role="timer" aria-live="polite">Time left {formatRemainingTime(remainingMs)}</span>
          )}
        </div>
        <div className="flex gap-1">
          {[...attempt.questions, ...scenarios].map((item, index) => (
            <div key={item.id} className={cn("h-1 flex-1 rounded", index < questionIndex && "bg-primary", index === questionIndex && "bg-foreground", index > questionIndex && "bg-border")} />
          ))}
        </div>
      </div>

      <article className="rounded border border-border bg-card p-5 md:p-7">
        <div className="mb-4 flex flex-wrap gap-2">
          <CategoryTag tone="accent">{question.category.code}</CategoryTag>
          <CategoryTag>{question.category.name}</CategoryTag>
        </div>
        <p className="text-base leading-7 text-foreground">{question.stem}</p>
        {attempt.confidenceEnabled ? (
          <div className="mt-5 rounded border border-border bg-muted p-4">
            <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">Confidence</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {confidenceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={confidence === option.value}
                  disabled={isPending || isExpired || Boolean(feedback)}
                  onClick={() => setConfidence(option.value)}
                  className={cn(
                    "rounded border px-3 py-2 text-sm text-foreground transition disabled:cursor-not-allowed disabled:opacity-60",
                    confidence === option.value ? "border-primary bg-primary/10" : "border-border hover:border-primary"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {question.questionType === "single_choice" ? (
          <div className="mt-6 space-y-3">
            {question.options.map((option, index) => (
              <OptionButton key={option.id} option={option} label={String.fromCharCode(65 + index)} selected={selectedOptionId === option.id} feedback={feedback} onClick={() => selectOption(option.id)} />
            ))}
          </div>
        ) : question.questionType === "fill_blank" ? (
          <div className="mt-6 space-y-2">
            <label htmlFor="fill-blank-answer" className="text-sm font-semibold text-foreground">Your answer</label>
            <input id="fill-blank-answer" value={textAnswer} onChange={(event) => setTextAnswer(event.currentTarget.value)} disabled={isPending || isExpired || Boolean(feedback)} className="w-full rounded border border-border bg-background px-3 py-2 text-foreground" autoComplete="off" />
            <p className="text-xs text-muted-foreground">Capitalization and repeated whitespace are ignored.</p>
          </div>
        ) : question.interaction?.type === "matching" ? (
          <MatchingQuestion interaction={question.interaction} matches={matches} onChange={setMatches} disabled={isPending || isExpired || Boolean(feedback)} />
        ) : null}

        {isPractice && feedback && "isCorrect" in feedback ? (
          <div className={cn("mt-5 rounded border p-4 text-sm leading-6", feedback.isCorrect ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400" : "border-destructive bg-destructive/10 text-destructive")}>
            <p className="font-mono text-xs uppercase tracking-[0.08em]">{feedback.isCorrect ? "Correct" : "Review"}</p>
            <p className="mt-2">{feedback.explanation}</p>
            {!feedback.isCorrect ? <p className="mt-2">Correct answer: {feedback.correctAnswer}</p> : null}
          </div>
        ) : null}

        {isExpired ? <p className="mt-5 rounded border border-primary bg-primary/10 p-3 text-sm text-primary">Time expired. Submitting your recorded answers...</p> : null}
        {error ? <p className="mt-5 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        {isPractice ? (
          <div className="mt-6 flex justify-end">
            {feedback ? (
              <ActionButton onClick={continuePractice} disabled={isPending}>{isLastQuestion ? "Submit exam" : "Next question"}</ActionButton>
            ) : (
              <ActionButton onClick={() => submitAnswer()} disabled={!currentResponse() || isPending || isExpired}>{isPending ? "Checking..." : "Check answer"}</ActionButton>
            )}
          </div>
        ) : question.questionType !== "single_choice" ? (
          <div className="mt-6 flex justify-end"><ActionButton onClick={() => submitAnswer()} disabled={!currentResponse() || isPending || isExpired}>{isPending ? "Saving..." : "Submit answer"}</ActionButton></div>
        ) : null}
      </article>
    </CertDrillShell>
  );
}
type MatchingInteraction = Extract<NonNullable<AttemptQuestion["interaction"]>, { type: "matching" }>;

function MatchingQuestion({ interaction, matches, onChange, disabled }: { interaction: MatchingInteraction; matches: Record<string, string>; onChange: (value: Record<string, string>) => void; disabled: boolean }) {
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const targetById = new Map(interaction.targets.map((target) => [target.id, target]));
  const assignedTargets = new Set(Object.values(matches));

  function assign(promptId: string, targetId: string) {
    if (disabled) return;
    const next = Object.fromEntries(Object.entries(matches).filter(([, assignedTargetId]) => assignedTargetId !== targetId));
    next[promptId] = targetId;
    onChange(next);
    setSelectedTargetId(null);
  }

  function drop(event: DragEvent<HTMLDivElement>, promptId: string) {
    event.preventDefault();
    const targetId = event.dataTransfer.getData("text/certdrill-target");
    if (targetById.has(targetId)) assign(promptId, targetId);
  }

  return (
    <div className="mt-6 space-y-5">
      <div>
        <p className="text-sm font-semibold text-foreground">Targets</p>
        <p className="mt-1 text-xs text-muted-foreground">Drag a target onto a prompt, or select a target and then select its prompt.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {interaction.targets.filter((target) => !assignedTargets.has(target.id)).map((target) => (
            <button key={target.id} type="button" draggable={!disabled} disabled={disabled} aria-pressed={selectedTargetId === target.id} onDragStart={(event) => event.dataTransfer.setData("text/certdrill-target", target.id)} onClick={() => setSelectedTargetId(target.id)} className={cn("cursor-grab rounded border bg-background px-3 py-2 text-sm text-foreground", selectedTargetId === target.id ? "border-primary bg-primary/10" : "border-border", "disabled:cursor-not-allowed disabled:opacity-60")}>{target.text}</button>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        {interaction.prompts.map((prompt) => {
          const target = matches[prompt.id] ? targetById.get(matches[prompt.id]!) : undefined;
          return (
            <div key={prompt.id} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="rounded border border-border bg-muted p-3 text-sm text-foreground">{prompt.text}</div>
              <div role="button" tabIndex={disabled ? -1 : 0} onDragOver={(event) => event.preventDefault()} onDrop={(event) => drop(event, prompt.id)} onClick={() => { if (selectedTargetId) assign(prompt.id, selectedTargetId); }} onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && selectedTargetId) assign(prompt.id, selectedTargetId); }} className={cn("min-h-12 rounded border border-dashed p-3 text-sm", target ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground", !disabled && "cursor-pointer hover:border-primary")}>
                {target ? <span className="flex items-center justify-between gap-2"><span>{target.text}</span><button type="button" disabled={disabled} onClick={(event) => { event.stopPropagation(); const next = { ...matches }; delete next[prompt.id]; onChange(next); }} className="text-xs text-primary">Remove</button></span> : "Drop matching target here"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AttemptScenario = NonNullable<ResumableAttempt["scenarios"]>[number];

function ScenarioExamItem({ attempt, scenario, scenarioIndex, remainingMs, isExpired, onComplete }: { attempt: ResumableAttempt; scenario: AttemptScenario; scenarioIndex: number; remainingMs: number | null; isExpired: boolean; onComplete: () => void | Promise<void> }) {
  const [nodeKey, setNodeKey] = useState(scenario.initialNodeKey);
  const [decisions, setDecisions] = useState<CertDrillScenarioDecision[]>([]);
  const [consequence, setConsequence] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const node = scenario.nodes.find((item) => item.key === nodeKey);
  const totalItems = attempt.questions.length + (attempt.scenarios?.length ?? 0);
  const itemIndex = attempt.questions.length + scenarioIndex;
  const percentComplete = Math.round(((itemIndex + 1) / totalItems) * 100);

  if (!node) return <ExamRunnerFallback />;
  const activeNode = node;

  function chooseOption(option: AttemptScenario["nodes"][number]["options"][number]) {
    if (isPending || isExpired) return;
    const nextDecisions = [...decisions, { nodeKey: activeNode.key, optionKey: option.key }];
    setDecisions(nextDecisions);
    setConsequence(option.consequence);
    if (option.nextNodeKey) {
      setNodeKey(option.nextNodeKey);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await answerCertDrillScenario(attempt.attemptId, { scenarioId: scenario.id, decisions: nextDecisions });
        await onComplete();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not submit this scenario.");
      }
    });
  }

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "attempt", value: attempt.attemptId.slice(0, 8) }, { label: "mode", value: "Exam" }, { label: "variant", value: testVariantLabel(attempt.testVariant, attempt.examFormName) }]} />
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          <span>Scenario <b className="text-foreground">{scenarioIndex + 1}</b> / {attempt.scenarios?.length ?? 0}</span>
          {remainingMs === null ? <span>{percentComplete}%</span> : <span role="timer" aria-live="polite">Time left {formatRemainingTime(remainingMs)}</span>}
        </div>
        <div className="flex gap-1">{Array.from({ length: totalItems }, (_, index) => <div key={index} className={cn("h-1 flex-1 rounded", index < itemIndex && "bg-primary", index === itemIndex && "bg-foreground", index > itemIndex && "bg-border")} />)}</div>
      </div>
      <article className="rounded border border-border bg-card p-5 md:p-7">
        <div className="mb-4 flex flex-wrap gap-2"><CategoryTag tone="accent">Scored scenario</CategoryTag><CategoryTag>{scenario.difficulty}</CategoryTag></div>
        <h1 className="text-xl font-semibold text-foreground">{scenario.title}</h1>
        <h2 className="mt-6 font-semibold text-foreground">{node.title}</h2>
        <p className="mt-2 text-base leading-7 text-foreground">{node.situation}</p>
        {node.evidence.length > 0 ? <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">{node.evidence.map((item) => <li key={item}>{item}</li>)}</ul> : null}
        {consequence ? <div className="mt-5 rounded border border-primary bg-primary/10 p-4 text-sm text-primary"><span className="font-semibold">Previous consequence:</span> {consequence}</div> : null}
        <div className="mt-6 space-y-3">{node.options.map((option, index) => <button key={option.key} type="button" disabled={isPending || isExpired} onClick={() => chooseOption(option)} className="flex w-full items-start gap-3 rounded border border-border bg-muted p-3 text-left text-sm leading-6 text-foreground transition hover:border-primary disabled:opacity-60"><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground">{String.fromCharCode(65 + index)}</span><span><span className="block font-semibold">{option.title}</span>{option.description}</span></button>)}</div>
        {isPending ? <p className="mt-5 text-sm text-muted-foreground">Saving scenario response…</p> : null}
        {error ? <p className="mt-5 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}
      </article>
    </CertDrillShell>
  );
}


const confidenceOptions: Array<{ value: CertDrillConfidence; label: string }> = [
  { value: "guessed", label: "Guessed" },
  { value: "somewhat_sure", label: "Somewhat sure" },
  { value: "confident", label: "Confident" },
];

function formatRemainingTime(milliseconds: number) {
  const totalSeconds = Math.ceil(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function testModeLabel(testMode: string) {
  return testMode === "exam" ? "Exam" : "Practice";
}

function testVariantLabel(testVariant: string | undefined, examFormName?: string) {
  switch (testVariant) {
    case "category_drill":
      return "Category Drill";
    case "exam_form":
      return examFormName ?? "Exam Form";
    case "exam_simulation":
      return "Exam Simulation";
    case "missed_review":
      return "Missed Questions Review";
    case "weak_areas":
      return "Weak Areas Drill";
    case "quick_drill":
    default:
      return "Quick Drill";
  }
}

function finishCertDrillAttempt(attemptId: string, router: ReturnType<typeof useRouter>) {
  return submitCertDrillAttempt(attemptId).then(() => {
    sessionStorage.removeItem(`${CERTDRILL_ATTEMPT_STORAGE_PREFIX}${attemptId}`);
    router.push(`/exams/${attemptId}/results`);
  });
}

type StoredAttempt = CreateCertDrillExamAttemptResponse | null | undefined;
let storedAttemptCache: { key: string; value: string | null; parsed: StoredAttempt } | null = null;

function readStoredAttempt(attemptId: string): StoredAttempt {
  if (typeof window === "undefined") {
    return undefined;
  }

  const key = `${CERTDRILL_ATTEMPT_STORAGE_PREFIX}${attemptId}`;
  const stored = window.sessionStorage.getItem(key);
  if (storedAttemptCache?.key === key && storedAttemptCache.value === stored) {
    return storedAttemptCache.parsed;
  }

  let parsed: StoredAttempt = null;
  if (stored) {
    try {
      const attempt = JSON.parse(stored) as CreateCertDrillExamAttemptResponse;
      parsed = attempt.attemptId === attemptId ? attempt : null;
    } catch {
      parsed = null;
    }
  }

  storedAttemptCache = { key, value: stored, parsed };
  return parsed;
}

function subscribeToAttemptStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

export function getResumeQuestionIndex(attempt: ResumableAttempt) {
  const answeredQuestionIds = new Set(("recordedAnswers" in attempt ? attempt.recordedAnswers : []).map((answer) => answer.questionId));
  const firstUnansweredIndex = attempt.questions.findIndex((question) => !answeredQuestionIds.has(question.id));

  if (firstUnansweredIndex >= 0) {
    return firstUnansweredIndex;
  }

  return Math.max(0, attempt.questions.length - 1);
}

function areQuestionsComplete(attempt: ResumableAttempt) {
  if (attempt.questions.length === 0) return true;
  if (!("recordedAnswers" in attempt)) return false;
  const answered = new Set(attempt.recordedAnswers.map((answer) => answer.questionId));
  return attempt.questions.every((question) => answered.has(question.id));
}

export function getResumeScenarioIndex(attempt: ResumableAttempt) {
  const completed = new Set(("recordedScenarioResponses" in attempt ? attempt.recordedScenarioResponses ?? [] : []).map((response) => response.scenarioId));
  const scenarios = attempt.scenarios ?? [];
  const firstPending = scenarios.findIndex((scenario) => !completed.has(scenario.id));
  return firstPending >= 0 ? firstPending : Math.max(0, scenarios.length - 1);
}

export function getResumeSelection(attempt: ResumableAttempt, questionIndex: number): { selectedOptionId: string | null; response?: CertDrillQuestionResponse; confidence: CertDrillConfidence } {
  const questionId = attempt.questions[questionIndex]?.id;
  const recordedAnswer = questionId && "recordedAnswers" in attempt
    ? attempt.recordedAnswers.find((answer) => answer.questionId === questionId)
    : undefined;
  const response = recordedAnswer?.response ?? (recordedAnswer?.selectedOptionId ? { type: "single_choice" as const, selectedOptionId: recordedAnswer.selectedOptionId } : undefined);
  return {
    selectedOptionId: response?.type === "single_choice" ? response.selectedOptionId : null,
    ...(response ? { response } : {}),
    confidence: recordedAnswer?.confidence ?? "somewhat_sure",
  };
}

export function resolveAttemptForRunner(storedAttempt: StoredAttempt, resumeAttempt?: CertDrillResumeExamAttemptResponse): ResumableAttempt | null | undefined {
  return resumeAttempt ?? storedAttempt;
}

function OptionButton({ feedback, label, onClick, option, selected }: { feedback: AnswerCertDrillQuestionResponse | null; label: string; onClick: () => void; option: AttemptQuestion["options"][number]; selected: boolean }) {
  const correct = feedback && "correctOption" in feedback && feedback.correctOption?.id === option.id;
  const incorrect = feedback && "selectedOptionFeedback" in feedback && feedback.selectedOptionFeedback?.id === option.id && !feedback.isCorrect;

  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "flex w-full items-start gap-3 rounded border border-border bg-muted p-3 text-left text-sm leading-6 text-foreground transition hover:border-primary",
        selected && "border-primary bg-primary/10",
        correct && "border-green-600 bg-green-600/10",
        incorrect && "border-destructive bg-destructive/10"
      )}
    >
      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border border-border font-mono text-xs text-muted-foreground">{label}</span>
      <span>{option.text}</span>
    </button>
  );
}
