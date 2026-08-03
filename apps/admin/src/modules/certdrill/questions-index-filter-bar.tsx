"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import {
  buildQuestionsIndexClearQuery,
  buildQuestionsIndexFilterQuery,
  buildQuestionsIndexHref,
  getQuestionsIndexCategoryOptions,
  type NormalizedQuestionsIndexQuery,
  type QuestionsIndexCategoryOption,
  type QuestionsIndexCertificationOption,
  type QuestionsIndexQuery,
} from "./questions-index-query";
import {
  getQuestionsIndexDisplayedSearch,
  reconcileQuestionsIndexSearchOwnership,
  type QuestionsIndexSearchDraft,
  type QuestionsIndexSearchNavigation,
  type QuestionsIndexSearchOwnership,
} from "./questions-index-search-draft";

function createSearchOwnership() {
  let snapshot: QuestionsIndexSearchOwnership = {
    activeDraftVersion: 0,
    pendingNavigations: [],
    reconciledNavigations: [],
    hasLocalSearchChange: false,
  };

  return {
    getSnapshot() {
      return snapshot;
    },
    incrementDraftVersion() {
      snapshot = {
        ...snapshot,
        activeDraftVersion: snapshot.activeDraftVersion + 1,
      };
      return snapshot.activeDraftVersion;
    },
    setHasLocalSearchChange(hasLocalSearchChange: boolean) {
      snapshot = {
        ...snapshot,
        hasLocalSearchChange,
      };
    },
    queuePendingNavigation(navigation: QuestionsIndexSearchNavigation) {
      snapshot = {
        ...snapshot,
        pendingNavigations: [
          ...snapshot.pendingNavigations.filter((currentNavigation) => currentNavigation.value !== navigation.value),
          navigation,
        ],
      };
    },
    reconcileServerSearch(serverSearch: string) {
      const result = reconcileQuestionsIndexSearchOwnership({
        searchOwnership: snapshot,
        serverSearch,
      });
      snapshot = result.nextSearchOwnership;
      return result.reconciliation;
    },
  };
}

function searchParamsToQuery(params: URLSearchParams): QuestionsIndexQuery {
  const query: QuestionsIndexQuery = {};

  for (const [key, value] of params.entries()) {
    const currentValue = query[key];
    if (currentValue === undefined) {
      query[key] = value;
      continue;
    }

    query[key] = Array.isArray(currentValue) ? [...currentValue, value] : [currentValue, value];
  }

  return query;
}

export function QuestionsIndexFilterBar({
  certifications,
  categories,
  query,
}: {
  certifications: QuestionsIndexCertificationOption[];
  categories: QuestionsIndexCategoryOption[];
  query: NormalizedQuestionsIndexQuery;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQueryString = searchParams.toString();
  const serverSearch = query.search ?? "";
  const [searchDraft, setSearchDraft] = useState<QuestionsIndexSearchDraft>({
    value: serverSearch,
    base: serverSearch,
    version: 0,
  });
  const [searchOwnership] = useState(createSearchOwnership);
  const currentQueryParamsRef = useRef(new URLSearchParams(searchParams.toString()));
  const synchronizedQueryStringRef = useRef(currentQueryString);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchOwnershipSnapshot = searchOwnership.getSnapshot();
  const search = getQuestionsIndexDisplayedSearch({
    serverSearch,
    searchDraft,
    activeDraftVersion: searchOwnershipSnapshot.activeDraftVersion,
    pendingNavigations: searchOwnershipSnapshot.pendingNavigations,
    reconciledNavigations: searchOwnershipSnapshot.reconciledNavigations,
  });
  const categoryOptions = useMemo(
    () => getQuestionsIndexCategoryOptions(query.certificationId, categories),
    [categories, query.certificationId],
  );

  useEffect(() => {
    if (synchronizedQueryStringRef.current === currentQueryString) return;

    synchronizedQueryStringRef.current = currentQueryString;
    currentQueryParamsRef.current = new URLSearchParams(currentQueryString);
  }, [currentQueryString]);

  const cancelSearchDebounce = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
  }, []);

  const replaceQuery = useCallback((nextQuery: QuestionsIndexQuery) => {
    const href = buildQuestionsIndexHref(pathname, nextQuery);
    synchronizedQueryStringRef.current = href.split("?")[1] ?? "";
    currentQueryParamsRef.current = new URLSearchParams(synchronizedQueryStringRef.current);
    router.replace(href, { scroll: false });
  }, [pathname, router]);

  const replaceFilter = useCallback((
    updates: Parameters<typeof buildQuestionsIndexFilterQuery>[1],
  ) => {
    const params = new URLSearchParams(currentQueryParamsRef.current);
    params.delete("page");
    currentQueryParamsRef.current = params;
    replaceQuery(buildQuestionsIndexFilterQuery(searchParamsToQuery(params), updates, categories));
  }, [categories, replaceQuery]);

  useEffect(() => {
    const reconciliation = searchOwnership.reconcileServerSearch(serverSearch);
    if (!reconciliation.isExternal) return;
    cancelSearchDebounce();
  }, [cancelSearchDebounce, searchOwnership, serverSearch]);

  useEffect(() => {
    const currentSearchOwnership = searchOwnership.getSnapshot();

    if (search === serverSearch) {
      searchOwnership.setHasLocalSearchChange(false);
      return;
    }

    if (!currentSearchOwnership.hasLocalSearchChange) return;

    const version = currentSearchOwnership.activeDraftVersion;
    if (currentSearchOwnership.pendingNavigations.some(
      (navigation) => navigation.value === search && navigation.version === version,
    )) return;

    const timeout = setTimeout(() => {
      if (searchOwnership.getSnapshot().activeDraftVersion !== version) return;

      searchOwnership.queuePendingNavigation({ value: search, version });
      searchDebounceRef.current = null;
      replaceFilter({ search });
    }, 250);

    searchDebounceRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      if (searchDebounceRef.current === timeout) searchDebounceRef.current = null;
    };
  }, [replaceFilter, search, searchOwnership, serverSearch]);

  function clearFilters() {
    const params = new URLSearchParams(currentQueryParamsRef.current);
    const version = searchOwnership.incrementDraftVersion();

    cancelSearchDebounce();
    searchOwnership.setHasLocalSearchChange(false);
    setSearchDraft({
      base: serverSearch,
      value: "",
      version,
    });
    if (serverSearch) {
      searchOwnership.queuePendingNavigation({
        value: "",
        version,
      });
    }

    params.delete("page");
    currentQueryParamsRef.current = params;
    replaceQuery(buildQuestionsIndexClearQuery(searchParamsToQuery(params)));
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="space-y-2 xl:col-span-2">
        <Label htmlFor="questions-index-search">Search across all certifications</Label>
        <Input
          id="questions-index-search"
          placeholder="Question stem, answer, certification, or category"
          value={search}
          onChange={(event) => {
            const version = searchOwnership.incrementDraftVersion();
            searchOwnership.setHasLocalSearchChange(true);
            setSearchDraft({
              base: serverSearch,
              value: event.target.value,
              version,
            });
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="questions-index-certification">Certification</Label>
        <select
          id="questions-index-certification"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={query.certificationId ?? ""}
          onChange={(event) => replaceFilter({ certificationId: event.target.value })}
        >
          <option value="">All certifications</option>
          {certifications.map((certification) => (
            <option key={certification.id} value={certification.id}>
              {certification.code} - {certification.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="questions-index-category">Category</Label>
        <select
          id="questions-index-category"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={query.categoryId ?? ""}
          onChange={(event) => replaceFilter({ categoryId: event.target.value })}
        >
          <option value="">All categories</option>
          {categoryOptions.map((category) => (
            <option key={category.id} value={category.id}>
              {category.code} - {category.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="questions-index-status">Status</Label>
        <select
          id="questions-index-status"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={query.status ?? ""}
          onChange={(event) => replaceFilter({ status: event.target.value })}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="questions-index-difficulty">Difficulty</Label>
        <select
          id="questions-index-difficulty"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={query.difficulty ?? ""}
          onChange={(event) => replaceFilter({ difficulty: event.target.value })}
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div className="flex items-end">
        <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button>
      </div>
    </div>
  );
}
