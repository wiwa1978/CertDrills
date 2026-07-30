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

  it("contains CertDrill breadcrumb label", () => {
    expect(readEnglishMessages().breadcrumb.certdrill).toBe("CertDrill");
    expect(readDutchMessages().breadcrumb.certdrill).toBe("CertDrill");
    expect(readFrenchMessages().breadcrumb.certdrill).toBe("CertDrill");
  });
});
