import { describe, expect, it } from "vitest";

import { createDiscountSchema, updateDiscountSchema } from "@platform/contracts/wire";

describe("discount wire contracts", () => {
  // Verifies the API contract does not accept notification flags that are not implemented.
  it("strips unsupported notification flags from discount mutations", () => {
    const createResult = createDiscountSchema.parse({
      code: "SAVE-ABC-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
      userIds: ["11111111-1111-4111-8111-111111111111"],
      sendEmail: true,
      sendNotification: true,
    });

    const updateResult = updateDiscountSchema.parse({
      code: "SAVE-ABC-1234",
      sendEmail: true,
      sendNotification: true,
    });

    expect(createResult).not.toHaveProperty("sendEmail");
    expect(createResult).not.toHaveProperty("sendNotification");
    expect(updateResult).not.toHaveProperty("sendEmail");
    expect(updateResult).not.toHaveProperty("sendNotification");
  });

  // Verifies selected-user assignment fields are not part of provider-wide discount mutations.
  it("strips unsupported selected-user fields from discount mutations", () => {
    const createResult = createDiscountSchema.parse({
      code: "SAVE-ABC-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
      userIds: ["11111111-1111-4111-8111-111111111111"],
    });

    const updateResult = updateDiscountSchema.parse({
      userIds: ["11111111-1111-4111-8111-111111111111"],
    });

    expect(createResult).not.toHaveProperty("userIds");
    expect(updateResult).not.toHaveProperty("userIds");
  });
});
