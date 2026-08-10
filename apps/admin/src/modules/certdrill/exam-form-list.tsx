import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link as LocalizedLink } from "@/i18n/navigation";
import type { CertDrillAdminCategory, CertDrillAdminExamForm, CertDrillAdminQuestion } from "@/lib/api/certdrill.server";
import { deactivateCertDrillExamFormAction } from "./exam-form-actions";
import { examFormEditorHref } from "./exam-form-href";
import { buildExamFormQuestionDistributions } from "./exam-form-distribution";

export function ExamFormList({
  certificationId,
  examForms,
  questions,
  categories,
}: {
  certificationId: string;
  examForms: CertDrillAdminExamForm[];
  questions: CertDrillAdminQuestion[];
  categories: CertDrillAdminCategory[];
}) {
  const distributions = buildExamFormQuestionDistributions(examForms, questions, categories);

  return (
    <div className="space-y-4">
      {examForms.map((form) => {
        const distribution = distributions.get(form.id);
        const totals = distribution?.totals ?? { normal: 0, matching: 0, fillBlank: 0, total: 0 };

        return (
          <section key={form.id} aria-labelledby={`exam-form-${form.id}-name`} className="rounded-lg border">
            <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 id={`exam-form-${form.id}-name`} className="font-semibold">{form.name}</h3>
                  <Badge variant={form.isActive ? "default" : "secondary"}>{form.isActive ? "Active" : "Inactive"}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {form.questionIds.length.toLocaleString()} assigned · {form.targetQuestionCount.toLocaleString()} target · {form.scenarioIds.length.toLocaleString()} scenarios · {form.durationMinutes.toLocaleString()} minutes
                </p>
              </div>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm"><LocalizedLink href={examFormEditorHref(certificationId, form.id)}>Edit</LocalizedLink></Button>
                {form.isActive ? (
                  <form action={deactivateCertDrillExamFormAction}>
                    <input type="hidden" name="certificationId" value={certificationId} />
                    <input type="hidden" name="examFormId" value={form.id} />
                    <Button type="submit" variant="outline" size="sm">Deactivate</Button>
                  </form>
                ) : null}
              </div>
            </div>

            <div className="space-y-4 border-t p-4">
              <section aria-label={`${form.name} drill counts`} className="grid gap-3 sm:grid-cols-3">
                <DrillCount label="Normal questions" value={totals.normal} />
                <DrillCount label="Drag and drop" value={totals.matching} />
                <DrillCount label="Fill in the gap" value={totals.fillBlank} />
              </section>

              <div>
                <h4 className="mb-2 text-sm font-semibold">Distribution per category</h4>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Weight</TableHead>
                        <TableHead className="text-right">Normal</TableHead>
                        <TableHead className="text-right">Drag and drop</TableHead>
                        <TableHead className="text-right">Fill in the gap</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {distribution && distribution.categories.length > 0 ? distribution.categories.map((row) => (
                        <TableRow key={row.categoryId}>
                          <TableCell className="font-medium">{row.categoryName}</TableCell>
                          <TableCell className="text-right">{row.weightPct === null ? "—" : `${row.weightPct}%`}</TableCell>
                          <TableCell className="text-right">{row.counts.normal.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.counts.matching.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{row.counts.fillBlank.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-medium">{row.counts.total.toLocaleString()}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No category allocation recorded.</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function DrillCount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value.toLocaleString()}</p>
    </div>
  );
}
