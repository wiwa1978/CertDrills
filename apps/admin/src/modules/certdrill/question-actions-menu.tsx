"use client";

import type { MouseEvent, ReactElement } from "react";
import { MoreHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type QuestionStatus = "draft" | "published" | "archived";

function stopPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function QuestionActionsMenu({
  questionId,
  status,
  edit,
  publishAction,
  archiveAction,
}: {
  questionId: string;
  status?: QuestionStatus | null;
  edit: ReactElement;
  publishAction: (formData: FormData) => void | Promise<void>;
  archiveAction: (formData: FormData) => void | Promise<void>;
}) {
  const questionStatus = status ?? "draft";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${questionId}`} onClick={stopPropagation}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stopPropagation}>
          <DropdownMenuItem asChild>
            {edit}
          </DropdownMenuItem>
          {questionStatus !== "archived" ? <DropdownMenuSeparator /> : null}
          {questionStatus === "draft" ? (
            <DropdownMenuItem asChild>
              <button type="submit" form={`publish-question-${questionId}`}>Publish</button>
            </DropdownMenuItem>
          ) : null}
          {questionStatus !== "archived" ? (
            <DropdownMenuItem asChild variant="destructive">
              <button type="submit" form={`archive-question-${questionId}`}>Archive</button>
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {questionStatus === "draft" ? (
        <form id={`publish-question-${questionId}`} className="hidden" action={publishAction}>
          <input type="hidden" name="questionId" value={questionId} />
        </form>
      ) : null}
      {questionStatus !== "archived" ? (
        <form id={`archive-question-${questionId}`} className="hidden" action={archiveAction}>
          <input type="hidden" name="questionId" value={questionId} />
        </form>
      ) : null}
    </>
  );
}
