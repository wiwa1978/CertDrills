import { describe, expect, it } from "vitest";

import { GET as getHealth } from "../../src/app/health/route";
import { GET as getReadiness } from "../../src/app/ready/route";

describe("unauthenticated health routes", () => {
  it("reports liveness without request context", async () => {
    const response = getHealth();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("reports readiness without request context", async () => {
    const response = getReadiness();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ready" });
  });
});
