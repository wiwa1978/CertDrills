import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { creditPackages } from "@platform/contracts";

const LOCALES = ["en", "fr", "nl"] as const;

function readMessages(locale: (typeof LOCALES)[number]) {
  return JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"));
}

describe("messages", () => {
  it.each(LOCALES)("defines credit pricing messages for every credit package in %s", (locale) => {
    const messages = readMessages(locale);

    for (const pkg of creditPackages) {
      expect(messages.creditPricing.packages[pkg.key]).toEqual({
        name: expect.any(String),
        description: expect.any(String),
        cta: expect.any(String),
      });
    }
  });
});
