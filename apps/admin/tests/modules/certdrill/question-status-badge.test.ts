import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { QuestionStatusBadge } from "@/modules/certdrill/question-status-badge";

describe("question status badge", () => {
  it("renders published as a capitalized green label", () => {
    const markup = renderToStaticMarkup(createElement(QuestionStatusBadge, { status: "published" }));

    expect(markup).toContain(">Published</span>");
    expect(markup).toContain("bg-green-600/10");
    expect(markup).toContain("text-green-700");
  });

  it("does not apply the published treatment to drafts", () => {
    const markup = renderToStaticMarkup(createElement(QuestionStatusBadge, { status: "draft" }));

    expect(markup).toContain(">Draft</span>");
    expect(markup).not.toContain("bg-green-600/10");
  });
});
