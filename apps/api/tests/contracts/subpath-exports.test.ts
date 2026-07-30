import { describe, expect, it } from "vitest";

import * as aggregate from "@platform/contracts";
import * as wire from "@platform/contracts/wire";
import * as ts from "@platform/contracts/ts";

/**
 * PR 1.1 — `@platform/contracts` is split into two subpath exports:
 *   - `/wire` : zod schemas, error codes, payload shapes (the cross-language
 *     contract — what a FastAPI/.NET reimplementation must honor)
 *   - `/ts`   : TS-only ergonomics (route URL builders, form helpers)
 *
 * The legacy aggregate `@platform/contracts` re-exports both for
 * backwards compatibility while consumers are migrated. These tests pin
 * the boundary so future PRs can't accidentally leak TS helpers into the
 * wire surface (which would silently break the OpenAPI generator added in
 * PR 1.2).
 */
describe("@platform/contracts subpath split", () => {
  it("wire exports zod schemas and error codes", () => {
    // Spot-check representative members of each wire sub-area.
    expect(typeof wire.mobileTokenRequestSchema).toBe("object");
    expect(typeof wire.errorCode).toBe("object");
    expect(typeof wire.paginationQuerySchema).toBe("object");
    expect(typeof wire.uuidSchema).toBe("object");
  });

  it("admin user stats contract includes global user total", () => {
    expect(wire.adminUserStatsSchema.parse({ totalUsers: 10, totalAdmins: 2, totalBanned: 1 })).toEqual({
      totalUsers: 10,
      totalAdmins: 2,
      totalBanned: 1,
    });
  });

  it("ts exports route URL builders and form helpers, not wire-only members", () => {
    // ts surface must include the route registry and form helpers.
    expect(typeof ts.apiRoutes).toBe("object");
    expect(typeof ts.signInSchema).toBe("object");
    expect(typeof ts.profileSchema).toBe("object");
    expect(typeof ts.getPasswordSchema).toBe("function");

    // ts surface must NOT include wire-only helpers — those live in /wire.
    expect((ts as Record<string, unknown>).errorCode).toBeUndefined();
    expect((ts as Record<string, unknown>).paginationQuerySchema).toBeUndefined();
  });

  it("wire surface must NOT include TS-only ergonomics", () => {
    // If any of these leak into /wire, the OpenAPI generator (PR 1.2) would
    // try to serialise non-wire helpers and a Python/.NET reimplementation
    // would inherit TS-specific concerns.
    expect((wire as Record<string, unknown>).apiRoutes).toBeUndefined();
    expect((wire as Record<string, unknown>).getPasswordSchema).toBeUndefined();
    expect((wire as Record<string, unknown>).signInSchema).toBeUndefined();
    expect((wire as Record<string, unknown>).profileSchema).toBeUndefined();
  });

  it("legacy aggregate re-exports both subpaths", () => {
    expect(aggregate.errorCode).toBe(wire.errorCode);
    expect(aggregate.paginationQuerySchema).toBe(wire.paginationQuerySchema);
    expect(aggregate.apiRoutes).toBe(ts.apiRoutes);
    expect(aggregate.getPasswordSchema).toBe(ts.getPasswordSchema);
  });
});
