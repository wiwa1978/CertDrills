"use client";

import type { MouseEvent } from "react";
import { Fragment, useState } from "react";

import { Link as LocalizedLink } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type {
  CertDrillAdminQuestionIndexItem,
  CertDrillAdminQuestionIndexResult,
  CertDrillAdminQuestionIndexSort,
} from "@/lib/api/certdrill.server";
import { QuestionActionsMenu } from "./question-actions-menu";
import { questionEditorHref } from "./question-editor-href";
import { compactQuestionId } from "./question-id";

type QuestionsIndexTableProps = {
  result?: Pick<CertDrillAdminQuestionIndexResult, "items" | "page" | "pageCount" | "pageSize" | "total">;
  items?: CertDrillAdminQuestionIndexItem[];
  page?: number;
  pageCount?: number;
  pageSize?: number;
  total?: number;
  sort: CertDrillAdminQuestionIndexSort;
  sortHref?: string;
  previousHref?: string;
  nextHref?: string;
  publishAction: (formData: FormData) => void | Promise<void>;
  archiveAction: (formData: FormData) => void | Promise<void>;
};

function stopRowToggle(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function QuestionsIndexTable({
  result,
  items,
  page: explicitPage,
  pageCount: explicitPageCount,
  pageSize: explicitPageSize,
  total: explicitTotal,
  sort,
  sortHref,
  previousHref,
  nextHref,
  publishAction,
  archiveAction,
}: QuestionsIndexTableProps) {
  const [expandedQuestionId, setExpandedQuestionId] = useState<string>();
  const questionItems = items ?? result?.items ?? [];
  const page = result?.page ?? explicitPage ?? 1;
  const pageCount = result?.pageCount ?? explicitPageCount ?? 1;
  const pageSize = result?.pageSize ?? explicitPageSize ?? questionItems.length;
  const total = result?.total ?? explicitTotal ?? questionItems.length;
  const rangeStart = total === 0 ? 0 : ((page - 1) * pageSize) + 1;
  const rangeEnd = total === 0 ? 0 : Math.min(total, rangeStart + questionItems.length - 1);
  const hasPreviousPage = page > 1 && Boolean(previousHref);
  const hasNextPage = page < pageCount && Boolean(nextHref);

  function toggleExpandedQuestion(questionId: string) {
    setExpandedQuestionId((currentQuestionId) => currentQuestionId === questionId ? undefined : questionId);
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Certification</TableHead>
            <TableHead>Category</TableHead>
            <TableHead aria-sort={sortHref ? (sort === "stem-desc" ? "descending" : "ascending") : "none"}>
              {sortHref ? (
                <Button asChild variant="ghost" size="sm" className="-ml-3 h-auto px-3 py-1 font-medium">
                  <LocalizedLink href={sortHref} aria-label={sort === "stem-desc" ? "Sort Question A-Z" : "Sort Question Z-A"}>
                    Question <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span>
                  </LocalizedLink>
                </Button>
              ) : <>Question <span aria-hidden="true">{sort === "stem-desc" ? "↓" : "↑"}</span></>}
            </TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Difficulty</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {questionItems.map((question) => {
            const isExpanded = expandedQuestionId === question.questionId;
            const detailsId = `question-details-${question.questionId}`;
            const sortedOptions = question.options.toSorted((first, second) => first.sortOrder - second.sortOrder);

            return (
              <Fragment key={question.questionId}>
                <TableRow
                  className="cursor-pointer"
                  onClick={() => toggleExpandedQuestion(question.questionId)}
                >
                  <TableCell className="whitespace-normal">
                    <div className="space-y-1">
                      <p className="font-medium">{question.certificationCode}</p>
                      <p className="text-sm text-muted-foreground">{question.certificationName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <div className="space-y-1">
                      <p className="font-medium">{question.categoryCode}</p>
                      <p className="text-sm text-muted-foreground">{question.categoryName}</p>
                    </div>
                  </TableCell>
                  <TableCell className="max-w-xl whitespace-normal">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-expanded={isExpanded}
                          aria-controls={detailsId}
                          aria-label={isExpanded ? `Hide answers for ${question.stem}` : `Show answers for ${question.stem}`}
                          onClick={(event) => {
                            stopRowToggle(event);
                            toggleExpandedQuestion(question.questionId);
                          }}
                        >
                          {isExpanded ? "Hide answers" : "Show answers"}
                        </Button>
                        <LocalizedLink
                          href={questionEditorHref(question.certificationId, question.questionId)}
                          className="text-sm font-medium underline-offset-4 hover:underline"
                          onClick={stopRowToggle}
                        >
                          Open editor
                        </LocalizedLink>
                      </div>
                      <p className="font-medium">{question.stem}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        <span className="sr-only">Question ID {question.questionId}</span>
                        <span aria-hidden="true">{compactQuestionId(question.questionId)}</span>
                      </p>
                    </div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{question.status}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{question.difficulty}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end" onClick={stopRowToggle}>
                      <QuestionActionsMenu
                        questionId={question.questionId}
                        status={question.status}
                        edit={(
                          <LocalizedLink
                            href={questionEditorHref(question.certificationId, question.questionId)}
                            onClick={stopRowToggle}
                          >
                            Edit
                          </LocalizedLink>
                        )}
                        publishAction={publishAction}
                        archiveAction={archiveAction}
                      />
                    </div>
                  </TableCell>
                </TableRow>
                {isExpanded ? (
                  <TableRow key={`${question.questionId}-details`}>
                    <TableCell colSpan={6} className="whitespace-normal bg-muted/20">
                      <div id={detailsId} className="space-y-3 py-2">
                        {sortedOptions.length > 0 ? (
                          <ol className="space-y-3">
                            {sortedOptions.map((option) => (
                              <li key={option.id} className="rounded-md border p-3">
                                <div className="flex flex-wrap items-start gap-2">
                                  <Badge variant={option.isCorrect ? "default" : "outline"}>
                                    {option.isCorrect ? "Correct" : "Incorrect"}
                                  </Badge>
                                  <p className="min-w-0 flex-1 whitespace-pre-wrap">{option.text}</p>
                                </div>
                                {option.explanation ? (
                                  <p className="mt-2 text-sm text-muted-foreground">{option.explanation}</p>
                                ) : null}
                              </li>
                            ))}
                          </ol>
                        ) : <p className="text-sm text-muted-foreground">No answer options.</p>}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : null}
              </Fragment>
            );
          })}
        </TableBody>
      </Table>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">Showing {rangeStart} to {rangeEnd} of {total}</p>
          <p className="text-sm text-muted-foreground">Page {page} of {pageCount}</p>
        </div>
        <div className="flex gap-2">
          {hasPreviousPage && previousHref ? (
            <Button asChild variant="outline" size="sm">
              <LocalizedLink href={previousHref}>Previous</LocalizedLink>
            </Button>
          ) : <Button variant="outline" size="sm" disabled>Previous</Button>}
          {hasNextPage && nextHref ? (
            <Button asChild variant="outline" size="sm">
              <LocalizedLink href={nextHref}>Next</LocalizedLink>
            </Button>
          ) : <Button variant="outline" size="sm" disabled>Next</Button>}
        </div>
      </div>
    </div>
  );
}
