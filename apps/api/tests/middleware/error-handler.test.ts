import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";

import type { AppEnv } from "../../src/context";

const logError = vi.fn();

vi.mock("../../src/env", () => ({
  env: { NODE_ENV: "development" },
}));

vi.mock("../../src/observability/logger", () => ({
  logger: { error: logError },
}));

const { errorHandler } = await import("../../src/middleware/error-handler");

describe("errorHandler", () => {
  it("never exposes internal exception details to clients", async () => {
    const app = new Hono<AppEnv>();
    app.use("/*", async (c, next) => {
      c.set("requestId", "request-1");
      await next();
    });
    app.get("/failure", () => {
      throw new Error("select sensitive_column from private_table");
    });
    app.onError(errorHandler);

    const response = await app.request("/failure");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toMatchObject({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Internal server error" },
      requestId: "request-1",
    });
    expect(JSON.stringify(body)).not.toContain("sensitive_column");
    expect(logError).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining("sensitive_column") }) }),
      "request.failed",
    );
  });
});
