import { describe, expect, it } from "vitest";

import * as searchDraftModule from "../../../src/modules/certdrill/questions-index-search-draft";

import type {
  QuestionsIndexSearchDraft,
  QuestionsIndexSearchNavigation,
  QuestionsIndexSearchOwnership,
} from "../../../src/modules/certdrill/questions-index-search-draft";

const {
  getQuestionsIndexDisplayedSearch,
  reconcileQuestionsIndexSearchOwnership,
} = searchDraftModule;

const queueQuestionsIndexPendingNavigation = (
  searchDraftModule as {
    queueQuestionsIndexPendingNavigation?: (args: {
      searchOwnership: QuestionsIndexSearchOwnership;
      navigation: QuestionsIndexSearchNavigation;
    }) => QuestionsIndexSearchOwnership;
  }
).queueQuestionsIndexPendingNavigation;

const TRACKED_NAVIGATION_LIMIT = 20;

type SearchDraftHarnessState = {
  serverSearch: string;
  searchDraft: QuestionsIndexSearchDraft;
  searchOwnership: QuestionsIndexSearchOwnership;
};

function createHarness(serverSearch = ""): SearchDraftHarnessState {
  return {
    serverSearch,
    searchDraft: {
      value: serverSearch,
      base: serverSearch,
      version: 0,
    },
    searchOwnership: {
      activeDraftVersion: 0,
      pendingNavigations: [],
      reconciledNavigations: [],
      hasLocalSearchChange: false,
    },
  };
}

function typeSearch(state: SearchDraftHarnessState, value: string): SearchDraftHarnessState {
  const version = state.searchOwnership.activeDraftVersion + 1;
  return {
    ...state,
    searchDraft: {
      value,
      base: state.serverSearch,
      version,
    },
    searchOwnership: {
      ...state.searchOwnership,
      activeDraftVersion: version,
      hasLocalSearchChange: true,
    },
  };
}

function queueOwnNavigation(state: SearchDraftHarnessState): SearchDraftHarnessState {
  expect(queueQuestionsIndexPendingNavigation).toBeTypeOf("function");
  if (!queueQuestionsIndexPendingNavigation) return state;

  return {
    ...state,
    searchOwnership: queueQuestionsIndexPendingNavigation({
      searchOwnership: state.searchOwnership,
      navigation: { value: state.searchDraft.value, version: state.searchDraft.version },
    }),
  };
}

function displayedSearch(state: SearchDraftHarnessState) {
  return getQuestionsIndexDisplayedSearch({
    serverSearch: state.serverSearch,
    searchDraft: state.searchDraft,
    activeDraftVersion: state.searchOwnership.activeDraftVersion,
    pendingNavigations: state.searchOwnership.pendingNavigations,
    reconciledNavigations: state.searchOwnership.reconciledNavigations,
  });
}

function renderWithServerSearch(state: SearchDraftHarnessState, serverSearch: string) {
  return displayedSearch({ ...state, serverSearch });
}

function applyServerSearch(state: SearchDraftHarnessState, serverSearch: string): SearchDraftHarnessState {
  const result = reconcileQuestionsIndexSearchOwnership({
    serverSearch,
    searchOwnership: state.searchOwnership,
  });

  return {
    ...state,
    serverSearch,
    searchOwnership: result.nextSearchOwnership,
  };
}

function flushOwnNavigationForDisplayedSearch(state: SearchDraftHarnessState): SearchDraftHarnessState {
  if (!state.searchOwnership.hasLocalSearchChange) return state;
  if (displayedSearch(state) === state.serverSearch) return state;
  return queueOwnNavigation(state);
}

describe("questions index search draft", () => {
  it("keeps a newer local draft visible after an older own navigation resolves and after that navigation is reconciled", () => {
    let state = createHarness();

    state = typeSearch(state, "a");
    expect(displayedSearch(state)).toBe("a");

    state = queueOwnNavigation(state);
    state = typeSearch(state, "ab");
    expect(displayedSearch(state)).toBe("ab");

    expect(renderWithServerSearch(state, "a")).toBe("ab");

    state = applyServerSearch(state, "a");
    expect(state.searchOwnership.pendingNavigations).toEqual([]);
    expect(displayedSearch(state)).toBe("ab");

    state = queueOwnNavigation(state);
    expect(renderWithServerSearch(state, "ab")).toBe("ab");

    state = applyServerSearch(state, "ab");
    expect(state.searchOwnership.reconciledNavigations).toEqual([
      { value: "a", version: 1 },
      { value: "ab", version: 2 },
    ]);
    expect(displayedSearch(state)).toBe("ab");
  });

  it("replaces the local draft when the server search changes externally without a matching own navigation", () => {
    let state = createHarness();

    state = typeSearch(state, "a");
    state = queueOwnNavigation(state);
    state = typeSearch(state, "ab");
    state = applyServerSearch(state, "a");

    expect(renderWithServerSearch(state, "external-search")).toBe("external-search");

    state = applyServerSearch(state, "external-search");
    expect(state.searchOwnership.pendingNavigations).toEqual([]);
    expect(state.searchOwnership.reconciledNavigations).toEqual([]);
    expect(displayedSearch(state)).toBe("external-search");
    expect(renderWithServerSearch(state, "")).toBe("");
  });

  it("treats older previously reconciled own searches as local even after a newer own search is confirmed", () => {
    let state = createHarness();

    state = typeSearch(state, "a");
    state = queueOwnNavigation(state);
    state = typeSearch(state, "ab");
    state = queueOwnNavigation(state);

    state = applyServerSearch(state, "a");
    state = applyServerSearch(state, "ab");
    expect(state.searchOwnership.hasLocalSearchChange).toBe(false);
    expect(displayedSearch(state)).toBe("ab");

    expect(renderWithServerSearch(state, "a")).toBe("ab");

    state = applyServerSearch(state, "a");
    expect(state.searchOwnership.hasLocalSearchChange).toBe(true);
    expect(displayedSearch(state)).toBe("ab");

    state = flushOwnNavigationForDisplayedSearch(state);
    expect(state.searchOwnership.pendingNavigations).toEqual([{ value: "ab", version: 2 }]);

    expect(renderWithServerSearch(state, "ab")).toBe("ab");

    state = applyServerSearch(state, "ab");
    expect(state.searchOwnership.hasLocalSearchChange).toBe(false);
    expect(displayedSearch(state)).toBe("ab");
  });

  it("bounds pending ownership across many unique searches, prunes obsolete pending entries, and keeps recent stale own responses local", () => {
    let state = createHarness();

    for (let version = 1; version <= TRACKED_NAVIGATION_LIMIT + 5; version += 1) {
      state = typeSearch(state, `search-${version}`);
      state = queueOwnNavigation(state);
    }

    expect(state.searchOwnership.pendingNavigations).toHaveLength(TRACKED_NAVIGATION_LIMIT);
    expect(state.searchOwnership.pendingNavigations).toEqual(
      Array.from({ length: TRACKED_NAVIGATION_LIMIT }, (_, index) => {
        const version = index + 6;
        return { value: `search-${version}`, version };
      }),
    );

    expect(renderWithServerSearch(state, "search-5")).toBe("search-5");
    expect(renderWithServerSearch(state, "search-25")).toBe("search-25");

    state = typeSearch(state, "search-26");
    expect(renderWithServerSearch(state, "search-25")).toBe("search-26");

    state = applyServerSearch(state, "search-25");
    expect(displayedSearch(state)).toBe("search-26");
    expect(state.searchOwnership.pendingNavigations).toHaveLength(TRACKED_NAVIGATION_LIMIT - 1);
    expect(state.searchOwnership.reconciledNavigations).toEqual([{ value: "search-25", version: 25 }]);
  });

  it("bounds reconciled ownership history and prunes obsolete confirmed searches without breaking the stale-own-response guard", () => {
    let state = createHarness();

    for (let version = 1; version <= TRACKED_NAVIGATION_LIMIT + 5; version += 1) {
      state = typeSearch(state, `search-${version}`);
      state = queueOwnNavigation(state);
      state = applyServerSearch(state, `search-${version}`);
    }

    expect(state.searchOwnership.pendingNavigations).toEqual([]);
    expect(state.searchOwnership.reconciledNavigations).toHaveLength(TRACKED_NAVIGATION_LIMIT);
    expect(state.searchOwnership.reconciledNavigations).toEqual(
      Array.from({ length: TRACKED_NAVIGATION_LIMIT }, (_, index) => {
        const version = index + 6;
        return { value: `search-${version}`, version };
      }),
    );

    state = typeSearch(state, "search-26");
    expect(renderWithServerSearch(state, "search-24")).toBe("search-26");
    expect(renderWithServerSearch(state, "search-5")).toBe("search-5");

    state = applyServerSearch(state, "search-5");
    expect(state.searchOwnership.pendingNavigations).toEqual([]);
    expect(state.searchOwnership.reconciledNavigations).toEqual([]);
    expect(displayedSearch(state)).toBe("search-5");
  });
});
