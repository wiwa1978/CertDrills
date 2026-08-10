import { describe, expect, it } from "vitest";

import { selectAllScenarioIds, setScenarioIdSelected } from "@/modules/certdrill/scenario-bulk-selection";
import { emptyScenarioFilters, filterScenarios } from "@/modules/certdrill/scenario-filter-bar";
import type { CertDrillAdminScenario } from "@/lib/api/certdrill.server";

function scenario(id: string, title: string, status: CertDrillAdminScenario["status"], difficulty: CertDrillAdminScenario["difficulty"], situation: string): CertDrillAdminScenario {
  return {
    id,
    certificationId: "11111111-1111-4111-8111-111111111111",
    title,
    description: null,
    difficulty,
    estimatedMinutes: 10,
    status,
    validatedAt: status === "validated" || status === "published" ? "2026-08-10T10:00:00.000Z" : null,
    examFormIds: [],
    createdAt: "2026-08-10T09:00:00.000Z",
    updatedAt: "2026-08-10T09:00:00.000Z",
    contentJson: {
      initialNodeKey: "start",
      nodes: [{
        key: "start",
        title: "Start",
        situation,
        evidence: ["Audit signal"],
        options: [
          { key: "a", title: "Contain", description: "Contain access", consequence: "Access stops", nextNodeKey: null },
          { key: "b", title: "Observe", description: "Observe activity", consequence: "Evidence grows", nextNodeKey: null },
        ],
      }],
    },
  };
}

const scenarios = [
  scenario("22222222-2222-4222-8222-222222222222", "Identity response", "published", "hard", "A risky identity signs in."),
  scenario("33333333-3333-4333-8333-333333333333", "Network response", "draft", "medium", "A firewall alert fires."),
  scenario("44444444-4444-4444-8444-444444444444", "Legacy response", "archived", "easy", "A retired response path."),
];

describe("scenario table controls", () => {
  it("filters grouped scenario content by search, status, and difficulty", () => {
    expect(filterScenarios(scenarios, emptyScenarioFilters)).toHaveLength(3);
    expect(filterScenarios(scenarios, { search: "risky identity", status: "", difficulty: "" }).map((item) => item.title)).toEqual(["Identity response"]);
    expect(filterScenarios(scenarios, { search: "", status: "published", difficulty: "hard" }).map((item) => item.title)).toEqual(["Identity response"]);
    expect(filterScenarios(scenarios, { search: "", status: "draft", difficulty: "hard" })).toEqual([]);
    expect(filterScenarios(scenarios, { search: "", status: "archived", difficulty: "" }).map((item) => item.title)).toEqual(["Legacy response"]);
  });

  it("selects all filtered scenarios and keeps selection unique", () => {
    const ids = scenarios.filter((item) => item.status !== "archived").map((item) => item.id);
    expect(selectAllScenarioIds(ids, true)).toEqual(ids);
    expect(selectAllScenarioIds(ids, false)).toEqual([]);
    expect(setScenarioIdSelected([ids[0]!], ids[0]!, true)).toEqual([ids[0]]);
    expect(setScenarioIdSelected(ids, ids[0]!, false)).toEqual([ids[1]]);
  });
});
