import { describe, expect, it } from "vitest";

import {
  questionGenerationProposalJsonSchema,
  validateQuestionGenerationProposal,
} from "../../../src/modules/certdrill/question-generation-proposal";

const sourceUrl = "https://docs.example.com/guide";
const categoryId = "33333333-3333-4333-8333-333333333333";

function output(stem = "Which control applies least privilege?", citationUrl = sourceUrl) {
  return {
    questions: [{
      categoryId,
      stem,
      difficulty: "medium",
      questionType: "single_choice",
      options: [
        { text: "Grant required actions", isCorrect: true, explanation: "This is least privilege.", citationUrls: [citationUrl] },
        { text: "Grant all actions", isCorrect: false, explanation: "This is overly broad.", citationUrls: [citationUrl] },
        { text: "Skip authorization", isCorrect: false, explanation: "This removes controls.", citationUrls: [citationUrl] },
      ],
    }],
  };
}

describe("question generation proposal", () => {
  it("accepts exact source citations and emits a strict structured-output schema", () => {
    expect(validateQuestionGenerationProposal(output(), {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      allowedCategoryIds: [categoryId],
      existingQuestionStems: [],
    })).toEqual(output());
    expect(questionGenerationProposalJsonSchema).toMatchObject({
      type: "object",
      additionalProperties: false,
      required: ["questions"],
    });
  });

  it("rejects unsupported citations, duplicate stems, and incorrect batch sizes", () => {
    expect(() => validateQuestionGenerationProposal(output(undefined, "https://untrusted.example.com"), {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      existingQuestionStems: [],
      allowedCategoryIds: [categoryId],
    })).toThrow("not supplied as source material");

    expect(() => validateQuestionGenerationProposal(output("  WHICH control applies least privilege? "), {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      existingQuestionStems: ["Which control applies least privilege?"],
      allowedCategoryIds: [categoryId],
    })).toThrow("already exists");

    expect(() => validateQuestionGenerationProposal(output(), {
      requestedCount: 2,
      allowedCitationUrls: [sourceUrl],
      existingQuestionStems: [],
      allowedCategoryIds: [categoryId],
    })).toThrow("expected 2");
  });

  it("requires one correct answer and citations for every explanation", () => {
    const invalid = output();
    invalid.questions[0]!.options[1]!.isCorrect = true;
    expect(() => validateQuestionGenerationProposal(invalid, {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      allowedCategoryIds: [categoryId],
      existingQuestionStems: [],
    })).toThrow();

    const missingCitation = output();
    missingCitation.questions[0]!.options[0]!.citationUrls = [];
    expect(() => validateQuestionGenerationProposal(missingCitation, {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      allowedCategoryIds: [categoryId],
      existingQuestionStems: [],
    })).toThrow();
  });

  it("rejects category assignments outside the supplied scope", () => {
    const invalid = output();
    invalid.questions[0]!.categoryId = "44444444-4444-4444-8444-444444444444";

    expect(() => validateQuestionGenerationProposal(invalid, {
      requestedCount: 1,
      allowedCitationUrls: [sourceUrl],
      allowedCategoryIds: [categoryId],
      existingQuestionStems: [],
    })).toThrow("outside the requested scope");
  });
  it("accepts grounded fill-in and matching question structures", () => {
    const proposal = {
      questions: [
        {
          categoryId,
          stem: "Complete the acronym for role-based access control.",
          difficulty: "easy",
          questionType: "fill_blank",
          acceptedAnswers: ["RBAC", "role-based access control"],
          explanation: "RBAC is the standard acronym.",
          citationUrls: [sourceUrl],
        },
        {
          categoryId,
          stem: "Match each control to its purpose.",
          difficulty: "medium",
          questionType: "matching",
          pairs: [
            { prompt: "RBAC", target: "Scoped role assignments", explanation: "RBAC controls authorization.", citationUrls: [sourceUrl] },
            { prompt: "Policy", target: "Compliance evaluation", explanation: "Policy evaluates resources.", citationUrls: [sourceUrl] },
          ],
        },
      ],
    };

    expect(validateQuestionGenerationProposal(proposal, {
      requestedCount: 2,
      allowedCitationUrls: [sourceUrl],
      allowedCategoryIds: [categoryId],
      existingQuestionStems: [],
    })).toMatchObject({ questions: [{ questionType: "fill_blank" }, { questionType: "matching" }] });
  });
});
