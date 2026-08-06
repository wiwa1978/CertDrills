import { describe, expect, it } from "vitest";

import {
  exceedsQuestionImportByteLimit,
  questionImportByteLength,
  QUESTION_IMPORT_TOO_LARGE_MESSAGE,
} from "@/modules/certdrill/question-import-size";
import { MAX_QUESTION_IMPORT_BYTES } from "@/modules/certdrill/question-import-types";

// Matches the chunk size the helper measures with, so boundary handling can be exercised.
const MEASURE_CHUNK_LENGTH = 8192;

describe("question import byte length", () => {
  it("counts ASCII text as one byte per character", () => {
    expect(questionImportByteLength("")).toBe(0);
    expect(questionImportByteLength('{"version":1}')).toBe(13);
  });

  it("counts multibyte characters by their UTF-8 size, not by string length", () => {
    expect(questionImportByteLength("é")).toBe(2);
    expect(questionImportByteLength("€")).toBe(3);
    expect(questionImportByteLength("😀")).toBe(4);
    expect("😀".length).toBe(2);
    expect(questionImportByteLength("aé€😀")).toBe(1 + 2 + 3 + 4);
  });

  it("never splits a surrogate pair across measuring chunks", () => {
    const value = `${"a".repeat(MEASURE_CHUNK_LENGTH - 1)}😀${"b".repeat(10)}`;

    expect(questionImportByteLength(value)).toBe(MEASURE_CHUNK_LENGTH - 1 + 4 + 10);
    expect(questionImportByteLength(value)).toBe(new TextEncoder().encode(value).length);
  });

  it("stops counting once the optional limit is exceeded", () => {
    const value = "a".repeat(100_000);

    expect(questionImportByteLength(value, 1_000)).toBeGreaterThan(1_000);
    expect(questionImportByteLength(value, 1_000)).toBeLessThan(value.length);
    expect(questionImportByteLength(value, value.length)).toBe(value.length);
  });
});

describe("question import byte limit", () => {
  it("accepts documents at or below the 5 MB cap", () => {
    expect(exceedsQuestionImportByteLimit('{"version":1,"questions":[]}')).toBe(false);
    expect(exceedsQuestionImportByteLimit("a".repeat(MAX_QUESTION_IMPORT_BYTES))).toBe(false);
    expect(exceedsQuestionImportByteLimit("a".repeat(MAX_QUESTION_IMPORT_BYTES + 1))).toBe(true);
  });

  it("rejects multibyte input whose UTF-16 length still fits the cap", () => {
    // 3,000,000 UTF-16 code units (below the cap) but 6,000,000 UTF-8 bytes (above it).
    const multibyte = "é".repeat(3_000_000);

    expect(multibyte.length).toBeLessThan(MAX_QUESTION_IMPORT_BYTES);
    expect(exceedsQuestionImportByteLimit(multibyte)).toBe(true);
  });

  it("exposes one shared too-large message", () => {
    expect(QUESTION_IMPORT_TOO_LARGE_MESSAGE).toBe("Question import JSON must not exceed 5 MB.");
  });
});
