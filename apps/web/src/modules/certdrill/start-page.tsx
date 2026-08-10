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

      <div className="space-y-5">
        <StageRow stage="Step 1" title="Learn and explore" description="Choose how you want to build familiarity with the exam content.">
          <ModeCard active={selectedMode === "quick_drill"} onClick={() => setSelectedMode("quick_drill")} title="Quick Drill" description="Explore a short mixed set that prioritizes questions you have not seen before." />
          <ModeCard active={selectedMode === "category_drill"} disabled={flatCategories.length === 0} onClick={() => setSelectedMode("category_drill")} title="Category Drill" description="Build depth in one blueprint category, starting with unseen questions.">
            {selectedMode === "category_drill" ? <CategorySelect categories={flatCategories} value={categoryId} onChange={setCategoryId} /> : null}
          </ModeCard>
        </StageRow>

        <StageRow stage="Step 2" title="Strengthen knowledge" description="Repair known gaps or focus practice where it will help most.">
          <ModeCard active={selectedMode === "missed_review"} onClick={() => setSelectedMode("missed_review")} title="Repair knowledge" description="Revisit due incorrect or low-confidence answers until you demonstrate mastery." />
          <ModeCard active={selectedMode === "weak_areas"} onClick={() => setSelectedMode("weak_areas")} title="Improve coverage" description="Practice unseen and least-recently-seen questions from your recent weak categories." />
        </StageRow>

        <StageRow stage="Step 3" title="Exam readiness" description="Measure readiness with a generated simulation or a fixed final exam.">
          <ModeCard active={selectedMode === "exam_simulation"} onClick={() => setSelectedMode("exam_simulation")} title="Exam Simulation" description={`Take a timed, blueprint-weighted exam with ${certification.examSimulationQuestionCount ?? certification.questionCountDefault} fresh questions and ${certification.examSimulationScenarioCount ?? 0} scored scenarios.`} />
          <section className="rounded border border-border bg-background/60 p-4">
            <h3 className="font-semibold text-foreground">Final Exam</h3>
            <p className="mt-1 text-sm text-muted-foreground">Take a reserved, fixed exam form for a clean final rehearsal.</p>
            <div className="mt-4 space-y-3">
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
                  {form.questionCount} questions · {form.scenarioCount ?? 0} scenarios · {form.durationMinutes} minutes{form.description ? ` · ${form.description}` : ""}
                </ChoiceButton>
              )) : (
                <p className="rounded border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Final exam sets will appear here when they are published.
                </p>
              )}
            </div>
          </section>
        </StageRow>
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

function StageRow({ stage, title, description, children }: { stage: string; title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-border bg-card p-5">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,2fr)] lg:items-start">
        <header>
          <p className="font-mono text-xs uppercase tracking-[0.08em] text-primary">{stage}</p>
          <h2 className="mt-2 text-lg font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </header>
        <div className="grid gap-3 md:grid-cols-2">{children}</div>
      </div>
    </section>
  );
}

function ModeCard({ active, children, description, disabled, onClick, title }: { active: boolean; children?: React.ReactNode; description: string; disabled?: boolean; onClick: () => void; title: string }) {
  return (
    <div className={`rounded border transition ${active ? "border-primary bg-primary/10" : "border-border bg-background/60 hover:border-primary"} ${disabled ? "opacity-50" : ""}`}>
      <button type="button" aria-pressed={active} disabled={disabled} onClick={onClick} className="w-full p-4 text-left disabled:cursor-not-allowed">
        <span className="block font-semibold text-foreground">{title}</span>
        <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
      </button>
      {children ? <div className="border-t border-border p-4">{children}</div> : null}
    </div>
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
