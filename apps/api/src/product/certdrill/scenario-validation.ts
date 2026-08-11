import { z } from "zod";

import type { CertDrillScenarioContent } from "@platform/platform-db";

const keySchema = z.string().trim().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers, and hyphens.");

const scenarioOptionSchema = z.object({
  key: keySchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(1_000),
  consequence: z.string().trim().min(1).max(2_000),
  points: z.number().int().min(0).max(100).optional(),
  nextNodeKey: keySchema.nullable(),
}).strict();

const scenarioNodeSchema = z.object({
  key: keySchema,
  title: z.string().trim().min(1).max(200),
  situation: z.string().trim().min(1).max(4_000),
  evidence: z.array(z.string().trim().min(1).max(1_000)).max(10),
  options: z.array(scenarioOptionSchema).min(2).max(6),
}).strict();

export const scenarioContentSchema = z.object({
  initialNodeKey: keySchema,
  nodes: z.array(scenarioNodeSchema).min(1).max(20),
}).strict();

export const scenarioInputSchema = z.object({
  certificationId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  estimatedMinutes: z.number().int().min(1).max(240),
  contentJson: scenarioContentSchema,
}).strict();

export type ScenarioInput = z.infer<typeof scenarioInputSchema>;

export class ScenarioValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(" "));
    this.name = "ScenarioValidationError";
  }
}

export function validateScenarioGraph(value: CertDrillScenarioContent) {
  const content = scenarioContentSchema.parse(value);
  const issues: string[] = [];
  const nodesByKey = new Map<string, (typeof content.nodes)[number]>();

  for (const node of content.nodes) {
    if (nodesByKey.has(node.key)) issues.push(`Node key "${node.key}" is duplicated.`);
    nodesByKey.set(node.key, node);
    const optionKeys = new Set<string>();
    for (const option of node.options) {
      if (optionKeys.has(option.key)) issues.push(`Option key "${option.key}" is duplicated in node "${node.key}".`);
      optionKeys.add(option.key);
    }
    if (node.options.every((option, index) => (option.points ?? (index === 0 ? 100 : 0)) === 0)) issues.push(`Node "${node.key}" must have at least one option worth points.`);
  }

  if (!nodesByKey.has(content.initialNodeKey)) {
    issues.push(`Initial node "${content.initialNodeKey}" does not exist.`);
  }

  for (const node of content.nodes) {
    for (const option of node.options) {
      if (option.nextNodeKey !== null && !nodesByKey.has(option.nextNodeKey)) {
        issues.push(`Option "${option.key}" in node "${node.key}" points to missing node "${option.nextNodeKey}".`);
      }
    }
  }

  if (issues.length === 0) {
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (nodeKey: string) => {
      if (active.has(nodeKey)) {
        issues.push(`Scenario contains a cycle through node "${nodeKey}".`);
        return;
      }
      if (visited.has(nodeKey)) return;
      visited.add(nodeKey);
      active.add(nodeKey);
      const node = nodesByKey.get(nodeKey)!;
      for (const option of node.options) {
        if (option.nextNodeKey) visit(option.nextNodeKey);
      }
      active.delete(nodeKey);
    };
    visit(content.initialNodeKey);
    for (const node of content.nodes) {
      if (!visited.has(node.key)) issues.push(`Node "${node.key}" is unreachable from the initial node.`);
    }
  }

  if (issues.length > 0) throw new ScenarioValidationError([...new Set(issues)]);
  return content;
}
