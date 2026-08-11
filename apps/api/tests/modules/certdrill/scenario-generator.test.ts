import { describe, expect, it, vi } from "vitest";

import { createFoundryScenarioGenerator, ScenarioGeneratorError } from "../../../src/product/certdrill/scenario-generator";

const contentJson = {
  initialNodeKey: "start",
  nodes: [
    {
      key: "start",
      title: "Initial signal",
      situation: "A privileged identity begins accessing atypical resources.",
      evidence: ["Sign-in risk is high."],
      options: [
        { key: "contain", title: "Contain", description: "Disable the identity.", consequence: "Access stops while investigation begins.", nextNodeKey: "investigate" },
        { key: "observe", title: "Observe", description: "Collect more telemetry.", consequence: "More evidence is available but access continues.", nextNodeKey: "investigate" },
      ],
    },
    {
      key: "investigate",
      title: "Investigation",
      situation: "The response team must close the incident.",
      evidence: ["The identity token was stolen."],
      options: [
        { key: "reset", title: "Reset", description: "Revoke sessions and reset credentials.", consequence: "The stolen session is invalidated.", nextNodeKey: null },
        { key: "ignore", title: "Ignore", description: "Close without remediation.", consequence: "The threat remains active.", nextNodeKey: null },
      ],
    },
  ],
};

function responseFor(value: unknown) {
  return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }] }), { status: 200 });
}

const input = {
  certification: { code: "SC-300", name: "Identity and Access Administrator", vendor: "Microsoft" },
  resources: [{ id: "resource-1", title: "Study guide", url: "https://example.com/guide", rawContent: "Respond to risky identity activity by revoking sessions." }],
  requestedCount: 1,
  difficulty: "medium" as const,
  focus: "Incident response",
  instructions: null,
  existingTitles: ["Existing scenario"],
};

describe("Foundry scenario generator", () => {
  it("requests grounded structured output and accepts a valid acyclic graph", async () => {
    const fetchMock = vi.fn(async () => responseFor({ scenarios: [{ title: "Risky identity response", description: "Contain a compromised identity.", difficulty: "medium", estimatedMinutes: 12, contentJson }] }));
    const generator = createFoundryScenarioGenerator({ responsesUrl: "https://example.com/responses", apiKey: "secret", model: "model", fetch: fetchMock });

    const result = await generator.generate(input);

    expect(result.proposal.scenarios).toHaveLength(1);
    expect(result.proposal.scenarios[0]?.contentJson.nodes).toHaveLength(2);
    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(request.text.format.type).toBe("json_schema");
    expect(JSON.stringify(request.input)).toContain("BEGIN UNTRUSTED SOURCE SNAPSHOTS");
    expect(JSON.stringify(request.input)).toContain("revoking sessions");
  });

  it("rejects a cyclic generated graph before persistence", async () => {
    const cyclic = structuredClone(contentJson);
    cyclic.nodes[1]!.options[0]!.nextNodeKey = "start";
    const generator = createFoundryScenarioGenerator({
      responsesUrl: "https://example.com/responses",
      apiKey: "secret",
      model: "model",
      fetch: vi.fn(async () => responseFor({ scenarios: [{ title: "Cyclic response", description: null, difficulty: "medium", estimatedMinutes: 12, contentJson: cyclic }] })),
    });

    await expect(generator.generate(input)).rejects.toMatchObject<Partial<ScenarioGeneratorError>>({ code: "SCENARIO_GENERATOR_INVALID_OUTPUT" });
  });
});
