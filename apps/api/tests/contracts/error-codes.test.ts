import { describe, expect, it } from "vitest";

import { errorCode, errorCodeSchema } from "@platform/contracts/wire";

describe("generic error codes", () => {
  it("includes a machine-readable bad gateway code", () => {
    expect(errorCode.badGateway).toBe("BAD_GATEWAY");
    expect(errorCodeSchema.parse("BAD_GATEWAY")).toBe("BAD_GATEWAY");
  });
});
