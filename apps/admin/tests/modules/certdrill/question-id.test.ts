import { describe, expect, it } from "vitest";
import { compactQuestionId } from "../../../src/modules/certdrill/question-id";

describe("compactQuestionId", () => {
  it("returns the first hyphen-delimited sequence for UUIDs", () => {
    expect(compactQuestionId("f59b5caa-dc5a-4d79-9ba8-b81643c1ef9f")).toBe("f59b5caa");
  });

  it("returns the first hyphen-delimited sequence for legacy ids", () => {
    expect(compactQuestionId("legacy-id")).toBe("legacy");
  });
});
