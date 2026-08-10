"use client";

import { useActionState, useEffect, useState, type MouseEvent } from "react";
import { MoreHorizontal } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { CertDrillAdminExamForm, CertDrillAdminResource, CertDrillAdminScenario, CertDrillAdminScenarioContent, CertDrillScenarioGenerationJob } from "@/lib/api/certdrill.server";
import {
  archiveCertDrillScenarioAction,
  createCertDrillScenarioAction,
  publishSelectedCertDrillScenariosAction,
  updateCertDrillScenarioAction,
  unpublishSelectedCertDrillScenariosAction,
} from "./scenario-actions";
import { initialScenarioActionState } from "./scenario-action-state";
import { ScenarioGenerationControl, ScenarioGenerationStatusBanner } from "./scenario-generation-control";
import { ScenarioBulkActionBar, ScenarioSelectionCheckbox, useScenarioBulkSelection } from "./scenario-bulk-selection";
import { emptyScenarioFilters, filterScenarios, ScenarioFilterBar } from "./scenario-filter-bar";

const scenarioTemplate: CertDrillAdminScenarioContent = {
  initialNodeKey: "initial-situation",
  nodes: [
    {
      key: "initial-situation",
      title: "Initial situation",
      situation: "Describe the situation, constraints, and decision the learner must make.",
      evidence: ["Add the evidence available to the learner."],
      options: [
        {
          points: 100,
          key: "action-a",
          title: "Take action A",
          description: "Describe the first available action.",
          consequence: "Explain the immediate consequence of action A.",
          nextNodeKey: "follow-up",
        },
        {
          points: 0,
          key: "action-b",
          title: "Take action B",
          description: "Describe the alternative action.",
          consequence: "Explain the immediate consequence of action B.",
          nextNodeKey: "follow-up",
        },
      ],
    },
    {
      key: "follow-up",
      title: "Follow-up situation",
      situation: "Describe how the situation changed after the first decision.",
      evidence: ["Add new evidence revealed by the decision."],
      options: [
        {
          points: 100,
          key: "finish-a",
          title: "Complete with action A",
          description: "Describe the closing action.",
          consequence: "Explain the final outcome.",
          nextNodeKey: null,
        },
        {
          points: 0,
          key: "finish-b",
          title: "Complete with action B",
          description: "Describe the alternative closing action.",
          consequence: "Explain the alternative final outcome.",
          nextNodeKey: null,
        },
      ],
    },
  ],
};

type Props = {
  certificationId: string;
  scenarios: CertDrillAdminScenario[];
  examForms: CertDrillAdminExamForm[];
  resources?: CertDrillAdminResource[];
  initialGenerationJob?: CertDrillScenarioGenerationJob;
};

export function ScenarioAdmin({ certificationId, scenarios, examForms, resources = [], initialGenerationJob }: Props) {
  const [startedGeneration, setStartedGeneration] = useState<{ certificationId: string; job: CertDrillScenarioGenerationJob } | null>(null);
  const generationJob = startedGeneration?.certificationId === certificationId ? startedGeneration.job : initialGenerationJob;
  const [filters, setFilters] = useState(emptyScenarioFilters);
  const filteredScenarios = filterScenarios(scenarios, filters)
    .sort((first, second) => first.title.localeCompare(second.title) || first.id.localeCompare(second.id));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Scenarios</CardTitle>
              <CardDescription>Search, review, validate, and publish branching scenario groups before assigning them to exam forms.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <ScenarioGenerationControl certificationId={certificationId} resources={resources} onJobStarted={(job) => setStartedGeneration({ certificationId, job })} />
              <ScenarioDialog certificationId={certificationId} />
            </div>
          </div>
        </CardHeader>
        <div className="px-6"><ScenarioGenerationStatusBanner initialJob={generationJob} /></div>
        <CardContent className="space-y-4">
          {scenarios.length > 0 ? <ScenarioFilterBar filters={filters} onChange={setFilters} /> : null}
          {scenarios.length > 0 ? <p className="text-sm text-muted-foreground">Showing {filteredScenarios.length} of {scenarios.length} scenarios.</p> : null}
          {filteredScenarios.length > 0 ? <ScenarioTable certificationId={certificationId} scenarios={filteredScenarios} examForms={examForms} /> : scenarios.length > 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No scenarios match the current filters.</div>
          ) : (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">No scenarios yet. Create the first draft scenario.</div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}

function ScenarioTable({ certificationId, scenarios, examForms }: Pick<Props, "certificationId" | "scenarios" | "examForms">) {
  const formNames = new Map(examForms.map((form) => [form.id, form.name]));
  const actionableScenarioIds = scenarios.filter((scenario) => scenario.status !== "archived").map((scenario) => scenario.id);
  const selection = useScenarioBulkSelection(actionableScenarioIds);
  return (
    <div className="space-y-4">
      <ScenarioBulkActionBar certificationId={certificationId} scenarioIds={actionableScenarioIds} selectedIds={selection.selectedIds} setAllSelected={selection.setAllSelected} publishAction={publishSelectedCertDrillScenariosAction} unpublishAction={unpublishSelectedCertDrillScenariosAction} />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow><TableHead className="w-10"><span className="sr-only">Select</span></TableHead><TableHead>Scenario</TableHead><TableHead>Difficulty</TableHead><TableHead>Definition</TableHead><TableHead>Status</TableHead><TableHead>Exam forms</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {scenarios.map((scenario) => (
              <TableRow key={scenario.id}>
                <TableCell>{scenario.status !== "archived" ? <ScenarioSelectionCheckbox scenarioId={scenario.id} selected={selection.selectedIds.includes(scenario.id)} setScenarioSelected={selection.setScenarioSelected} /> : null}</TableCell>
                <TableCell><p className="font-medium">{scenario.title}</p>{scenario.description ? <p className="mt-1 max-w-md text-xs text-muted-foreground">{scenario.description}</p> : null}</TableCell>
                <TableCell className="capitalize">{scenario.difficulty}</TableCell>
                <TableCell>{scenario.contentJson.nodes.length} node{scenario.contentJson.nodes.length === 1 ? "" : "s"} · {scenario.estimatedMinutes} min</TableCell>
                <TableCell><ScenarioStatusBadge status={scenario.status} /></TableCell>
                <TableCell>{scenario.examFormIds.length > 0 ? scenario.examFormIds.map((id) => formNames.get(id) ?? "Unknown form").join(", ") : "—"}</TableCell>
                <TableCell><ScenarioActions certificationId={certificationId} scenario={scenario} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ScenarioStatusBadge({ status }: { status: CertDrillAdminScenario["status"] }) {
  const label = status === "published" ? "Published" : status === "validated" ? "Validated" : status === "archived" ? "Archived" : "Draft";
  return <Badge variant={status === "published" ? "default" : status === "validated" ? "outline" : "secondary"}>{label}</Badge>;
}

function ScenarioDialog({
  certificationId,
  scenario,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  certificationId: string;
  scenario?: CertDrillAdminScenario;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const serverAction = scenario ? updateCertDrillScenarioAction : createCertDrillScenarioAction;
  const [state, formAction, pending] = useActionState(serverAction, initialScenarioActionState);
  const dialogId = `scenario-${scenario?.id ?? "new"}-dialog`;

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [setOpen, state.status]);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger ? <DialogTrigger asChild><Button type="button" aria-controls={dialogId} variant={scenario ? "outline" : "default"} size={scenario ? "sm" : "default"}>{scenario ? "Edit" : "Create scenario"}</Button></DialogTrigger> : null}
      <DialogContent id={dialogId} className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{scenario ? "Update scenario" : "Create scenario"}</DialogTitle>
          <DialogDescription>{scenario ? "Saving returns the scenario to Draft and removes inactive exam form assignments. Validate and assign it again after review." : "Create a Draft, then use Validate after reviewing the complete branching definition."}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="certificationId" value={certificationId} />
          {scenario ? <input type="hidden" name="scenarioId" value={scenario.id} /> : null}
          {state.status === "error" ? <ActionMessage state={state} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title" name="title" defaultValue={scenario?.title} required />
            <Field label="Estimated duration in minutes" name="estimatedMinutes" type="number" min={1} max={240} defaultValue={scenario?.estimatedMinutes ?? 15} required />
          </div>
          <div className="space-y-2"><Label htmlFor={`${scenario?.id ?? "new"}-scenario-description`}>Description</Label><Textarea id={`${scenario?.id ?? "new"}-scenario-description`} name="description" defaultValue={scenario?.description ?? ""} maxLength={2000} /></div>
          <div className="space-y-2"><Label htmlFor={`${scenario?.id ?? "new"}-scenario-difficulty`}>Difficulty</Label><select id={`${scenario?.id ?? "new"}-scenario-difficulty`} name="difficulty" defaultValue={scenario?.difficulty ?? "medium"} className="h-9 w-full rounded-md border bg-transparent px-3 text-sm"><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></div>
          <div className="space-y-2">
            <Label htmlFor={`${scenario?.id ?? "new"}-scenario-content`}>Branching scenario definition</Label>
            <Textarea id={`${scenario?.id ?? "new"}-scenario-content`} name="contentJson" className="min-h-[26rem] font-mono text-xs" defaultValue={JSON.stringify(scenario?.contentJson ?? scenarioTemplate, null, 2)} required />
            <p className="text-xs text-muted-foreground">Node and option keys use lowercase letters, numbers, and hyphens. Set nextNodeKey to null to end the scenario after that option.</p>
          </div>
          <Button type="submit" disabled={pending}>{pending ? "Saving…" : scenario ? "Save changes" : "Create draft"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, name, ...props }: React.ComponentProps<typeof Input> & { label: string; name: string }) {
  const id = `scenario-${name}-${String(props.defaultValue ?? "new")}`;
  return <div className="space-y-2"><Label htmlFor={id}>{label}</Label><Input id={id} name={name} {...props} /></div>;
}

function stopPropagation(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

function ScenarioActions({ certificationId, scenario }: { certificationId: string; scenario: CertDrillAdminScenario }) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const archived = scenario.status === "archived";
  const triggerId = `scenario-actions-${scenario.id}`;

  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button id={triggerId} type="button" variant="ghost" size="icon" aria-label={`Actions for ${scenario.id}`} onClick={stopPropagation}>
            <MoreHorizontal className="size-4" />
            <span className="sr-only">Actions</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent aria-labelledby={triggerId} align="end" onClick={stopPropagation}>
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          {!archived ? <DropdownMenuSeparator /> : null}
          {!archived ? <DropdownMenuItem variant="destructive" onSelect={() => setArchiveOpen(true)}>Archive</DropdownMenuItem> : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <ScenarioDialog certificationId={certificationId} scenario={scenario} open={editOpen} onOpenChange={setEditOpen} hideTrigger />
      {!archived ? <ArchiveScenarioDialog certificationId={certificationId} scenario={scenario} open={archiveOpen} onOpenChange={setArchiveOpen} hideTrigger /> : null}
    </div>
  );
}

function ArchiveScenarioDialog({
  certificationId,
  scenario,
  open: controlledOpen,
  onOpenChange,
  hideTrigger = false,
}: {
  certificationId: string;
  scenario: CertDrillAdminScenario;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = onOpenChange ?? setInternalOpen;
  const [state, formAction, pending] = useActionState(archiveCertDrillScenarioAction, initialScenarioActionState);
  const dialogId = `scenario-${scenario.id}-archive-dialog`;

  useEffect(() => {
    if (state.status === "success") setOpen(false);
  }, [setOpen, state.status]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!hideTrigger ? <DialogTrigger asChild><Button type="button" aria-controls={dialogId} size="sm" variant="destructive">Archive</Button></DialogTrigger> : null}
      <DialogContent id={dialogId}>
        <DialogHeader>
          <DialogTitle>Archive scenario?</DialogTitle>
          <DialogDescription>Archived scenarios cannot be assigned to exam forms. Inactive exam form assignments will be removed.</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-4">
          <input type="hidden" name="certificationId" value={certificationId} />
          <input type="hidden" name="scenarioId" value={scenario.id} />
          {state.status === "error" ? <ActionMessage state={state} /> : null}
          <Button type="submit" variant="destructive" disabled={pending}>{pending ? "Archiving…" : "Archive scenario"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}


function ActionMessage({ state }: { state: { status: "idle" | "success" | "error"; message?: string } }) {
  return <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive" : "rounded-md border border-green-600/40 bg-green-600/10 p-3 text-sm"}>{state.message}</p>;
}
