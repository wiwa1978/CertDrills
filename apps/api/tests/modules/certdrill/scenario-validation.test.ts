import { describe, expect, it } from "vitest";

import { validateScenarioGraph } from "../../../src/product/certdrill/scenario-validation";

function node(key: string, nextNodeKey: string | null) {
  return {
    key,
    title: key,
    situation: `Situation ${key}`,
    evidence: [],
    options: [
      { key: "a", title: "A", description: "A", consequence: "A", nextNodeKey },
      { key: "b", title: "B", description: "B", consequence: "B", nextNodeKey },
    ],
  };
}

describe("scenario graph validation", () => {
  it("accepts a reachable acyclic branching graph", () => {
    const content = { initialNodeKey: "start", nodes: [node("start", "finish"), node("finish", null)] };
    expect(validateScenarioGraph(content)).toEqual(content);
  });

  it("rejects missing targets and unreachable nodes", () => {
    expect(() => validateScenarioGraph({ initialNodeKey: "start", nodes: [node("start", "missing")] })).toThrow("missing node");
    expect(() => validateScenarioGraph({ initialNodeKey: "start", nodes: [node("start", null), node("orphan", null)] })).toThrow("unreachable");
  });

  it("rejects cycles that could trap a learner", () => {
    expect(() => validateScenarioGraph({ initialNodeKey: "start", nodes: [node("start", "loop"), node("loop", "start")] })).toThrow("cycle");
  });
});
