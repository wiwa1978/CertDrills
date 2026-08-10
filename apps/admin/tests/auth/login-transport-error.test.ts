import { describe, expect, it } from "vitest";

import { unexpectedLoginErrorKey } from "@/modules/auth/login-transport-error";

describe("unexpectedLoginErrorKey", () => {
  it.each([
    "Failed to fetch",
    "Load failed",
    "NetworkError when attempting to fetch resource.",
  ])("classifies browser transport failure %s as a network error", (message) => {
    expect(unexpectedLoginErrorKey(new TypeError(message))).toBe("NETWORK_ERROR");
  });

  it("keeps unexpected application failures behind the generic error message", () => {
    expect(unexpectedLoginErrorKey(new Error("Sensitive internal detail"))).toBe("default");
    expect(unexpectedLoginErrorKey(new TypeError("Unexpected response shape"))).toBe("default");
    expect(unexpectedLoginErrorKey({ message: "Failed to fetch" })).toBe("default");
  });
});
