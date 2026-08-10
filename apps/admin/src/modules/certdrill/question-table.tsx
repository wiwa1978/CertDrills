"use client";

import { Link as LocalizedLink } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { CertDrillAdminQuestion } from "@/lib/api/certdrill.server";
import { QuestionActionsMenu } from "./question-actions-menu";
import {
  QuestionBulkActionBar,
  QuestionSelectionCheckbox,
  useQuestionBulkSelection,
} from "./question-bulk-selection";
import { questionEditorHref } from "./question-editor-href";
import { compactQuestionId } from "./question-id";
import { QuestionStatusBadge } from "./question-status-badge";
import { QuestionDeliveryPurposeBadge } from "./question-delivery-purpose-badge";

type QuestionAction = (formData: FormData) => void | Promise<void>;

export function QuestionTable({
  certificationId,
  questions,
  publishQuestionAction,
  publishAction,
  unpublishAction,
  practiceAction,
  assessmentAction,
  archiveAction,
  sort,
  stemSortHref,
  page,
  pageCount,
  previousPageHref,
  nextPageHref,
}: {
  certificationId: string;
  publishQuestionAction: QuestionAction;
  questions: CertDrillAdminQuestion[];
  publishAction: QuestionAction;
  unpublishAction: QuestionAction;
  practiceAction: QuestionAction;
  assessmentAction: QuestionAction;
  archiveAction: QuestionAction;
  sort?: string;
  stemSortHref?: string;
  page?: number;
  pageCount?: number;
  previousPageHref?: string;
  nextPageHref?: string;
}) {
  const questionIds = questions.map((question) => question.id);
  const selection = useQuestionBulkSelection(questionIds);

  return (
    <div className="space-y-4">
      <QuestionBulkActionBar
        questionIds={questionIds}
        selectedIds={selection.selectedIds}
        setAllSelected={selection.setAllSelected}
        publishAction={publishAction}
        unpublishAction={unpublishAction}
        practiceAction={practiceAction}
        assessmentAction={assessmentAction}
      />
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"><span className="sr-only">Select</span></TableHead>
            <TableHead>ID</TableHead>
            <TableHead aria-sort={sort === "stem-desc" ? "descending" : "ascending"}>
              {stemSortHref ? (
                <LocalizedLink href={stemSortHref} aria-label={sort === "stem-desc" ? "Sort Stem A-Z" : "Sort Stem Z-A"} className="hover:underline">
                  Stem <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span>
                </LocalizedLink>
              ) : <>Stem <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span></>}
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead className="text-right">Options</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questions.map((question) => {
            const questionStatus = question.status ?? "draft";
            const href = questionEditorHref(certificationId, question.id);

            return (
              <TableRow key={question.id}>
                <TableCell>
                  <QuestionSelectionCheckbox
                    questionId={question.id}
                    selected={selection.selectedIds.includes(question.id)}
                    setQuestionSelected={selection.setQuestionSelected}
                  />
                </TableCell>
                <TableCell className="font-mono text-xs">
                  <LocalizedLink href={href} className="hover:underline" aria-label={`Open question ${question.id}`}>{compactQuestionId(question.id)}</LocalizedLink>
                </TableCell>
                <TableCell className="max-w-xl whitespace-normal">
                  <LocalizedLink href={href} className="hover:underline">{question.stem}</LocalizedLink>
                </TableCell>
                <TableCell><QuestionStatusBadge status={questionStatus} /></TableCell>
                <TableCell><QuestionDeliveryPurposeBadge purpose={question.deliveryPurpose} /></TableCell>
                <TableCell>{question.difficulty ?? "medium"}</TableCell>
                <TableCell className="text-right">{(question.options ?? []).length.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <QuestionActionsMenu
                    questionId={question.id}
                    status={questionStatus}
                    edit={<LocalizedLink href={href}>Edit</LocalizedLink>}
                    publishAction={publishQuestionAction}
                    archiveAction={archiveAction}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {page && pageCount ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p>
          <div className="flex gap-2">
            {previousPageHref ? (
              <Button asChild variant="outline" size="sm">
                <LocalizedLink href={previousPageHref}>Previous</LocalizedLink>
              </Button>
            ) : <Button variant="outline" size="sm" disabled>Previous</Button>}
            {nextPageHref ? (
              <Button asChild variant="outline" size="sm">
                <LocalizedLink href={nextPageHref}>Next</LocalizedLink>
              </Button>
            ) : <Button variant="outline" size="sm" disabled>Next</Button>}
          </div>
        </div>
      ) : null}
    </div>
  );
}
