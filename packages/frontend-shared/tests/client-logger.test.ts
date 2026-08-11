import { afterEach, describe, expect, it, vi } from "vitest";

import { createClientLogger } from "../src/client-logger";

describe("createClientLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints serialized errors to the local console", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createClientLogger({ endpoint: "http://localhost/logs/client" }).logger;
    const error = new TypeError("Failed to fetch");

    logger.error("request failed", { error });

    const context = consoleError.mock.calls[0]?.[1];

    expect(JSON.parse(JSON.stringify(context))).toMatchObject({
      error: {
        name: "TypeError",
        message: "Failed to fetch",
      },
    });
  });

  it("redacts credentials from nested request context", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const logger = createClientLogger({ endpoint: "http://localhost/logs/client" }).logger;

    logger.error("request failed", {
      password: "top-secret",
      headers: { authorization: "Bearer token", cookie: "session=secret" },
      request: {
        body: JSON.stringify({ email: "user@example.com", password: "top-secret", rememberMe: false }),
      },
    });

    expect(consoleError.mock.calls[0]?.[1]).toEqual({
      password: "[REDACTED]",
      headers: { authorization: "[REDACTED]", cookie: "[REDACTED]" },
      request: {
        body: JSON.stringify({ email: "user@example.com", password: "[REDACTED]", rememberMe: false }),
      },
    });
  });
});
