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

const creditsDashboardSource = readFileSync(
  new URL("../src/components/layout/backend/admin/billing/credits-dashboard.tsx", import.meta.url),
  "utf8",
);

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

  it("uses the billing namespace for the credits dashboard heading", () => {
    expect(creditsDashboardSource).toContain('const billingT = useTranslations("admin.billing");');
    expect(creditsDashboardSource).toContain('{billingT("title")}');
    expect(creditsDashboardSource).toContain('{billingT("description")}');
  });
});
