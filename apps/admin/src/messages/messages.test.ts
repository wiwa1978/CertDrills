import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const LOCALES = ["en", "fr", "nl"] as const;

function readMessages(locale: (typeof LOCALES)[number]) {
  return JSON.parse(readFileSync(new URL(`./${locale}.json`, import.meta.url), "utf8"));
}

function messageShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(messageShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, messageShape(child)]),
    );
  }

  return typeof value;
}

describe("messages", () => {
  it.each(LOCALES)("keeps %s message shape in parity with English", (locale) => {
    expect(messageShape(readMessages(locale))).toEqual(messageShape(readMessages("en")));
  });
});
