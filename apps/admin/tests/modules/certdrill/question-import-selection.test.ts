import { describe, expect, it } from "vitest";

import {
  areAllQuestionImportDuplicatesIncluded,
  initialQuestionImportSelection,
  isQuestionImportRowDuplicate,
  reconcileQuestionImportSelection,
  setQuestionImportDuplicatesIncluded,
  setQuestionImportRowSelected,
  type QuestionImportSelectionState,
} from "@/modules/certdrill/question-import-selection";
import type { CertDrillQuestionImportPreviewRow } from "@/modules/certdrill/question-import-types";

function row(overrides: Partial<CertDrillQuestionImportPreviewRow> = {}): CertDrillQuestionImportPreviewRow {
  return {
    sourceIndex: 0,
    categoryCode: "SEC-01",
    categoryId: "33333333-3333-4333-8333-333333333333",
    stem: "Which option is correct?",
    difficulty: "medium",
    answerCount: 2,
    valid: true,
    duplicate: { existingQuestionIds: [], earlierSourceIndexes: [] },
    selectedByDefault: true,
    errors: [],
    ...overrides,
  };
}

function existingDuplicate(overrides: Partial<CertDrillQuestionImportPreviewRow> = {}) {
  return row({
    duplicate: { existingQuestionIds: ["44444444-4444-4444-8444-444444444444"], earlierSourceIndexes: [] },
    selectedByDefault: false,
    ...overrides,
  });
}

function batchDuplicate(overrides: Partial<CertDrillQuestionImportPreviewRow> = {}) {
  return row({
    duplicate: { existingQuestionIds: [], earlierSourceIndexes: [0] },
    selectedByDefault: false,
    ...overrides,
  });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return value;
}

describe("isQuestionImportRowDuplicate", () => {
  it("is false when there are no existing or earlier duplicate matches", () => {
    expect(isQuestionImportRowDuplicate(row())).toBe(false);
  });

  it("is true for an existing certification duplicate", () => {
    expect(isQuestionImportRowDuplicate(existingDuplicate({ sourceIndex: 1 }))).toBe(true);
  });

  it("is true for an earlier-in-batch duplicate", () => {
    expect(isQuestionImportRowDuplicate(batchDuplicate({ sourceIndex: 1 }))).toBe(true);
  });
});

describe("initialQuestionImportSelection", () => {
  it("selects only rows the server marked selectedByDefault, with no overrides", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 0, selectedByDefault: true }),
      row({ sourceIndex: 1, selectedByDefault: false, valid: false, errors: [{ field: "stem", message: "Required" }] }),
      existingDuplicate({ sourceIndex: 2 }),
      batchDuplicate({ sourceIndex: 3 }),
      row({ sourceIndex: 4, selectedByDefault: true }),
    ]);

    expect(initialQuestionImportSelection(rows)).toEqual({
      selected: [0, 4],
      duplicateOverrides: [],
    });
  });

  it("never selects an invalid row even if the server mismarks it selectedByDefault", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 0, valid: false, selectedByDefault: true, errors: [{ field: "stem", message: "Required" }] }),
    ]);

    expect(initialQuestionImportSelection(rows)).toEqual({ selected: [], duplicateOverrides: [] });
  });

  it("sorts and de-duplicates regardless of row order", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 3, selectedByDefault: true }),
      row({ sourceIndex: 1, selectedByDefault: true }),
      row({ sourceIndex: 2, selectedByDefault: true }),
    ]);

    expect(initialQuestionImportSelection(rows).selected).toEqual([1, 2, 3]);
  });

  it("returns an empty selection for an empty preview", () => {
    expect(initialQuestionImportSelection([])).toEqual({ selected: [], duplicateOverrides: [] });
  });
});

describe("setQuestionImportRowSelected", () => {
  const initial: QuestionImportSelectionState = deepFreeze({ selected: [], duplicateOverrides: [] });

  it("selects a valid nonduplicate row without adding an override", () => {
    const rows = deepFreeze([row({ sourceIndex: 0, selectedByDefault: false })]);

    expect(setQuestionImportRowSelected(initial, rows, 0, true)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("deselects a previously selected nonduplicate row", () => {
    const rows = deepFreeze([row({ sourceIndex: 0 })]);
    const selectedState = deepFreeze({ selected: [0], duplicateOverrides: [] });

    expect(setQuestionImportRowSelected(selectedState, rows, 0, false)).toEqual({
      selected: [],
      duplicateOverrides: [],
    });
  });

  it("selecting a valid duplicate explicitly adds both the selection and a duplicate override", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 2 })]);

    expect(setQuestionImportRowSelected(initial, rows, 2, true)).toEqual({
      selected: [2],
      duplicateOverrides: [2],
    });
  });

  it("deselecting a duplicate removes both the selection and its override", () => {
    const rows = deepFreeze([batchDuplicate({ sourceIndex: 3 })]);
    const selectedState = deepFreeze({ selected: [1, 3], duplicateOverrides: [3] });

    expect(setQuestionImportRowSelected(selectedState, rows, 3, false)).toEqual({
      selected: [1],
      duplicateOverrides: [],
    });
  });

  it("never selects an invalid row", () => {
    const rows = deepFreeze([row({ sourceIndex: 0, valid: false, errors: [{ field: "stem", message: "Required" }] })]);

    expect(setQuestionImportRowSelected(initial, rows, 0, true)).toBe(initial);
  });

  it("is a no-op for an unknown source index", () => {
    const rows = deepFreeze([row({ sourceIndex: 0 })]);

    expect(setQuestionImportRowSelected(initial, rows, 99, true)).toBe(initial);
  });

  it("is idempotent when selecting the same row twice", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 2 })]);
    const once = setQuestionImportRowSelected(initial, rows, 2, true);
    const twice = setQuestionImportRowSelected(once, rows, 2, true);

    expect(twice).toEqual(once);
  });

  it("is idempotent when deselecting an already-deselected row", () => {
    const rows = deepFreeze([row({ sourceIndex: 0 })]);

    expect(setQuestionImportRowSelected(initial, rows, 0, false)).toEqual(initial);
  });

  it("keeps selected and duplicateOverrides sorted when selecting out of numeric order", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 5, selectedByDefault: false }),
      existingDuplicate({ sourceIndex: 2 }),
      row({ sourceIndex: 0, selectedByDefault: false }),
    ]);

    let state = setQuestionImportRowSelected(initial, rows, 5, true);
    state = setQuestionImportRowSelected(state, rows, 0, true);
    state = setQuestionImportRowSelected(state, rows, 2, true);

    expect(state).toEqual({ selected: [0, 2, 5], duplicateOverrides: [2] });
  });
});

describe("setQuestionImportDuplicatesIncluded", () => {
  it("selects every valid duplicate row and its override while preserving already-selected nonduplicates", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 0, selectedByDefault: true }),
      existingDuplicate({ sourceIndex: 1 }),
      batchDuplicate({ sourceIndex: 2 }),
    ]);
    const state = deepFreeze({ selected: [0], duplicateOverrides: [] });

    expect(setQuestionImportDuplicatesIncluded(state, rows, true)).toEqual({
      selected: [0, 1, 2],
      duplicateOverrides: [1, 2],
    });
  });

  it("does not select an invalid duplicate row", () => {
    const rows = deepFreeze([
      existingDuplicate({ sourceIndex: 1, valid: false, errors: [{ field: "stem", message: "Required" }] }),
    ]);

    expect(setQuestionImportDuplicatesIncluded({ selected: [], duplicateOverrides: [] }, rows, true)).toEqual({
      selected: [],
      duplicateOverrides: [],
    });
  });

  it("removes every duplicate row and override while preserving nonduplicate selections", () => {
    const rows = deepFreeze([
      row({ sourceIndex: 0, selectedByDefault: true }),
      existingDuplicate({ sourceIndex: 1 }),
      batchDuplicate({ sourceIndex: 2 }),
    ]);
    const state = deepFreeze({ selected: [0, 1, 2], duplicateOverrides: [1, 2] });

    expect(setQuestionImportDuplicatesIncluded(state, rows, false)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("is idempotent when including duplicates twice", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 1 })]);
    const once = setQuestionImportDuplicatesIncluded({ selected: [], duplicateOverrides: [] }, rows, true);
    const twice = setQuestionImportDuplicatesIncluded(once, rows, true);

    expect(twice).toEqual(once);
  });

  it("is idempotent when excluding duplicates twice", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 1 })]);
    const excluded = setQuestionImportDuplicatesIncluded({ selected: [], duplicateOverrides: [] }, rows, false);

    expect(excluded).toEqual({ selected: [], duplicateOverrides: [] });
  });
});

describe("areAllQuestionImportDuplicatesIncluded", () => {
  it("is false when there are no duplicate rows at all", () => {
    const rows = deepFreeze([row({ sourceIndex: 0 })]);

    expect(areAllQuestionImportDuplicatesIncluded({ selected: [0], duplicateOverrides: [] }, rows)).toBe(false);
  });

  it("is false when only some duplicates are selected", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 1 }), batchDuplicate({ sourceIndex: 2 })]);

    expect(areAllQuestionImportDuplicatesIncluded({ selected: [1], duplicateOverrides: [1] }, rows)).toBe(false);
  });

  it("is true when every valid duplicate is selected", () => {
    const rows = deepFreeze([existingDuplicate({ sourceIndex: 1 }), batchDuplicate({ sourceIndex: 2 })]);

    expect(areAllQuestionImportDuplicatesIncluded({ selected: [1, 2], duplicateOverrides: [1, 2] }, rows)).toBe(true);
  });

  it("ignores invalid duplicate rows when deciding completeness", () => {
    const rows = deepFreeze([
      existingDuplicate({ sourceIndex: 1, valid: false, errors: [{ field: "stem", message: "Required" }] }),
    ]);

    expect(areAllQuestionImportDuplicatesIncluded({ selected: [], duplicateOverrides: [] }, rows)).toBe(false);
  });
});

describe("reconcileQuestionImportSelection", () => {
  it("drops a selected row that disappeared from the refreshed preview", () => {
    const previous = deepFreeze({ selected: [0, 1], duplicateOverrides: [] });
    const refreshed = deepFreeze([row({ sourceIndex: 0 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("drops a selected row that became invalid in the refreshed preview", () => {
    const previous = deepFreeze({ selected: [0, 1], duplicateOverrides: [] });
    const refreshed = deepFreeze([
      row({ sourceIndex: 0 }),
      row({ sourceIndex: 1, valid: false, errors: [{ field: "stem", message: "Required" }] }),
    ]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("retains a selected nonduplicate row unconditionally", () => {
    const previous = deepFreeze({ selected: [0], duplicateOverrides: [] });
    const refreshed = deepFreeze([row({ sourceIndex: 0 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [0],
      duplicateOverrides: [],
    });
  });

  it("retains a still-duplicate row only because it had an explicit prior override", () => {
    const previous = deepFreeze({ selected: [1], duplicateOverrides: [1] });
    const refreshed = deepFreeze([existingDuplicate({ sourceIndex: 1 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [1],
      duplicateOverrides: [1],
    });
  });

  it("drops a still-duplicate row that lacked an explicit prior override", () => {
    const previous = deepFreeze({ selected: [1], duplicateOverrides: [] });
    const refreshed = deepFreeze([existingDuplicate({ sourceIndex: 1 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [],
      duplicateOverrides: [],
    });
  });

  it("drops a newly-duplicate row that was previously selected without an override, forcing re-review", () => {
    // Row 1 was a plain nonduplicate row when first selected (no override needed then). The
    // refreshed preview now reports it as a batch duplicate of another submitted row.
    const previous = deepFreeze({ selected: [1], duplicateOverrides: [] });
    const refreshed = deepFreeze([batchDuplicate({ sourceIndex: 1 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [],
      duplicateOverrides: [],
    });
  });

  it("drops the override for a row that is retained but is no longer a duplicate", () => {
    // Row 1 was previously a duplicate with an explicit override; the refreshed preview now shows
    // it as a plain nonduplicate row (e.g. the conflicting earlier row was removed).
    const previous = deepFreeze({ selected: [1], duplicateOverrides: [1] });
    const refreshed = deepFreeze([row({ sourceIndex: 1 })]);

    expect(reconcileQuestionImportSelection(previous, refreshed)).toEqual({
      selected: [1],
      duplicateOverrides: [],
    });
  });

  it("sorts and de-duplicates the reconciled result", () => {
    const previous = deepFreeze({ selected: [3, 1, 1], duplicateOverrides: [] });
    const refreshed = deepFreeze([
      row({ sourceIndex: 1 }),
      row({ sourceIndex: 3 }),
    ]);

    expect(reconcileQuestionImportSelection(previous, refreshed).selected).toEqual([1, 3]);
  });

  it("returns an empty selection when the refreshed preview has no rows", () => {
    const previous = deepFreeze({ selected: [0, 1], duplicateOverrides: [1] });

    expect(reconcileQuestionImportSelection(previous, [])).toEqual({ selected: [], duplicateOverrides: [] });
  });
});
