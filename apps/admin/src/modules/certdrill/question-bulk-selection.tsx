"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

type BulkQuestionAction = (formData: FormData) => void | Promise<void>;
export function setQuestionIdSelected(current: string[], questionId: string, selected: boolean) {
  return selected
    ? [...new Set([...current, questionId])]
    : current.filter((id) => id !== questionId);
}

export function selectAllQuestionIds(questionIds: string[], selected: boolean) {
  return selected ? [...questionIds] : [];
}
export async function runQuestionBulkAction(
  action: BulkQuestionAction,
  formData: FormData,
  clearSelection: () => void,
) {
  await action(formData);
  clearSelection();
}



export function useQuestionBulkSelection(questionIds: string[]) {
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const availableQuestionIds = useMemo(() => new Set(questionIds), [questionIds]);
  const selectedIds = selectedQuestionIds.filter((id) => availableQuestionIds.has(id));

  function setQuestionSelected(questionId: string, selected: boolean) {
    setSelectedQuestionIds((current) => setQuestionIdSelected(current, questionId, selected));
  }

  function setAllSelected(selected: boolean) {
    setSelectedQuestionIds(selectAllQuestionIds(questionIds, selected));
  }

  return { selectedIds, setQuestionSelected, setAllSelected };
}

export function QuestionBulkActionBar({
  questionIds,
  selectedIds,
  setAllSelected,
  publishAction,
  unpublishAction,
  practiceAction,
  assessmentAction,
}: {
  questionIds: string[];
  selectedIds: string[];
  setAllSelected: (selected: boolean) => void;
  publishAction: BulkQuestionAction;
  unpublishAction: BulkQuestionAction;
  practiceAction: BulkQuestionAction;
  assessmentAction: BulkQuestionAction;
}) {
  const allSelected = questionIds.length > 0 && selectedIds.length === questionIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const clearSelection = () => setAllSelected(false);
  const publishAndClear = (formData: FormData) => runQuestionBulkAction(publishAction, formData, clearSelection);
  const unpublishAndClear = (formData: FormData) => runQuestionBulkAction(unpublishAction, formData, clearSelection);
  const practiceAndClear = (formData: FormData) => runQuestionBulkAction(practiceAction, formData, clearSelection);
  const assessmentAndClear = (formData: FormData) => runQuestionBulkAction(assessmentAction, formData, clearSelection);

  return (
    <form className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3">
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={allSelected}
          aria-checked={someSelected ? "mixed" : allSelected}
          onChange={(event) => setAllSelected(event.currentTarget.checked)}
        />
        Select all
      </label>
      <span className="text-sm text-muted-foreground">
        {selectedIds.length} selected
      </span>
      {selectedIds.map((questionId) => (
        <input key={questionId} type="hidden" name="questionIds" value={questionId} />
      ))}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">Set type:</span>
        <Button type="submit" size="sm" variant="outline" formAction={practiceAndClear} disabled={selectedIds.length === 0}>
          Practice
        </Button>
        <Button type="submit" size="sm" variant="outline" formAction={assessmentAndClear} disabled={selectedIds.length === 0}>
          Assessment
        </Button>
        <Button type="submit" size="sm" formAction={publishAndClear} disabled={selectedIds.length === 0}>
          Publish
        </Button>
        <Button type="submit" size="sm" variant="outline" formAction={unpublishAndClear} disabled={selectedIds.length === 0}>
          Unpublish
        </Button>
      </div>
    </form>
  );
}

export function QuestionSelectionCheckbox({
  questionId,
  selected,
  setQuestionSelected,
}: {
  questionId: string;
  selected: boolean;
  setQuestionSelected: (questionId: string, selected: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      checked={selected}
      aria-label={`Select question ${questionId}`}
      onChange={(event) => setQuestionSelected(questionId, event.currentTarget.checked)}
    />
  );
}
