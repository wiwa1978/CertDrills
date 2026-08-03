"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CertDrillAdminCategory } from "@/lib/api/certdrill.server";

type QuestionFilters = {
  questionSearch?: string;
  questionStatus?: string;
  questionDifficulty?: string;
  questionCategoryId?: string;
  questionSort?: string;
};

type QuestionFilterName = keyof QuestionFilters;
type SearchNavigation = { value: string; version: number };

const questionFilterNames: QuestionFilterName[] = [
  "questionSearch",
  "questionStatus",
  "questionDifficulty",
  "questionCategoryId",
  "questionSort",
];

export function QuestionFilterBar({
  categories,
  filters,
}: {
  categories: Array<Pick<CertDrillAdminCategory, "id" | "code" | "name">>;
  filters: QuestionFilters;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQueryString = searchParams.toString();
  const [search, setSearch] = useState(filters.questionSearch ?? "");
  const currentQueryParamsRef = useRef(new URLSearchParams(searchParams.toString()));
  const synchronizedQueryStringRef = useRef(currentQueryString);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchNavigationVersionRef = useRef(0);
  const pendingSearchNavigationsRef = useRef<SearchNavigation[]>([]);
  const hasLocalSearchChangeRef = useRef(false);

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

  const replaceFilter = useCallback((name: QuestionFilterName, value: string) => {
    const params = new URLSearchParams(currentQueryParamsRef.current);
    const trimmedValue = value.trim();

    params.set("tab", "questions");
    if (trimmedValue) {
      params.set(name, trimmedValue);
    } else {
      params.delete(name);
    }

    currentQueryParamsRef.current = params;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router]);

  useEffect(() => {
    const serverSearch = filters.questionSearch ?? "";
    const matchingNavigationIndex = pendingSearchNavigationsRef.current
      .findIndex((navigation) => navigation.value === serverSearch);

    if (matchingNavigationIndex >= 0) {
      const [matchingNavigation] = pendingSearchNavigationsRef.current.splice(matchingNavigationIndex, 1);
      if (matchingNavigation.version === searchNavigationVersionRef.current) {
        hasLocalSearchChangeRef.current = false;
      }
      return;
    }

    hasLocalSearchChangeRef.current = false;
    searchNavigationVersionRef.current += 1;
    cancelSearchDebounce();
    setSearch(serverSearch);
  }, [cancelSearchDebounce, filters.questionSearch]);

  useEffect(() => {
    const serverSearch = filters.questionSearch ?? "";
    if (search === serverSearch) {
      hasLocalSearchChangeRef.current = false;
      return;
    }

    if (!hasLocalSearchChangeRef.current) return;

    const version = searchNavigationVersionRef.current;
    if (pendingSearchNavigationsRef.current.some(
      (navigation) => navigation.value === search && navigation.version === version,
    )) return;

    const timeout = setTimeout(() => {
      if (searchNavigationVersionRef.current !== version) return;

      pendingSearchNavigationsRef.current.push({ value: search, version });
      searchDebounceRef.current = null;
      replaceFilter("questionSearch", search);
    }, 250);

    searchDebounceRef.current = timeout;
    return () => {
      clearTimeout(timeout);
      if (searchDebounceRef.current === timeout) searchDebounceRef.current = null;
    };
  }, [filters.questionSearch, replaceFilter, search]);

  function clearFilters() {
    const params = new URLSearchParams(currentQueryParamsRef.current);

    searchNavigationVersionRef.current += 1;
    cancelSearchDebounce();
    hasLocalSearchChangeRef.current = false;
    setSearch("");
    if (filters.questionSearch) {
      pendingSearchNavigationsRef.current.push({
        value: "",
        version: searchNavigationVersionRef.current,
      });
    }

    params.set("tab", "questions");
    questionFilterNames.forEach((name) => params.delete(name));
    params.delete("categoryId");
    currentQueryParamsRef.current = params;
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-6">
      <div className="space-y-2 xl:col-span-2">
        <Label htmlFor="question-search">Search questions</Label>
        <Input
          id="question-search"
          placeholder="Stem, option, category, status, difficulty"
          value={search}
          onChange={(event) => {
            searchNavigationVersionRef.current += 1;
            hasLocalSearchChangeRef.current = true;
            setSearch(event.target.value);
          }}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="question-category-filter">Filter by category</Label>
        <select
          id="question-category-filter"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={filters.questionCategoryId ?? ""}
          onChange={(event) => replaceFilter("questionCategoryId", event.target.value)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>{category.code} - {category.name}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="question-status-filter">Filter by status</Label>
        <select
          id="question-status-filter"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={filters.questionStatus ?? ""}
          onChange={(event) => replaceFilter("questionStatus", event.target.value)}
        >
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="question-difficulty-filter">Filter by difficulty</Label>
        <select
          id="question-difficulty-filter"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={filters.questionDifficulty ?? ""}
          onChange={(event) => replaceFilter("questionDifficulty", event.target.value)}
        >
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="question-sort">Sort by</Label>
        <select
          id="question-sort"
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
          value={filters.questionSort ?? "stem-asc"}
          onChange={(event) => replaceFilter("questionSort", event.target.value)}
        >
          <option value="stem-asc">Stem A-Z</option>
          <option value="stem-desc">Stem Z-A</option>
          <option value="status-asc">Status</option>
          <option value="difficulty-asc">Difficulty</option>
          <option value="id-asc">ID</option>
        </select>
      </div>
      <div className="flex items-end">
        <Button type="button" variant="outline" onClick={clearFilters}>Clear filters</Button>
      </div>
    </div>
  );
}
