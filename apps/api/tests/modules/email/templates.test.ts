import { describe, expect, it } from "vitest";

import { buildActionEmail } from "../../../src/modules/email/templates";

describe("authentication email templates", () => {
  it("escapes user-controlled names and URL markup in HTML", () => {
    const result = buildActionEmail({
      greetingName: `<img src=x onerror="alert(1)">`,
      instruction: "Reset your password",
      url: `https://app.example/reset?token=\"><script>alert(1)</script>`,
    });

    expect(result.html).not.toContain("<img");
    expect(result.html).not.toContain("<script>");
    expect(result.html).toContain("&lt;img");
    expect(result.html).toContain("&quot;&gt;&lt;script&gt;");
    expect(result.text).toContain("<img src=x");
  });
});
