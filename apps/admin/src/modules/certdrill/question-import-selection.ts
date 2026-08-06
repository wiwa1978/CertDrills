// Pure client-side selection state for the question import review/confirm UI. This is purely a
// convenience layer over the preview rows returned by the server - the server (question-import
// -service.ts) remains the authority on which rows are actually importable; it re-validates every
// selected/override index against the (possibly refreshed) preview before writing anything.

import type { CertDrillQuestionImportPreviewRow } from "./question-import-types";

export type QuestionImportSelectionState = {
  selected: number[];
  duplicateOverrides: number[];
};

function uniqueSorted(indexes: number[]): number[] {
  return Array.from(new Set(indexes)).sort((left, right) => left - right);
}

/** A row is a duplicate when it matches an existing question or an earlier row in this batch. */
export function isQuestionImportRowDuplicate(
  row: Pick<CertDrillQuestionImportPreviewRow, "duplicate">,
): boolean {
  return row.duplicate.existingQuestionIds.length > 0 || row.duplicate.earlierSourceIndexes.length > 0;
}

/**
 * Initial selection for a fresh preview: only rows the server marked `selectedByDefault` (which
 * are always valid, non-duplicate rows) start selected, and no duplicate has been overridden yet.
 */
export function initialQuestionImportSelection(
  rows: readonly CertDrillQuestionImportPreviewRow[],
): QuestionImportSelectionState {
  const selected = rows
    .filter((row) => row.valid && row.selectedByDefault)
    .map((row) => row.sourceIndex);

  return { selected: uniqueSorted(selected), duplicateOverrides: [] };
}

/**
 * Explicitly selects or deselects one row. Invalid rows (and unknown source indexes) can never be
 * selected. Selecting a duplicate row records an explicit override alongside the selection;
 * deselecting a row always clears both its selection and any override.
 */
export function setQuestionImportRowSelected(
  state: QuestionImportSelectionState,
  rows: readonly CertDrillQuestionImportPreviewRow[],
  sourceIndex: number,
  selected: boolean,
): QuestionImportSelectionState {
  const row = rows.find((candidate) => candidate.sourceIndex === sourceIndex);
  if (!row || !row.valid) return state;

  if (!selected) {
    return {
      selected: state.selected.filter((index) => index !== sourceIndex),
      duplicateOverrides: state.duplicateOverrides.filter((index) => index !== sourceIndex),
    };
  }

  return {
    selected: uniqueSorted([...state.selected, sourceIndex]),
    duplicateOverrides: isQuestionImportRowDuplicate(row)
      ? uniqueSorted([...state.duplicateOverrides, sourceIndex])
      : state.duplicateOverrides,
  };
}

/**
 * Batch "Include duplicates" toggle: selects (or removes) every otherwise-valid duplicate row and
 * its override in one step, without disturbing the selection state of nonduplicate rows.
 */
export function setQuestionImportDuplicatesIncluded(
  state: QuestionImportSelectionState,
  rows: readonly CertDrillQuestionImportPreviewRow[],
  included: boolean,
): QuestionImportSelectionState {
  const duplicateIndexes = rows
    .filter((row) => row.valid && isQuestionImportRowDuplicate(row))
    .map((row) => row.sourceIndex);

  if (included) {
    return {
      selected: uniqueSorted([...state.selected, ...duplicateIndexes]),
      duplicateOverrides: uniqueSorted([...state.duplicateOverrides, ...duplicateIndexes]),
    };
  }

  const duplicateIndexSet = new Set(duplicateIndexes);
  return {
    selected: state.selected.filter((index) => !duplicateIndexSet.has(index)),
    duplicateOverrides: state.duplicateOverrides.filter((index) => !duplicateIndexSet.has(index)),
  };
}

/** Whether every otherwise-valid duplicate row is currently selected (drives the batch checkbox). */
export function areAllQuestionImportDuplicatesIncluded(
  state: QuestionImportSelectionState,
  rows: readonly CertDrillQuestionImportPreviewRow[],
): boolean {
  const duplicateIndexes = rows
    .filter((row) => row.valid && isQuestionImportRowDuplicate(row))
    .map((row) => row.sourceIndex);

  if (duplicateIndexes.length === 0) return false;

  return duplicateIndexes.every((index) => state.selected.includes(index));
}

/**
 * Reconciles a selection against a refreshed preview after a confirm conflict (the document hash
 * or duplicate set changed underneath the reviewer). Rows that disappeared or became invalid are
 * dropped. Selected nonduplicate rows are retained as-is. A row that is (still, or now) a
 * duplicate is only retained if it already had an explicit prior override - a row that only just
 * became a duplicate was never explicitly reviewed as one, so it is dropped and must be reviewed
 * again. Overrides are trimmed to match: only selected rows that remain duplicates keep one.
 */
export function reconcileQuestionImportSelection(
  previousState: QuestionImportSelectionState,
  refreshedRows: readonly CertDrillQuestionImportPreviewRow[],
): QuestionImportSelectionState {
  const rowsBySourceIndex = new Map(refreshedRows.map((row) => [row.sourceIndex, row] as const));

  const selected = previousState.selected.filter((sourceIndex) => {
    const row = rowsBySourceIndex.get(sourceIndex);
    if (!row || !row.valid) return false;
    if (!isQuestionImportRowDuplicate(row)) return true;
    return previousState.duplicateOverrides.includes(sourceIndex);
  });
  const selectedSorted = uniqueSorted(selected);

  const duplicateOverrides = selectedSorted.filter((sourceIndex) => {
    const row = rowsBySourceIndex.get(sourceIndex);
    return row ? isQuestionImportRowDuplicate(row) : false;
  });

  return { selected: selectedSorted, duplicateOverrides: uniqueSorted(duplicateOverrides) };
}
