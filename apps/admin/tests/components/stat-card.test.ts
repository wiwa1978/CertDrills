import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import { Users } from "lucide-react";
import { StatCard } from "@/components/layout/backend/shared/stat-card";

describe("StatCard", () => {
  it("keeps icon tiles transparent in dark mode", () => {
    const markup = renderToStaticMarkup(
      createElement(StatCard, {
        title: "Total users",
        value: 2,
        icon: Users,
        iconColor: "text-blue-600",
        iconBgColor: "bg-blue-100",
      }),
    );

    expect(markup).toContain("bg-blue-100");
    expect(markup).toContain("dark:bg-transparent");
  });
});
