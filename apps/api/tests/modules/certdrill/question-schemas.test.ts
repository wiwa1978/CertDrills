import { describe, expect, it } from "vitest";

import { questionCreateSchema, questionUpdateSchema } from "../../../src/modules/certdrill/question-schemas";

const ids = {
  certification: "11111111-1111-4111-8111-111111111111",
  category: "22222222-2222-4222-8222-222222222222",
  sourceResource: "33333333-3333-4333-8333-333333333333",
  generationJob: "44444444-4444-4444-8444-444444444444",
};

function options(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    text: `Option ${index + 1}`,
    isCorrect: index === 0,
    explanation: `Explanation ${index + 1}`,
    citationUrls: [`https://docs.example.com/options/${index + 1}`],
    sortOrder: index,
  }));
}

function createPayload(optionCount: number) {
  return {
    certificationId: ids.certification,
    categoryId: ids.category,
    stem: "What is the correct answer?",
    difficulty: "medium" as const,
    status: "draft" as const,
    createdBy: "admin" as const,
    sourceResourceId: ids.sourceResource,
    generationJobId: ids.generationJob,
    options: options(optionCount),
  };
}

describe("CertDrill question schemas", () => {
  it("accepts create payloads with exactly two answer options", () => {
    expect(questionCreateSchema.safeParse(createPayload(2)).success).toBe(true);
  });

  it("accepts create payloads with exactly ten answer options", () => {
    expect(questionCreateSchema.safeParse(createPayload(10)).success).toBe(true);
  });

  it("rejects create payloads with one answer option", () => {
    expect(questionCreateSchema.safeParse(createPayload(1)).success).toBe(false);
  });

  it("rejects create payloads with an empty answer option list", () => {
    expect(questionCreateSchema.safeParse(createPayload(0)).success).toBe(false);
  });

  it("rejects update payloads with eleven answer options when provided", () => {
    expect(questionUpdateSchema.safeParse({ options: options(11) }).success).toBe(false);
  });

  it("accepts update payloads when answer options are omitted", () => {
    expect(questionUpdateSchema.safeParse({ stem: "Updated question stem" }).success).toBe(true);
  });
});
