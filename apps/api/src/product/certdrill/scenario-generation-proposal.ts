import { z } from "zod";

import { scenarioContentSchema, validateScenarioGraph } from "./scenario-validation";

const generatedNodeSchema = scenarioContentSchema.shape.nodes.element.extend({
  options: scenarioContentSchema.shape.nodes.element.shape.options.max(4),
});
const generatedContentSchema = scenarioContentSchema.extend({
  nodes: z.array(generatedNodeSchema).min(2).max(6),
});

const generatedScenarioSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2_000).nullable(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  estimatedMinutes: z.number().int().min(1).max(240),
  contentJson: generatedContentSchema,
}).strict();

export const scenarioGenerationProposalSchema = z.object({
  scenarios: z.array(generatedScenarioSchema).min(1).max(2),
}).strict();

export type ScenarioGenerationProposal = z.infer<typeof scenarioGenerationProposalSchema>;

export function validateScenarioGenerationProposal(value: unknown, requestedCount: number, requestedDifficulty: "easy" | "medium" | "hard", existingTitles: string[]) {
  const proposal = scenarioGenerationProposalSchema.parse(value);
  if (proposal.scenarios.length !== requestedCount) {
    throw new Error(`Generator returned ${proposal.scenarios.length} scenarios; expected ${requestedCount}.`);
  }
  const titles = new Set(existingTitles.map(normalizedTitle));
  for (const scenario of proposal.scenarios) {
    const title = normalizedTitle(scenario.title);
    if (titles.has(title)) throw new Error(`Generator returned duplicate scenario title "${scenario.title}".`);
    if (scenario.difficulty !== requestedDifficulty) throw new Error(`Generator returned ${scenario.difficulty} difficulty; expected ${requestedDifficulty}.`);
    titles.add(title);
    validateScenarioGraph(scenario.contentJson);
  }
  return proposal;
}

function normalizedTitle(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
}

const unsupportedStructuredOutputKeywords = new Set([
  "default", "minLength", "maxLength", "pattern", "format", "minimum", "maximum",
  "multipleOf", "minItems", "maxItems", "uniqueItems",
]);

function sanitizeStructuredOutputSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeStructuredOutputSchema);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value)
      .filter(([key]) => !unsupportedStructuredOutputKeywords.has(key))
      .map(([key, nested]) => [key, sanitizeStructuredOutputSchema(nested)]));
  }
  return value;
}

const { $schema: _ignoredSchema, ...jsonSchema } = z.toJSONSchema(scenarioGenerationProposalSchema, {
  target: "draft-7",
  unrepresentable: "any",
});

export const scenarioGenerationProposalJsonSchema = sanitizeStructuredOutputSchema(jsonSchema) as Record<string, unknown>;
