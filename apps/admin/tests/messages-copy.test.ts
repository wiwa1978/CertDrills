import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function readDutchMessages() {
  return JSON.parse(readFileSync(new URL("../src/messages/nl.json", import.meta.url), "utf8"));
}

function readEnglishMessages() {
  return JSON.parse(readFileSync(new URL("../src/messages/en.json", import.meta.url), "utf8"));
}

function readFrenchMessages() {
  return JSON.parse(readFileSync(new URL("../src/messages/fr.json", import.meta.url), "utf8"));
}

describe("admin Dutch messages", () => {
  it("uses the admin product label in the hero badge", () => {
    expect(readDutchMessages().hero.badgeText).toBe("Singletenant - Hono - Admin");
  });

  it("contains all backend breadcrumb labels", () => {
    const messagesByLocale = [
      readEnglishMessages(),
      readDutchMessages(),
      readFrenchMessages(),
    ];

    for (const messages of messagesByLocale) {
      expect(messages.breadcrumb.certdrill).toBe("CertDrill");
      expect(messages.breadcrumb.questions).toBeTruthy();
      expect(messages.breadcrumb.new).toBeTruthy();
      expect(messages.breadcrumb.operations).toBeTruthy();
    }
  });
});
