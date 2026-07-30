import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-query", () => ({
  useQuery: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
    if (queryKey.includes("balance")) {
      return {
        data: { balance: 42 },
        isError: false,
        isLoading: false,
      };
    }

    return {
      data: { billing: { creditSurfacesEnabled: true } },
      isError: false,
      isLoading: false,
    };
  }),
}));

vi.mock("@/lib/api/me", () => ({
  getMyApplicationConfig: vi.fn(),
}));

vi.mock("@/lib/services/credits", () => ({
  getCreditBalance: vi.fn(),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => ({ credits: "credits", upgrade: "Upgrade" })[key] ?? key,
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/en/admin/overview",
}));

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) =>
    createElement("a", { href, className }, children),
}));

vi.mock("@/components/ui/sidebar", () => ({
  useSidebar: () => ({ state: "expanded" }),
}));

import { CreditProgressBar } from "@/components/layout/backend/shared/credit-progress-bar";

describe("CreditProgressBar", () => {
  it("shows the upgrade link on admin routes", () => {
    const markup = renderToStaticMarkup(createElement(CreditProgressBar));

    expect(markup).toContain("Upgrade");
    expect(markup).toContain('href="/billing"');
  });
});
