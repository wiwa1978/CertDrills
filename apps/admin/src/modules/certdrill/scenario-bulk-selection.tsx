"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

export type BulkScenarioAction = (formData: FormData) => void | Promise<void>;
export function setScenarioIdSelected(current: string[], scenarioId: string, selected: boolean) {
  return selected ? [...new Set([...current, scenarioId])] : current.filter((id) => id !== scenarioId);
}

export function selectAllScenarioIds(scenarioIds: string[], selected: boolean) {
  return selected ? [...scenarioIds] : [];
}


export function useScenarioBulkSelection(scenarioIds: string[]) {
  const [selectedScenarioIds, setSelectedScenarioIds] = useState<string[]>([]);
  const availableScenarioIds = useMemo(() => new Set(scenarioIds), [scenarioIds]);
  const selectedIds = selectedScenarioIds.filter((id) => availableScenarioIds.has(id));

  function setScenarioSelected(scenarioId: string, selected: boolean) {
    setSelectedScenarioIds((current) => setScenarioIdSelected(current, scenarioId, selected));
  }

  function setAllSelected(selected: boolean) {
    setSelectedScenarioIds(selectAllScenarioIds(scenarioIds, selected));
  }

  return { selectedIds, setScenarioSelected, setAllSelected };
}

export function ScenarioBulkActionBar({
  certificationId,
  scenarioIds,
  selectedIds,
  setAllSelected,
  publishAction,
  unpublishAction,
}: {
  certificationId: string;
  scenarioIds: string[];
  selectedIds: string[];
  setAllSelected: (selected: boolean) => void;
  publishAction: BulkScenarioAction;
  unpublishAction: BulkScenarioAction;
}) {
  const allSelected = scenarioIds.length > 0 && selectedIds.length === scenarioIds.length;
  const someSelected = selectedIds.length > 0 && !allSelected;
  const clearSelection = () => setAllSelected(false);
  const publishAndClear = async (formData: FormData) => { await publishAction(formData); clearSelection(); };
  const unpublishAndClear = async (formData: FormData) => { await unpublishAction(formData); clearSelection(); };

  return (
    <form className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/20 p-3">
      <input type="hidden" name="certificationId" value={certificationId} />
      <label className="flex items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={allSelected}
          aria-checked={someSelected ? "mixed" : allSelected}
          onChange={(event) => setAllSelected(event.currentTarget.checked)}
        />
        Select all
      </label>
      <span className="text-sm text-muted-foreground">{selectedIds.length} selected</span>
      {selectedIds.map((scenarioId) => <input key={scenarioId} type="hidden" name="scenarioIds" value={scenarioId} />)}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" formAction={publishAndClear} disabled={selectedIds.length === 0}>Publish</Button>
        <Button type="submit" size="sm" variant="outline" formAction={unpublishAndClear} disabled={selectedIds.length === 0}>Unpublish</Button>
      </div>
    </form>
  );
}

export function ScenarioSelectionCheckbox({
  scenarioId,
  selected,
  setScenarioSelected,
}: {
  scenarioId: string;
  selected: boolean;
  setScenarioSelected: (scenarioId: string, selected: boolean) => void;
}) {
  return <input type="checkbox" checked={selected} aria-label={`Select scenario ${scenarioId}`} onChange={(event) => setScenarioSelected(scenarioId, event.currentTarget.checked)} />;
}
