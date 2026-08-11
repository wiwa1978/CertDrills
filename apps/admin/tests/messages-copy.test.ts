import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readDutchMessages() {
  return JSON.parse(readFileSync(new URL("../src/messages/nl.json", import.meta.url), "utf8"));
}

describe("admin Dutch messages", () => {
  it("uses the admin product label in the hero badge", () => {
    expect(readDutchMessages().hero.badgeText).toBe("Singletenant - Hono - Admin");
  });
});
