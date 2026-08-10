import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";

describe("Dialog hydration markup", () => {
  it("omits Radix generated trigger controls when no stable content id is supplied", () => {
    const markup = renderToStaticMarkup(createElement(
      Dialog,
      null,
      createElement(DialogTrigger, { asChild: true }, createElement("button", { type: "button" }, "Open")),
      createElement(DialogContent, null, "Content"),
    ));

    expect(markup).not.toContain("aria-controls");
    expect(markup).not.toContain("radix-");
  });

  it("preserves a caller-supplied deterministic content id", () => {
    const markup = renderToStaticMarkup(createElement(
      Dialog,
      null,
      createElement(DialogTrigger, { asChild: true, "aria-controls": "stable-dialog" }, createElement("button", { type: "button" }, "Open")),
      createElement(DialogContent, { id: "stable-dialog" }, "Content"),
    ));

    expect(markup).toContain('aria-controls="stable-dialog"');
  });
});
