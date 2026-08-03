export type QuestionsIndexSearchDraft = {
  value: string;
  base: string;
  version: number;
};

export type QuestionsIndexSearchNavigation = {
  value: string;
  version: number;
};

export type QuestionsIndexSearchOwnership = {
  activeDraftVersion: number;
  pendingNavigations: QuestionsIndexSearchNavigation[];
  reconciledNavigations: QuestionsIndexSearchNavigation[];
  hasLocalSearchChange: boolean;
};

// Track only the newest owned search versions so recent stale responses still reconcile
// locally without letting superseded entries grow forever or claim unrelated future searches.
export const QUESTIONS_INDEX_SEARCH_OWNERSHIP_LIMIT = 20;

function findLatestMatchingNavigation(
  serverSearch: string,
  navigations: readonly QuestionsIndexSearchNavigation[],
) {
  return navigations.reduce<QuestionsIndexSearchNavigation | undefined>((latestMatch, navigation) => {
    if (navigation.value !== serverSearch) return latestMatch;
    if (!latestMatch) return navigation;
    return navigation.version > latestMatch.version ? navigation : latestMatch;
  }, undefined);
}

function appendLatestNavigation(
  navigations: readonly QuestionsIndexSearchNavigation[],
  navigation: QuestionsIndexSearchNavigation,
) {
  return [
    ...navigations.filter((currentNavigation) => currentNavigation.value !== navigation.value),
    navigation,
  ];
}

function pruneQuestionsIndexTrackedNavigations({
  pendingNavigations,
  reconciledNavigations,
}: {
  pendingNavigations: readonly QuestionsIndexSearchNavigation[];
  reconciledNavigations: readonly QuestionsIndexSearchNavigation[];
}) {
  const latestNavigationsByValue = new Map<
    string,
    QuestionsIndexSearchNavigation & { status: "pending" | "reconciled" }
  >();

  for (const navigation of reconciledNavigations) {
    const currentNavigation = latestNavigationsByValue.get(navigation.value);
    if (currentNavigation && currentNavigation.version >= navigation.version) continue;
    latestNavigationsByValue.set(navigation.value, { ...navigation, status: "reconciled" });
  }

  for (const navigation of pendingNavigations) {
    const currentNavigation = latestNavigationsByValue.get(navigation.value);
    if (currentNavigation && currentNavigation.version > navigation.version) continue;
    latestNavigationsByValue.set(navigation.value, { ...navigation, status: "pending" });
  }

  const trackedNavigations = [...latestNavigationsByValue.values()]
    .toSorted((first, second) => second.version - first.version)
    .slice(0, QUESTIONS_INDEX_SEARCH_OWNERSHIP_LIMIT)
    .toSorted((first, second) => first.version - second.version);

  return trackedNavigations.reduce<{
    pendingNavigations: QuestionsIndexSearchNavigation[];
    reconciledNavigations: QuestionsIndexSearchNavigation[];
  }>((nextTrackedNavigations, navigation) => {
    const targetNavigations = navigation.status === "pending"
      ? nextTrackedNavigations.pendingNavigations
      : nextTrackedNavigations.reconciledNavigations;
    targetNavigations.push({ value: navigation.value, version: navigation.version });
    return nextTrackedNavigations;
  }, {
    pendingNavigations: [],
    reconciledNavigations: [],
  });
}

export function queueQuestionsIndexPendingNavigation({
  searchOwnership,
  navigation,
}: {
  searchOwnership: QuestionsIndexSearchOwnership;
  navigation: QuestionsIndexSearchNavigation;
}) {
  const trackedNavigations = pruneQuestionsIndexTrackedNavigations({
    pendingNavigations: appendLatestNavigation(searchOwnership.pendingNavigations, navigation),
    reconciledNavigations: searchOwnership.reconciledNavigations,
  });

  return {
    ...searchOwnership,
    pendingNavigations: trackedNavigations.pendingNavigations,
    reconciledNavigations: trackedNavigations.reconciledNavigations,
  } satisfies QuestionsIndexSearchOwnership;
}

export function getQuestionsIndexDisplayedSearch({
  serverSearch,
  searchDraft,
  activeDraftVersion,
  pendingNavigations,
  reconciledNavigations,
}: {
  serverSearch: string;
  searchDraft: QuestionsIndexSearchDraft;
  activeDraftVersion: number;
  pendingNavigations: readonly QuestionsIndexSearchNavigation[];
  reconciledNavigations: readonly QuestionsIndexSearchNavigation[];
}) {
  if (searchDraft.version !== activeDraftVersion) return serverSearch;
  if (searchDraft.base === serverSearch) return searchDraft.value;

  const matchingOwnNavigation = findLatestMatchingNavigation(
    serverSearch,
    [...pendingNavigations, ...reconciledNavigations],
  );

  return matchingOwnNavigation && matchingOwnNavigation.version < searchDraft.version
    ? searchDraft.value
    : serverSearch;
}

export function reconcileQuestionsIndexServerSearch({
  serverSearch,
  pendingNavigations,
  reconciledNavigations,
}: {
  serverSearch: string;
  pendingNavigations: readonly QuestionsIndexSearchNavigation[];
  reconciledNavigations: readonly QuestionsIndexSearchNavigation[];
}) {
  const matchingPendingNavigation = findLatestMatchingNavigation(serverSearch, pendingNavigations);

  if (matchingPendingNavigation) {
    return {
      isExternal: false,
      matchingNavigation: matchingPendingNavigation,
      nextPendingNavigations: pendingNavigations.filter((navigation) => navigation.value !== serverSearch),
      nextReconciledNavigations: appendLatestNavigation(reconciledNavigations, matchingPendingNavigation),
    };
  }

  const matchingReconciledNavigation = findLatestMatchingNavigation(serverSearch, reconciledNavigations);

  if (matchingReconciledNavigation) {
    return {
      isExternal: false,
      matchingNavigation: matchingReconciledNavigation,
      nextPendingNavigations: [...pendingNavigations],
      nextReconciledNavigations: [...reconciledNavigations],
    };
  }

  return {
    isExternal: true,
    matchingNavigation: undefined,
    nextPendingNavigations: [] as QuestionsIndexSearchNavigation[],
    nextReconciledNavigations: [] as QuestionsIndexSearchNavigation[],
  };
}

export function reconcileQuestionsIndexSearchOwnership({
  searchOwnership,
  serverSearch,
}: {
  searchOwnership: QuestionsIndexSearchOwnership;
  serverSearch: string;
}) {
  const reconciliation = reconcileQuestionsIndexServerSearch({
    serverSearch,
    pendingNavigations: searchOwnership.pendingNavigations,
    reconciledNavigations: searchOwnership.reconciledNavigations,
  });

  if (reconciliation.isExternal) {
    return {
      reconciliation,
      nextSearchOwnership: {
        activeDraftVersion: searchOwnership.activeDraftVersion + 1,
        pendingNavigations: [],
        reconciledNavigations: [],
        hasLocalSearchChange: false,
      } satisfies QuestionsIndexSearchOwnership,
    };
  }

  return {
    reconciliation,
    nextSearchOwnership: {
      ...searchOwnership,
      ...pruneQuestionsIndexTrackedNavigations({
        pendingNavigations: reconciliation.nextPendingNavigations,
        reconciledNavigations: reconciliation.nextReconciledNavigations,
      }),
      hasLocalSearchChange: reconciliation.matchingNavigation?.version === searchOwnership.activeDraftVersion
        ? false
        : true,
    } satisfies QuestionsIndexSearchOwnership,
  };
}
