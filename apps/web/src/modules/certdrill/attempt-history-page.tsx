import Link from "next/link";
import type { CertDrillAttemptHistoryItem } from "@platform/contracts";

import { formatDateTime } from "@/lib/utils";

import { ActionButton, CategoryTag, CertDrillShell, StampBox } from "./components";

export function AttemptHistoryPage({ attempts }: { attempts: CertDrillAttemptHistoryItem[] }) {
  return (
    <CertDrillShell>
      <StampBox items={[{ label: "profile", value: "attempts" }, { label: "count", value: String(attempts.length) }]} />
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Attempt History</h1>
          <p className="mt-2 text-sm text-muted-foreground">Review completed exams and in-progress CertDrill sessions.</p>
        </div>
        <ActionButton href="/exams" variant="secondary">Browse exams</ActionButton>
      </div>

      {attempts.length === 0 ? (
        <div className="rounded border border-border bg-card p-6 text-muted-foreground">
          No CertDrill attempts yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded border border-border bg-card">
          <div className="hidden gap-3 border-b border-border px-4 py-3 font-mono text-xs uppercase tracking-[0.08em] text-foreground0 md:grid md:grid-cols-12">
            <span className="md:col-span-3">Certification</span>
            <span className="col-span-2">Mode</span>
            <span className="col-span-2">Status</span>
            <span className="col-span-1">Score</span>
            <span className="col-span-2">Started</span>
            <span className="col-span-2">Actions</span>
          </div>
          {attempts.map((attempt) => (
            <div key={attempt.id} className="grid grid-cols-1 gap-3 border-b border-border px-4 py-4 last:border-b-0 md:grid-cols-12 md:items-center">
              <div className="md:col-span-3">
                <p className="font-semibold text-foreground">{attempt.certification.code}</p>
                <p className="text-sm text-muted-foreground">{attempt.certification.name}</p>
              </div>
              <div className="md:col-span-2">
                <div className="flex flex-wrap gap-2">
                  <CategoryTag>{testModeLabel(attempt.testMode ?? attempt.feedbackMode)}</CategoryTag>
                  <CategoryTag>{testVariantLabel(attempt.testVariant, attempt.examFormName)}</CategoryTag>
                </div>
                {(attempt.testMode ?? attempt.feedbackMode) === "exam" && attempt.expiresAt ? (
                  <p className="mt-2 text-xs text-muted-foreground">Expires {formatDateTime(attempt.expiresAt)}</p>
                ) : null}
              </div>
              <div className="md:col-span-2">
                <CategoryTag tone={attempt.status === "completed" ? "success" : "accent"}>{attempt.status.replace("_", " ")}</CategoryTag>
              </div>
              <div className="text-sm text-muted-foreground md:col-span-1">
                {attempt.scorePct === null ? "Pending" : `${attempt.scorePct}%`}
              </div>
              <div className="text-sm text-muted-foreground md:col-span-2">
                {formatDateTime(attempt.startedAt)}
              </div>
              <div className="text-sm text-muted-foreground md:col-span-2">
                {attempt.status === "completed" ? (
                  <Link href={`/exams/${attempt.id}/results`} className="font-semibold text-primary hover:opacity-80">
                    View results
                  </Link>
                ) : attempt.status === "in_progress" ? (
                  <Link href={`/exams/${attempt.id}`} className="font-semibold text-primary hover:opacity-80">
                    Resume attempt
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </CertDrillShell>
  );
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
