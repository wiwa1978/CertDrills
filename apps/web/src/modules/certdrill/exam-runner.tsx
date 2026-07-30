"use client";

import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AnswerCertDrillQuestionResponse, CertDrillConfidence, CertDrillResumeExamAttemptResponse, CreateCertDrillExamAttemptResponse } from "@platform/contracts";

import { answerCertDrillQuestion, submitCertDrillAttempt } from "@/lib/api/certdrill";
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
  const [questionIndex, setQuestionIndex] = useState(initialQuestionIndex);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(initialSelection.selectedOptionId);
  const [confidence, setConfidence] = useState<CertDrillConfidence>(initialSelection.confidence);
  const [feedback, setFeedback] = useState<AnswerCertDrillQuestionResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const autoSubmittedRef = useRef(false);
  const [isPending, startTransition] = useTransition();
  const question = attempt.questions[questionIndex];
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
    setConfidence(nextSelection.confidence);
    setFeedback(null);
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
    if (!isPractice) {
      submitAnswer(optionId);
    }
  }

  function submitAnswer(optionId = selectedOptionId) {
    if (!optionId || !question) {
      return;
    }

    setError(null);
    startTransition(async () => {
      try {
        const response = await answerCertDrillQuestion(attempt.attemptId, {
          questionId: question.id,
          selectedOptionId: optionId,
          ...(attempt.confidenceEnabled ? { confidence } : {}),
        });
        if (isPractice) {
          setFeedback(response);
          return;
        }

        if (isLastQuestion) {
          await finishAttempt();
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
    setConfidence(nextSelection.confidence);
    setFeedback(null);
  }

  function continuePractice() {
    if (!feedback) {
      return;
    }

    if (isLastQuestion) {
      setError(null);
      startTransition(async () => {
        try {
          await finishAttempt();
        } catch (caught) {
          setError(caught instanceof Error ? caught.message : "Could not submit this attempt.");
        }
      });
    } else {
      moveNext();
    }
  }

  const percentComplete = Math.round(((questionIndex + 1) / attempt.questions.length) * 100);

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "attempt", value: attempt.attemptId.slice(0, 8) }, { label: "mode", value: testModeLabel(attempt.testMode ?? attempt.feedbackMode) }, { label: "variant", value: testVariantLabel(attempt.testVariant, attempt.examFormName) }]} />
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
          <span>Question <b className="text-foreground">{questionIndex + 1}</b> / {attempt.questions.length}</span>
          {remainingMs === null ? (
            <span>{percentComplete}%</span>
          ) : (
            <span role="timer" aria-live="polite">Time left {formatRemainingTime(remainingMs)}</span>
          )}
        </div>
        <div className="flex gap-1">
          {attempt.questions.map((item, index) => (
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
        <div className="mt-6 space-y-3">
          {question.options.map((option, index) => (
            <OptionButton
              key={option.id}
              option={option}
              label={String.fromCharCode(65 + index)}
              selected={selectedOptionId === option.id}
              feedback={feedback}
              onClick={() => selectOption(option.id)}
            />
          ))}
        </div>

        {isPractice && feedback && "isCorrect" in feedback ? (
          <div className={cn("mt-5 rounded border p-4 text-sm leading-6", feedback.isCorrect ? "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400" : "border-destructive bg-destructive/10 text-destructive")}>
            <p className="font-mono text-xs uppercase tracking-[0.08em]">{feedback.isCorrect ? "Correct" : "Review"}</p>
            <p className="mt-2">{feedback.selectedOptionFeedback.explanation}</p>
            {!feedback.isCorrect ? <p className="mt-2">Correct answer: {feedback.correctOption.text}</p> : null}
          </div>
        ) : null}

        {isExpired ? <p className="mt-5 rounded border border-primary bg-primary/10 p-3 text-sm text-primary">Time expired. Submitting your recorded answers...</p> : null}
        {error ? <p className="mt-5 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

        {isPractice ? (
          <div className="mt-6 flex justify-end">
            {feedback ? (
              <ActionButton onClick={continuePractice} disabled={isPending}>{isLastQuestion ? "Submit exam" : "Next question"}</ActionButton>
            ) : (
              <ActionButton onClick={() => submitAnswer()} disabled={!selectedOptionId || isPending || isExpired}>{isPending ? "Checking..." : "Check answer"}</ActionButton>
            )}
          </div>
        ) : null}
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

export function getResumeSelection(attempt: ResumableAttempt, questionIndex: number): { selectedOptionId: string | null; confidence: CertDrillConfidence } {
  const questionId = attempt.questions[questionIndex]?.id;
  const recordedAnswer = questionId && "recordedAnswers" in attempt
    ? attempt.recordedAnswers.find((answer) => answer.questionId === questionId)
    : undefined;

  return {
    selectedOptionId: recordedAnswer?.selectedOptionId ?? null,
    confidence: recordedAnswer?.confidence ?? "somewhat_sure",
  };
}

export function resolveAttemptForRunner(storedAttempt: StoredAttempt, resumeAttempt?: CertDrillResumeExamAttemptResponse): ResumableAttempt | null | undefined {
  return resumeAttempt ?? storedAttempt;
}

function OptionButton({ feedback, label, onClick, option, selected }: { feedback: AnswerCertDrillQuestionResponse | null; label: string; onClick: () => void; option: AttemptQuestion["options"][number]; selected: boolean }) {
  const correct = feedback && "correctOption" in feedback && feedback.correctOption.id === option.id;
  const incorrect = feedback && "selectedOptionFeedback" in feedback && feedback.selectedOptionFeedback.id === option.id && !feedback.isCorrect;

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
