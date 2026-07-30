import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function readMessages(locale: string) {
  return JSON.parse(readFileSync(new URL(`../src/messages/${locale}.json`, import.meta.url), "utf8"));
}

describe("admin message key parity", () => {
  it.each(["nl", "fr"])("matches English keys for %s", (locale) => {
    expect(flattenKeys(readMessages(locale)).sort()).toEqual(flattenKeys(readMessages("en")).sort());
  });
});
