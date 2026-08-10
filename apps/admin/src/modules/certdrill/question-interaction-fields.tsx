"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CertDrillAdminQuestionInteraction, CertDrillAdminQuestionType } from "@/lib/api/certdrill.server";

export function QuestionInteractionFields({
  idPrefix,
  questionType,
  interaction,
  errors = [],
}: {
  idPrefix: string;
  questionType: Exclude<CertDrillAdminQuestionType, "single_choice">;
  interaction?: CertDrillAdminQuestionInteraction | null;
  errors?: string[];
}) {
  if (questionType === "fill_blank") {
    const fill = interaction?.type === "fill_blank" ? interaction : null;
    return (
      <section className="space-y-4 rounded-lg border p-4">
        <div>
          <h3 className="font-semibold">Fill-in-the-gap answer</h3>
          <p className="text-sm text-muted-foreground">Enter one accepted answer per line. Matching ignores letter case, Unicode presentation differences, and repeated whitespace.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${idPrefix}-accepted-answers`}>Accepted answers</Label>
          <Textarea id={`${idPrefix}-accepted-answers`} name="acceptedAnswers" required defaultValue={fill?.acceptedAnswers.join("\n") ?? ""} placeholder={"role-based access control\nRBAC"} />
        </div>
        <InteractionExplanation idPrefix={idPrefix} explanation={fill?.explanation} citationUrls={fill?.citationUrls} />
        <Errors messages={errors} />
      </section>
    );
  }

  return <MatchingFields idPrefix={idPrefix} interaction={interaction?.type === "matching" ? interaction : null} errors={errors} />;
}

type MatchingPairDraft = {
  key: string;
  ids: string;
  prompt: string;
  target: string;
  explanation: string;
  citationUrls: string;
};

function MatchingFields({ idPrefix, interaction, errors }: { idPrefix: string; interaction: Extract<CertDrillAdminQuestionInteraction, { type: "matching" }> | null; errors: string[] }) {
  const [nextKey, setNextKey] = useState(() => Math.max(2, interaction?.pairs.length ?? 0));
  const [pairs, setPairs] = useState<MatchingPairDraft[]>(() => interaction?.pairs.map((pair, index) => ({
    key: pair.promptId || `pair-${index}`,
    ids: `${pair.promptId}:${pair.targetId}`,
    prompt: pair.prompt,
    target: pair.target,
    explanation: pair.explanation,
    citationUrls: pair.citationUrls.join("\n"),
  })) ?? [blankPair("pair-0"), blankPair("pair-1")]);

  function update(key: string, field: keyof Omit<MatchingPairDraft, "key" | "ids">, value: string) {
    setPairs((current) => current.map((pair) => pair.key === key ? { ...pair, [field]: value } : pair));
  }

  function addPair() {
    const key = `pair-${nextKey}`;
    setNextKey((current) => current + 1);
    setPairs((current) => [...current, blankPair(key)]);
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Drag-and-drop matching pairs</h3>
          <p className="text-sm text-muted-foreground">Learners drag each target onto its matching prompt. Targets are shuffled for every attempt.</p>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={pairs.length >= 10} onClick={addPair}>Add pair</Button>
      </div>
      {pairs.map((pair, index) => (
        <div key={pair.key} className="space-y-3 rounded-md border bg-muted/30 p-4">
          <input type="hidden" name="matchingPairIds" value={pair.ids} />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium">Pair {index + 1}</p>
            <Button type="button" size="sm" variant="ghost" disabled={pairs.length <= 2} onClick={() => setPairs((current) => current.filter((item) => item.key !== pair.key))}>Remove</Button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`${idPrefix}-${pair.key}-prompt`}>Prompt</Label><Input id={`${idPrefix}-${pair.key}-prompt`} name="matchingPrompts" required value={pair.prompt} onChange={(event) => update(pair.key, "prompt", event.currentTarget.value)} placeholder="Azure RBAC" /></div>
            <div className="space-y-2"><Label htmlFor={`${idPrefix}-${pair.key}-target`}>Matching target</Label><Input id={`${idPrefix}-${pair.key}-target`} name="matchingTargets" required value={pair.target} onChange={(event) => update(pair.key, "target", event.currentTarget.value)} placeholder="Controls access with scoped role assignments" /></div>
          </div>
          <div className="space-y-2"><Label htmlFor={`${idPrefix}-${pair.key}-explanation`}>Explanation</Label><Textarea id={`${idPrefix}-${pair.key}-explanation`} name="matchingExplanations" value={pair.explanation} onChange={(event) => update(pair.key, "explanation", event.currentTarget.value)} /></div>
          <div className="space-y-2"><Label htmlFor={`${idPrefix}-${pair.key}-citations`}>Citation URLs</Label><Textarea id={`${idPrefix}-${pair.key}-citations`} name="matchingCitationUrls" value={pair.citationUrls} onChange={(event) => update(pair.key, "citationUrls", event.currentTarget.value)} placeholder="https://learn.microsoft.com/..." /></div>
        </div>
      ))}
      <Errors messages={errors} />
    </section>
  );
}

function InteractionExplanation({ idPrefix, explanation = "", citationUrls = [] }: { idPrefix: string; explanation?: string; citationUrls?: string[] }) {
  return (
    <>
      <div className="space-y-2"><Label htmlFor={`${idPrefix}-interaction-explanation`}>Explanation</Label><Textarea id={`${idPrefix}-interaction-explanation`} name="interactionExplanation" defaultValue={explanation} /></div>
      <div className="space-y-2"><Label htmlFor={`${idPrefix}-interaction-citations`}>Citation URLs</Label><Textarea id={`${idPrefix}-interaction-citations`} name="interactionCitationUrls" defaultValue={citationUrls.join("\n")} placeholder="https://learn.microsoft.com/..." /><p className="text-xs text-muted-foreground">One URL per line.</p></div>
    </>
  );
}

function blankPair(key: string): MatchingPairDraft {
  return { key, ids: ":", prompt: "", target: "", explanation: "", citationUrls: "" };
}

function Errors({ messages }: { messages: string[] }) {
  return messages.length > 0 ? <div role="alert" className="space-y-1 text-sm text-destructive">{messages.map((message) => <p key={message}>{message}</p>)}</div> : null;
}
