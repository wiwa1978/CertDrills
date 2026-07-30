import { describe, expect, it } from "vitest";

import {
  formatDate,
  formatDateTime,
  formatTime,
  getPathSegments,
  stripLocaleFromPath,
} from "../../src/lib/utils";

describe("web lib/utils", () => {
  it("strips locale prefixes only at the start", () => {
    expect(stripLocaleFromPath("/en/dashboard")).toBe("/dashboard");
    expect(stripLocaleFromPath("/fr/settings/account")).toBe("/settings/account");
    expect(stripLocaleFromPath("/nl")).toBe("/nl");
    expect(stripLocaleFromPath("/dashboard/en")).toBe("/dashboard/en");
  });

  it("returns path segments without empty items", () => {
    expect(getPathSegments("/en/dashboard/settings")).toEqual(["dashboard", "settings"]);
    expect(getPathSegments("/billing")).toEqual(["billing"]);
    expect(getPathSegments("/")).toEqual([]);
  });

  it("formats date and time values consistently", () => {
    const date = new Date("2026-03-08T09:07:05.000Z");

    expect(formatDate(date)).toMatch(/^\d{2}-\d{2}-\d{4}$/);
    expect(formatDateTime(date)).toMatch(/^\d{2}-\d{2}-\d{4} \| \d{2}:\d{2}$/);
    expect(formatTime(date)).toMatch(/^\d{2}:07:05$/);
  });
});
