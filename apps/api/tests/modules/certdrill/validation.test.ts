import { describe, expect, it } from "vitest";

import { validateCategorySiblingWeights, validateQuestionForPublish } from "../../../src/modules/certdrill/validation";

describe("CertDrill validation", () => {
  it("accepts sibling weights when there are no categories", () => {
    expect(validateCategorySiblingWeights([])).toEqual({ valid: true });
  });

  it("accepts sibling weights when every weight is null", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: null },
      { id: "b", weightPct: null },
    ])).toEqual({ valid: true });
  });

  it("accepts sibling weights that sum to 100", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: "30.00" },
      { id: "b", weightPct: "70.00" },
      { id: "c", weightPct: null },
    ])).toEqual({ valid: true });
  });

  it("accepts incremental sibling weights below 100", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: "30.00" },
      { id: "b", weightPct: "60.00" },
    ])).toEqual({ valid: true });
  });

  it("rejects sibling weights above 100", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: "60.00" },
      { id: "b", weightPct: "45.00" },
    ])).toEqual({ valid: false, total: 105, message: "Sibling category weights must not exceed 100. Current total: 105." });
  });

  it("rejects sibling weights with more than 2 decimal places", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: "33.333" },
      { id: "b", weightPct: "66.667" },
    ])).toEqual({ valid: false, total: 100, message: "Sibling category weights must use at most 2 decimal places." });
  });

  it("rejects non-numeric sibling weights", () => {
    expect(validateCategorySiblingWeights([
      { id: "a", weightPct: 100 },
      { id: "b", weightPct: "not-a-number" },
    ])).toEqual({ valid: false, total: 100, message: "Sibling category weights must be valid numbers." });
  });

  it("validates question publish requirements", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["https://docs.example.com/a"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({ valid: true, errors: [] });
  });

  it("accepts safe citation URL schemes", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["http://docs.example.com/a", "mailto:certdrill@example.com"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({ valid: true, errors: [] });
  });

  it("rejects unsafe citation URL schemes", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["javascript:alert(1)"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["data:text/html,unsafe"], mediaAssets: [] },
      ],
    })).toEqual({
      valid: false,
      errors: [
        "Option 1 citation URL 1 must use http, https, or mailto.",
        "Option 2 citation URL 1 must use http, https, or mailto.",
      ],
    });
  });

  it("rejects missing citations and non-image media", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [{ url: "https://example.com/file.svg", mimeType: "image/svg+xml" }],
      options: [
        { isCorrect: true, explanation: "", citationUrls: [], mediaAssets: [] },
        { isCorrect: true, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({
      valid: false,
      errors: [
        "Exactly one answer option must be correct.",
        "Option 1 must have a non-empty explanation.",
        "Option 1 must have at least one citation URL.",
        "Question media asset 1 must be image/png or image/jpeg.",
      ],
    });
  });

  it("rejects invalid option media assets", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [],
      options: [
        {
          isCorrect: true,
          explanation: "Correct",
          citationUrls: ["https://docs.example.com/a"],
          mediaAssets: [{ url: "https://example.com/diagram.svg" }],
        },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({
      valid: false,
      errors: ["Option 1 media asset 1 must be image/png or image/jpeg."],
    });
  });

  it("rejects explicit MIME that conflicts with an allowed URL extension", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [{ url: "https://example.com/diagram.png", mimeType: "image/svg+xml" }],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["https://docs.example.com/a"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({
      valid: false,
      errors: ["Question media asset 1 must be image/png or image/jpeg."],
    });
  });

  it("accepts snake_case mime_type when it is an allowed image MIME", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [{ url: "https://example.com/diagram", mime_type: "image/png" }],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["https://docs.example.com/a"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({ valid: true, errors: [] });
  });

  it("accepts URL extension fallback with query strings and fragments", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [{ url: "https://example.com/diagram.jpeg?size=large#main" }],
      options: [
        { isCorrect: true, explanation: "Correct", citationUrls: ["https://docs.example.com/a"], mediaAssets: [] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({ valid: true, errors: [] });
  });

  it("returns deterministic option errors before question media errors", () => {
    expect(validateQuestionForPublish({
      mediaAssets: [{ url: "https://example.com/question.bmp" }],
      options: [
        { isCorrect: false, explanation: "", citationUrls: [], mediaAssets: [{ url: "https://example.com/option.svg" }] },
        { isCorrect: false, explanation: "Wrong", citationUrls: ["https://docs.example.com/b"], mediaAssets: [] },
      ],
    })).toEqual({
      valid: false,
      errors: [
        "Exactly one answer option must be correct.",
        "Option 1 must have a non-empty explanation.",
        "Option 1 must have at least one citation URL.",
        "Option 1 media asset 1 must be image/png or image/jpeg.",
        "Question media asset 1 must be image/png or image/jpeg.",
      ],
    });
  });
});
