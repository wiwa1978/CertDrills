import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../../../src/modules/certdrill/question-form-shell.tsx", import.meta.url),
  "utf8",
);

describe("QuestionFormShell", () => {
  it("uses action state and application-rendered validation", () => {
    expect(source).toContain('"use client"');
    expect(source).toContain("useActionState");
    expect(source).toContain("children(state)");
    expect(source).toContain("noValidate");
    expect(source).toContain('role="alert"');
    expect(source).toContain("Please correct the following");
    expect(source).toContain("href={`#${fieldId}`}");
    expect(source).toContain("onFieldErrorLink");
    expect(source).toContain("event.preventDefault()");
    expect(source).toContain("onFieldErrorLink(fieldName)");
  });

  it("shows pending and success states", () => {
    expect(source).toContain("useFormStatus");
    expect(source).toContain("Saving...");
    expect(source).toContain('role="status"');
  });
});
