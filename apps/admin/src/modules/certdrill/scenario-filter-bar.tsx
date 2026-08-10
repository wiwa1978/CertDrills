"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CertDrillAdminScenario } from "@/lib/api/certdrill.server";

export type ScenarioFilters = {
  search: string;
  status: "" | CertDrillAdminScenario["status"];
  difficulty: "" | CertDrillAdminScenario["difficulty"];
};

export const emptyScenarioFilters: ScenarioFilters = { search: "", status: "", difficulty: "" };

export function filterScenarios(scenarios: CertDrillAdminScenario[], filters: ScenarioFilters) {
  const search = filters.search.trim().toLocaleLowerCase();
  return scenarios.filter((scenario) => {
    if (filters.status && scenario.status !== filters.status) return false;
    if (filters.difficulty && scenario.difficulty !== filters.difficulty) return false;
    if (!search) return true;
    const searchable = [
      scenario.title,
      scenario.description ?? "",
      scenario.status,
      scenario.difficulty,
      ...scenario.contentJson.nodes.flatMap((node) => [
        node.title,
        node.situation,
        ...node.evidence,
        ...node.options.flatMap((option) => [option.title, option.description, option.consequence]),
      ]),
    ].join(" ").toLocaleLowerCase();
    return searchable.includes(search);
  });
}

export function ScenarioFilterBar({ filters, onChange }: { filters: ScenarioFilters; onChange: (filters: ScenarioFilters) => void }) {
  return (
    <div className="grid gap-4 rounded-lg border p-4 md:grid-cols-2 xl:grid-cols-5">
      <div className="space-y-2 xl:col-span-2">
        <Label htmlFor="scenario-search">Search scenarios</Label>
        <Input id="scenario-search" placeholder="Title, situation, evidence, decision" value={filters.search} onChange={(event) => onChange({ ...filters, search: event.currentTarget.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="scenario-status-filter">Filter by status</Label>
        <select id="scenario-status-filter" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.currentTarget.value as ScenarioFilters["status"] })}>
          <option value="">All statuses</option>
          <option value="draft">Draft</option>
          <option value="validated">Validated</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="scenario-difficulty-filter">Filter by difficulty</Label>
        <select id="scenario-difficulty-filter" className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs" value={filters.difficulty} onChange={(event) => onChange({ ...filters, difficulty: event.currentTarget.value as ScenarioFilters["difficulty"] })}>
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div className="flex items-end"><Button type="button" variant="outline" onClick={() => onChange(emptyScenarioFilters)}>Clear filters</Button></div>
    </div>
  );
}
