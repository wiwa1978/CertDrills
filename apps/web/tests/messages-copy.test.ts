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

describe("web hero messages", () => {
  it("uses the CertDrills product label in the hero badge", () => {
    expect(readEnglishMessages().hero.badgeText).toBe("CertDrills");
    expect(readDutchMessages().hero.badgeText).toBe("CertDrills");
    expect(readFrenchMessages().hero.badgeText).toBe("CertDrills");
  });

  it("contains certification exam breadcrumb labels", () => {
    expect(readEnglishMessages().breadcrumb).toMatchObject({
      exams: "Exams",
      start: "Start",
      results: "Results",
      profile: "Profile",
      attempts: "Attempts",
    });
    expect(readDutchMessages().breadcrumb).toMatchObject({
      exams: "Examens",
      start: "Start",
      results: "Resultaten",
      profile: "Profiel",
      attempts: "Pogingen",
    });
    expect(readFrenchMessages().breadcrumb).toMatchObject({
      exams: "Examens",
      start: "Démarrer",
      results: "Résultats",
      profile: "Profil",
      attempts: "Tentatives",
    });
  });
});
