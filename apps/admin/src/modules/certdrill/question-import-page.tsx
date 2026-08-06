import { Link as LocalizedLink } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCertDrillCertificationsServer,
  listCertDrillAdminCertificationsServer,
} from "@/lib/api/certdrill.server";

import {
  confirmCertDrillQuestionImportAction,
  previewCertDrillQuestionImportAction,
} from "./question-import-actions";
import { QuestionImportForm } from "./question-import-form";

export async function QuestionImportPage({ certificationId }: { certificationId: string }) {
  const [certifications, adminCertifications] = await Promise.all([
    getCertDrillCertificationsServer(),
    listCertDrillAdminCertificationsServer(),
  ]);
  const selectedAdminCertification = adminCertifications.find((certification) => certification.id === certificationId);

  if (!selectedAdminCertification) {
    return (
      <div className="space-y-4">
        <div role="alert" className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm">
          Certification not found.
        </div>
        <Button asChild variant="outline">
          <LocalizedLink href={certificationsOverviewHref()}>Back to certifications</LocalizedLink>
        </Button>
      </div>
    );
  }

  const selectedCatalogCertification = certifications.find((certification) => certification.id === certificationId);
  const certificationContext = selectedCatalogCertification ?? selectedAdminCertification;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Badge variant="secondary">Question import</Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight">Import questions</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {`Import questions for ${certificationContext.code} - ${certificationContext.name}. Every imported row is saved as a Draft question with source AI.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <LocalizedLink href={questionsTabHref(certificationId)}>Back to questions</LocalizedLink>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question import JSON</CardTitle>
          <CardDescription>
            {"Upload or paste a question import document, then validate to preview the rows before importing. "}
            <a href="/question-import-example.json" download className="underline underline-offset-2">
              Download the example document
            </a>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <QuestionImportForm
            certificationId={certificationId}
            previewAction={previewCertDrillQuestionImportAction}
            confirmAction={confirmCertDrillQuestionImportAction}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function questionsTabHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}?tab=questions`;
}

function certificationsOverviewHref() {
  return "/admin/certdrill";
}
