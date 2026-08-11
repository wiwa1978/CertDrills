import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as transactionHelpers from "@/components/layout/backend/admin/billing/transaction-finance-dashboard-helpers";

const { parseTransactionDashboardQuery } = transactionHelpers;

const source = readFileSync(
  join(process.cwd(), "src/app/[locale]/(backend)/(admin)/admin/billing/page.tsx"),
  "utf8",
);
describe("admin billing transaction page routing", () => {
  it("routes every transaction section through the flat transaction parent tabs", () => {
    expect(source).toContain("getAdminBillingTransactionFinanceDashboardServer");
    expect(source).toContain("parseTransactionDashboardQueryForSection(activeSection, searchParams)");
    expect(source).not.toContain("parseTransactionDashboardQuery(searchParams)");
    expect(source).toContain('applicationConfig.billing.mode === "transactions"');
    expect(source).toContain("applicationConfig.billing.transactionSurfacesEnabled");
    expect(source).toContain("<TransactionAdminBillingTabs activeSection={transactionSection}>");
    expect(source).toContain("<TransactionFinanceDashboard activeSection={activeSection} dashboard={dashboard}");
    expect(source).toContain('activeSection === "discounts"');
    expect(source).not.toContain('transactionSurfacesEnabled && activeSection === "overview"');
  });

  it("preserves the existing subscription, credits, and fallback billing tabs", () => {
    expect(source).toContain("<SubscriptionFinanceDashboard");
    expect(source).toContain("<CreditsDashboard");
    expect(source).toContain("<DiscountsSection />");
    expect(source).toContain("<VouchersSection />");
    expect(source).toContain("<AdminBillingTabs activeSection={activeSection}>");
  });

  it("does not fetch transaction dashboard data for discounts or vouchers", () => {
    const usesDashboard = (transactionHelpers as typeof transactionHelpers & {
      transactionSectionUsesDashboard: (section: string) => boolean;
    }).transactionSectionUsesDashboard;

    expect(usesDashboard).toBeTypeOf("function");
    expect(usesDashboard("discounts")).toBe(false);
    expect(usesDashboard("vouchers")).toBe(false);
    for (const section of ["overview", "orders", "refunds", "products"]) {
      expect(usesDashboard(section)).toBe(true);
    }
    expect(usesDashboard("successful")).toBe(false);
    expect(usesDashboard("success")).toBe(false);
    expect(source).toContain("if (!transactionSectionUsesDashboard(activeSection))");
  });

  it("normalizes canonical and legacy transaction sections", () => {
    const normalize = (transactionHelpers as typeof transactionHelpers & {
      transactionAdminBillingSection: (section?: string, tab?: string) => string;
    }).transactionAdminBillingSection;

    expect(normalize).toBeTypeOf("function");
    expect(normalize(undefined, undefined)).toBe("overview");
    expect(normalize(undefined, "orders")).toBe("orders");
    expect(normalize(undefined, "success")).toBe("overview");
    expect(normalize("discounts", "orders")).toBe("discounts");
    expect(normalize("vouchers", "success")).toBe("vouchers");
    expect(normalize("invalid", "orders")).toBe("overview");
    expect(normalize(undefined, "invalid")).toBe("overview");
  });

  it("sanitizes malformed page bookmarks before calling the server helper", () => {
    expect(parseTransactionDashboardQuery({ range: "custom", startDate: "2026-02-31", currency: "ABCD", productKey: "unknown", page: "-2", section: "orders", tab: "refunds" }))
      .toEqual({ range: "30d", page: 1 });
  });
});
