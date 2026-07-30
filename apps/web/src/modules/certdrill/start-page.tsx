"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CertDrillCategory, CertDrillCertificationListItem, CertDrillTestVariant } from "@platform/contracts";

import { createCertDrillAttempt } from "@/lib/api/certdrill";

import { ActionButton, CategoryTag, CertDrillShell, StampBox } from "./components";
import { CERTDRILL_ATTEMPT_STORAGE_PREFIX } from "./exam-runner";

type StartPageProps = {
  certification: CertDrillCertificationListItem;
  categories: CertDrillCategory[];
};

export function StartPage({ certification, categories }: StartPageProps) {
  const router = useRouter();
  const flatCategories = flattenCategories(categories);
  const [selectedMode, setSelectedMode] = useState<CertDrillTestVariant>("quick_drill");
  const [examFormId, setExamFormId] = useState<string>("");
  const [categoryId, setCategoryId] = useState(flatCategories[0]?.id ?? "");
  const [confidenceEnabled, setConfidenceEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const examForms = (certification.examForms ?? []).filter((form) => form.isActive);
  const canStart = certification.accessStatus === "purchased"
    && (selectedMode !== "category_drill" || categoryId.length > 0)
    && (selectedMode !== "exam_form" || examFormId.length > 0);

  function startAttempt() {
    setError(null);
    startTransition(async () => {
      try {
        const attempt = await createCertDrillAttempt({
          certificationId: certification.id,
          testMode: isExamVariant(selectedMode) ? "exam" : "practice",
          testVariant: selectedMode,
          ...(selectedMode === "category_drill" ? { categoryIds: [categoryId] } : {}),
          ...(selectedMode === "exam_form" ? { examFormId } : {}),
          confidenceEnabled,
        });
        const selectedExamForm = examForms.find((form) => form.id === examFormId);
        const attemptForSession = selectedMode === "exam_form" && selectedExamForm && !attempt.examFormName
          ? { ...attempt, examFormName: selectedExamForm.name }
          : attempt;
        sessionStorage.setItem(`${CERTDRILL_ATTEMPT_STORAGE_PREFIX}${attempt.attemptId}`, JSON.stringify(attemptForSession));
        router.push(`/exams/${attempt.attemptId}`);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not start this exam.");
      }
    });
  }

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "exam", value: certification.code }, { label: "vendor", value: certification.vendor }]} />
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Start {certification.code}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{certification.name}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <CategoryTag>{certification.publishedQuestionCount} published</CategoryTag>
          <CategoryTag>{certification.passThresholdPct}% pass</CategoryTag>
        </div>
      </div>

      {certification.accessStatus !== "purchased" ? (
        <div className="mb-6 rounded border border-primary bg-primary/10 p-4 text-sm text-primary">
          Purchase flow coming soon. This exam is visible in the catalog but cannot be started yet.
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <ChoicePanel title="Practice" description="Use drills with immediate answer feedback and optional confidence tracking.">
          <ChoiceButton active={selectedMode === "quick_drill"} onClick={() => setSelectedMode("quick_drill")} title="Quick Drill">
            A short mixed set from the published question pool.
          </ChoiceButton>
          <ChoiceButton active={selectedMode === "category_drill"} disabled={flatCategories.length === 0} onClick={() => setSelectedMode("category_drill")} title="Category Drill">
            Focus on one blueprint category.
          </ChoiceButton>
          {selectedMode === "category_drill" ? (
            <CategorySelect categories={flatCategories} value={categoryId} onChange={setCategoryId} />
          ) : null}
          <ChoiceButton active={selectedMode === "missed_review"} onClick={() => setSelectedMode("missed_review")} title="Missed Questions Review">
            Revisit questions you previously answered incorrectly.
          </ChoiceButton>
          <ChoiceButton active={selectedMode === "weak_areas"} onClick={() => setSelectedMode("weak_areas")} title="Weak Areas Drill">
            Target categories where your recent scores need work.
          </ChoiceButton>
        </ChoicePanel>

        <ChoicePanel title="Exam" description="Run without immediate feedback and submit at the end or when time expires.">
          <ChoiceButton active={selectedMode === "exam_simulation"} onClick={() => setSelectedMode("exam_simulation")} title="Exam Simulation">
            Blueprint-weighted timed exam using the certification defaults.
          </ChoiceButton>
          {examForms.length > 0 ? examForms.map((form) => (
            <ChoiceButton
              key={form.id}
              active={selectedMode === "exam_form" && examFormId === form.id}
              onClick={() => {
                setSelectedMode("exam_form");
                setExamFormId(form.id);
              }}
              title={form.name}
            >
              {form.questionCount} questions · {form.durationMinutes} minutes{form.description ? ` · ${form.description}` : ""}
            </ChoiceButton>
          )) : (
            <p className="rounded border border-border bg-muted p-4 text-sm text-muted-foreground">
              Exam Form sets will appear here when they are published.
            </p>
          )}
        </ChoicePanel>
      </div>

      <label className="mt-5 flex items-start gap-3 rounded border border-border bg-card p-4 text-sm text-muted-foreground">
        <input
          type="checkbox"
          className="mt-1"
          checked={confidenceEnabled}
          onChange={(event) => setConfidenceEnabled(event.target.checked)}
        />
        <span>
          <span className="block font-semibold text-foreground">Track confidence</span>
          <span className="mt-1 block">Ask how sure you are before each answer so review can separate knowledge gaps from guesses.</span>
        </span>
      </label>

      {error ? <p className="mt-5 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</p> : null}

      <div className="mt-8 flex items-center justify-between gap-4 rounded border border-border bg-card p-4">
        <p className="text-sm text-muted-foreground">Created attempts open in the runner and are also tracked in attempt history.</p>
        <ActionButton onClick={startAttempt} disabled={!canStart || isPending}>{isPending ? "Starting..." : isExamVariant(selectedMode) ? "Start exam" : "Start drill"}</ActionButton>
      </div>
    </CertDrillShell>
  );
}

function CategorySelect({ categories, onChange, value }: { categories: CertDrillCategory[]; onChange: (value: string) => void; value: string }) {
  return (
    <label className="block text-sm text-muted-foreground">
      <span className="mb-2 block font-mono text-xs uppercase tracking-[0.08em] text-foreground">Category</span>
      <select
        className="w-full rounded border border-border bg-background px-3 py-2 text-foreground outline-none focus:border-primary"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {categories.map((category) => (
          <option key={category.id} value={category.id}>{category.code} · {category.name}</option>
        ))}
      </select>
    </label>
  );
}

function ChoicePanel({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-border bg-card p-5">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}

function ChoiceButton({ active, children, disabled, onClick, title }: { active: boolean; children: React.ReactNode; disabled?: boolean; onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`w-full rounded border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${active ? "border-primary bg-primary/10" : "border-border bg-muted hover:border-primary"}`}
    >
      <span className="block font-semibold text-foreground">{title}</span>
      <span className="mt-1 block text-sm text-muted-foreground">{children}</span>
    </button>
  );
}

function flattenCategories(categories: CertDrillCategory[]): CertDrillCategory[] {
  return categories.flatMap((category) => [category, ...flattenCategories(category.children)]);
}

function isExamVariant(testVariant: CertDrillTestVariant) {
  return testVariant === "exam_simulation" || testVariant === "exam_form";
}
