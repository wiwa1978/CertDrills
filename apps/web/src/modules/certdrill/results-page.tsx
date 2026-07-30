import Link from "next/link";
import type { CertDrillAttemptHistoryItem, CertDrillCertificationListItem, CertDrillReviewExamAttemptResponse } from "@platform/contracts";

import { formatDateTime } from "@/lib/utils";

import { ActionButton, CategoryTag, CertDrillShell, StampBox } from "./components";

type ResultsPageProps = {
  attempt?: CertDrillAttemptHistoryItem;
  certification?: CertDrillCertificationListItem;
  review: CertDrillReviewExamAttemptResponse;
};

export function ResultsPage({ attempt, certification, review }: ResultsPageProps) {
  const correct = review.questions.filter((question) => question.isCorrect).length;
  const total = review.questions.length;
  const scorePct = attempt?.scorePct ?? (total > 0 ? Math.round((correct / total) * 100) : 0);
  const passThreshold = certification?.passThresholdPct ?? 70;
  const passed = scorePct >= passThreshold;
  const breakdown = buildBreakdown(review);
  const testMode = review.testMode ?? attempt?.testMode ?? attempt?.feedbackMode ?? "practice";
  const testVariant = review.testVariant ?? attempt?.testVariant;
  const examFormName = review.examFormName ?? attempt?.examFormName;
  const expiresAt = review.expiresAt ?? attempt?.expiresAt ?? null;

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "result", value: passed ? "pass" : "needs review" }, { label: "score", value: `${scorePct}%` }, { label: "mode", value: testModeLabel(testMode) }, { label: "variant", value: testVariantLabel(testVariant, examFormName) }]} />
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Exam Results</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {attempt ? `${attempt.certification.code} · ${attempt.certification.name}` : "Review your completed attempt."}
          </p>
        </div>
        <ActionButton href="/profile/attempts" variant="secondary">Attempt history</ActionButton>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <ResultStat label="Score" value={`${scorePct}%`} tone={passed ? "success" : "danger"} />
        <ResultStat label="Correct" value={`${correct}/${total}`} />
        <ResultStat label="Pass threshold" value={`${passThreshold}%`} />
      </div>

      {testMode === "exam" && expiresAt ? (
        <p className="mt-4 rounded border border-border bg-card p-4 text-sm text-muted-foreground">
          Timed exam window ended at <span className="font-semibold text-foreground">{formatDateTime(expiresAt)}</span>.
        </p>
      ) : null}

      <section className="mt-8 rounded border border-border bg-card p-5">
        <h2 className="text-xl font-semibold text-foreground">Category breakdown</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {breakdown.map((category) => (
            <div key={category.categoryId} className="rounded border border-border bg-muted p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-primary">{category.code}</p>
                  <h3 className="text-sm font-semibold text-foreground">{category.name}</h3>
                </div>
                <CategoryTag tone={category.scorePct >= passThreshold ? "success" : "danger"}>{category.scorePct}%</CategoryTag>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">{category.correct} correct out of {category.total}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-xl font-semibold text-foreground">Question review</h2>
        {review.questions.map((question, index) => (
          <article key={question.id} className="rounded border border-border bg-card p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <CategoryTag tone={question.isCorrect ? "success" : "danger"}>{question.isCorrect ? "Correct" : "Incorrect"}</CategoryTag>
              <CategoryTag>Question {index + 1}</CategoryTag>
              <CategoryTag>{question.category.code}</CategoryTag>
              {question.confidence ? <CategoryTag>{confidenceLabel(question.confidence)}</CategoryTag> : null}
            </div>
            <p className="text-sm leading-6 text-foreground">{question.stem}</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <ReviewOption label="Your answer" text={question.yourOption?.text ?? "No answer submitted"} tone={question.isCorrect ? "success" : "danger"} />
              <ReviewOption label="Correct answer" text={question.correctOption.text} tone="success" />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{question.correctOption.explanation}</p>
            {question.correctOption.citationUrls.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {question.correctOption.citationUrls.map((url) => (
                  <Link key={url} href={url} className="text-xs text-primary hover:opacity-80">
                    Citation
                  </Link>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </CertDrillShell>
  );
}

function ResultStat({ label, tone = "default", value }: { label: string; tone?: "default" | "success" | "danger"; value: string }) {
  return (
    <div className="rounded border border-border bg-card p-5">
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-foreground0">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${tone === "success" ? "text-green-700 dark:text-green-400" : tone === "danger" ? "text-destructive" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function ReviewOption({ label, text, tone }: { label: string; text: string; tone: "success" | "danger" }) {
  return (
    <div className={`rounded border p-3 ${tone === "success" ? "border-green-600 bg-green-600/10" : "border-destructive bg-destructive/10"}`}>
      <p className="font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-sm text-foreground">{text}</p>
    </div>
  );
}

function buildBreakdown(review: CertDrillReviewExamAttemptResponse) {
  const byCategory = new Map<string, { categoryId: string; code: string; name: string; correct: number; total: number; scorePct: number }>();

  for (const question of review.questions) {
    const current = byCategory.get(question.category.id) ?? {
      categoryId: question.category.id,
      code: question.category.code,
      name: question.category.name,
      correct: 0,
      total: 0,
      scorePct: 0,
    };
    current.total += 1;
    current.correct += question.isCorrect ? 1 : 0;
    current.scorePct = Math.round((current.correct / current.total) * 100);
    byCategory.set(question.category.id, current);
  }

  return Array.from(byCategory.values());
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

function confidenceLabel(confidence: string) {
  switch (confidence) {
    case "guessed":
      return "Guessed";
    case "confident":
      return "Confident";
    case "somewhat_sure":
    default:
      return "Somewhat sure";
  }
}
