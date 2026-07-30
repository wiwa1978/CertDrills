import type { CertDrillAttemptHistoryItem, CertDrillCertificationListItem, CertDrillReadinessSummary } from "@platform/contracts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { ActionButton, CategoryTag, CertDrillShell, StampBox } from "./components";

type CatalogPageProps = {
  allCertifications: CertDrillCertificationListItem[];
  myCertifications: CertDrillCertificationListItem[];
  attempts: CertDrillAttemptHistoryItem[];
  readiness: CertDrillReadinessSummary;
};

export function CatalogPage({ allCertifications, myCertifications, attempts, readiness }: CatalogPageProps) {
  const myCertificationIds = new Set(myCertifications.map((certification) => certification.id));
  const inProgressAttempts = attempts.filter((attempt) => attempt.status === "in_progress");

  return (
    <CertDrillShell>
      <StampBox items={[{ label: "module", value: "CertDrill" }, { label: "status", value: "visible MVP" }]} />
      <div className="mb-8 max-w-2xl">
        <h1 className="font-[var(--font-space-grotesk,inherit)] text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Certification Exams
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Pick a certification, choose practice or exam simulation, and drill against published question snapshots.
        </p>
      </div>

      <ReadinessCards readiness={readiness} />
      <InProgressAttempts attempts={inProgressAttempts} />

      {allCertifications.length === 0 ? (
        <div className="rounded border border-border bg-card p-6 text-muted-foreground">
          No certification exams have been published yet.
        </div>
      ) : (
        <Tabs defaultValue="all" className="space-y-6">
          <TabsList className="bg-card text-muted-foreground">
            <TabsTrigger value="all" className="data-[state=active]:bg-muted data-[state=active]:text-primary">
              All exams
            </TabsTrigger>
            <TabsTrigger value="mine" className="data-[state=active]:bg-muted data-[state=active]:text-primary">
              My exams
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all">
            <CertificationGrid certifications={allCertifications} purchasedIds={myCertificationIds} />
          </TabsContent>
          <TabsContent value="mine">
            {myCertifications.length === 0 ? (
              <div className="rounded border border-border bg-card p-6 text-muted-foreground">
                You do not have any certification exams yet.
              </div>
            ) : (
              <CertificationGrid certifications={myCertifications} purchasedIds={myCertificationIds} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </CertDrillShell>
  );
}

function InProgressAttempts({ attempts }: { attempts: CertDrillAttemptHistoryItem[] }) {
  if (attempts.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="in-progress-attempts-heading" className="mb-8 rounded border border-border bg-card p-5">
      <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Resume queue</p>
          <h2 id="in-progress-attempts-heading" className="mt-1 text-lg font-semibold text-foreground">In-progress attempts</h2>
        </div>
        <ActionButton href="/profile/attempts" variant="secondary">Attempt history</ActionButton>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {attempts.map((attempt) => (
          <div key={attempt.id} className="rounded border border-border bg-background/60 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold text-foreground">{attempt.certification.code}</p>
                <p className="mt-1 text-sm text-muted-foreground">{attempt.certification.name}</p>
              </div>
              <CategoryTag tone="accent">{testVariantLabel(attempt.testVariant, attempt.examFormName)}</CategoryTag>
            </div>
            <div className="mt-4">
              <ActionButton href={`/exams/${attempt.id}`}>Resume attempt</ActionButton>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ReadinessCards({ readiness }: { readiness: CertDrillReadinessSummary }) {
  const cards = [
    { label: "Completed attempts", value: readiness.completedAttempts.toString() },
    { label: "Average score", value: `${readiness.averageScorePct}%` },
    { label: "Missed questions", value: readiness.missedQuestionCount.toString() },
    { label: "Weak categories", value: readiness.weakCategoryCount.toString() },
  ];

  return (
    <section aria-labelledby="readiness-heading" className="mb-8 rounded border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">Readiness snapshot</p>
          <h2 id="readiness-heading" className="mt-1 text-lg font-semibold text-foreground">Your exam readiness</h2>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <div key={card.label} className="rounded border border-border bg-background/60 p-4">
            <p className="text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">{card.label}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CertificationGrid({ certifications, purchasedIds }: { certifications: CertDrillCertificationListItem[]; purchasedIds: Set<string> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {certifications.map((certification) => {
        const purchased = certification.accessStatus === "purchased" || purchasedIds.has(certification.id);

        return (
          <article key={certification.id} className="flex min-h-72 flex-col rounded border border-border bg-card p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-primary">{certification.vendor}</p>
                <h2 className="mt-1 text-xl font-semibold text-foreground">{certification.code}</h2>
              </div>
              <CategoryTag tone={purchased ? "success" : "default"}>{purchased ? "Purchased" : "Locked"}</CategoryTag>
            </div>
            <h3 className="text-sm font-semibold text-foreground">{certification.name}</h3>
            <p className="mt-3 flex-1 text-sm leading-6 text-muted-foreground">
              {certification.description ?? "Blueprint-weighted certification practice exam."}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <CategoryTag>{certification.publishedQuestionCount} published</CategoryTag>
              <CategoryTag>{certification.questionCountDefault} question default</CategoryTag>
              <CategoryTag>{certification.passThresholdPct}% pass</CategoryTag>
            </div>
            <div className="mt-6">
              {purchased ? (
                <ActionButton href={`/exams/${certification.id}/start`}>View</ActionButton>
              ) : (
                <div className="space-y-2">
                  <ActionButton disabled>Purchase</ActionButton>
                  <p className="text-xs text-foreground0">Purchase flow coming soon</p>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
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
