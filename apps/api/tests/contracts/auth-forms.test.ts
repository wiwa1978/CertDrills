import { describe, expect, it } from "vitest";

import { createSignUpSchema, getPasswordSchema } from "@platform/contracts";

describe("auth form contracts", () => {
  it("allows signup schemas without password confirmation", () => {
    const schema = createSignUpSchema(getPasswordSchema(), { confirmPassword: false });

    expect(
      schema.safeParse({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "correct horse battery staple",
      }).success,
    ).toBe(true);
  });

  it("requires matching password confirmation by default", () => {
    const schema = createSignUpSchema(getPasswordSchema());

    expect(
      schema.safeParse({
        name: "Ada Lovelace",
        email: "ada@example.com",
        password: "correct horse battery staple",
      }).success,
    ).toBe(false);
  });
});
