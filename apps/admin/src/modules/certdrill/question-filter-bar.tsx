"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [search, setSearch] = useState(filters.questionSearch ?? "");

  const replaceFilter = useCallback((name: QuestionFilterName, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    const trimmedValue = value.trim();

    params.set("tab", "questions");
    if (trimmedValue) {
      params.set(name, trimmedValue);
    } else {
      params.delete(name);
    }

    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [pathname, router, searchParams]);

  useEffect(() => {
    setSearch(filters.questionSearch ?? "");
  }, [filters.questionSearch]);

  useEffect(() => {
    const serverSearch = filters.questionSearch ?? "";
    if (search === serverSearch) return;

    const timeout = setTimeout(() => replaceFilter("questionSearch", search), 250);
    return () => clearTimeout(timeout);
  }, [filters.questionSearch, replaceFilter, search]);

  function clearFilters() {
    const params = new URLSearchParams(searchParams.toString());

    params.set("tab", "questions");
    questionFilterNames.forEach((name) => params.delete(name));
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
          onChange={(event) => setSearch(event.target.value)}
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
