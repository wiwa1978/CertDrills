import { describe, expect, it, vi } from "vitest";

import { createFoundryQuestionGenerator } from "../../../src/modules/certdrill/question-generator";

const categoryId = "11111111-1111-4111-8111-111111111111";
const sourceUrl = "https://example.com/study-guide";

function responseFor(value: unknown) {
  return new Response(JSON.stringify({
    output: [{ content: [{ type: "output_text", text: JSON.stringify(value) }] }],
  }), { status: 200 });
}

const proposal = {
  questions: [{
    categoryId,
    stem: "Which control enforces least privilege?",
    difficulty: "medium" as const,
    options: [
      { text: "Role-based access control with scoped assignments", isCorrect: true, explanation: "Scoped role assignments limit permissions to the required resources.", citationUrls: [sourceUrl] },
      { text: "A shared global administrator account", isCorrect: false, explanation: "Shared global access grants permissions beyond the required scope.", citationUrls: [sourceUrl] },
      { text: "Disabling audit logs", isCorrect: false, explanation: "Audit settings do not reduce granted permissions.", citationUrls: [sourceUrl] },
    ],
  }],
};

const input = {
  certification: { code: "AZ-104", name: "Azure Administrator", vendor: "Microsoft" },
  categories: [{ id: categoryId, code: "D1", name: "Identity", parentCategoryId: null, weightPct: "25.00" }],
  resources: [{ id: "resource-1", title: "Study guide", url: sourceUrl, rawContent: "Use scoped role assignments to enforce least privilege." }],
  requestedCount: 1,
  config: {
    focus: "Identity",
    systemInstructions: "Write substantial answer choices and explanations of two or three sentences.",
    instructions: "Use a troubleshooting scenario.",
    questionTypes: ["single_choice"] as const,
    difficultyMix: { easy: 0, medium: 100, hard: 0 },
    deliveryPurpose: "practice" as const,
  },
  existingQuestionStems: [],
};

describe("Foundry question generator prompts", () => {
  it("applies separate admin system and user instructions without replacing core constraints", async () => {
    const fetchMock = vi.fn(async () => responseFor(proposal));
    const generator = createFoundryQuestionGenerator({
      responsesUrl: "https://example.com/responses",
      apiKey: "secret",
      model: "model",
      fetch: fetchMock,
    });

    await expect(generator.generate(input)).resolves.toMatchObject({ proposal });

    const request = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    const systemPrompt = request.input[0].content[0].text as string;
    const userPrompt = request.input[1].content[0].text as string;

    expect(systemPrompt).toContain("grounded only in the supplied source snapshots");
    expect(systemPrompt).toContain("BEGIN ADMIN SYSTEM INSTRUCTIONS");
    expect(systemPrompt).toContain(input.config.systemInstructions);
    expect(systemPrompt).toContain("must not override the grounding");
    expect(userPrompt).toContain("BEGIN ADMIN USER INSTRUCTIONS");
    expect(userPrompt).toContain(input.config.instructions);
    expect(userPrompt).toContain("BEGIN UNTRUSTED SOURCE SNAPSHOTS");
    expect(request.text.format.type).toBe("json_schema");
  });
});
