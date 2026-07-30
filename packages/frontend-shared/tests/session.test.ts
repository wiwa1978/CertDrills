import { describe, expect, it, vi } from "vitest";

import { createServerSessionHelpers } from "../src/session";

type TestSession = { user: { id: string; email: string } };

describe("createServerSessionHelpers", () => {
  it("returns null when getSession returns null", async () => {
    const helpers = createServerSessionHelpers<TestSession>({
      getHeaders: () => new Headers({ cookie: "session=missing" }),
      getSession: async () => null,
      redirectToLogin: () => {
        throw new Error("redirected");
      },
    });

    await expect(helpers.getCurrentSession()).resolves.toBeNull();
  });

  it("returns a session when getSession returns one", async () => {
    const session = { user: { id: "user_123", email: "user@example.com" } };
    const helpers = createServerSessionHelpers<TestSession>({
      getHeaders: () => new Headers({ cookie: "session=present" }),
      getSession: async () => session,
      redirectToLogin: () => {
        throw new Error("redirected");
      },
    });

    await expect(helpers.getCurrentSession()).resolves.toBe(session);
  });

  it("requireAuth returns the session when present", async () => {
    const session = { user: { id: "user_123", email: "user@example.com" } };
    const redirectToLogin = vi.fn(() => {
      throw new Error("redirected");
    });
    const helpers = createServerSessionHelpers<TestSession>({
      getHeaders: () => new Headers({ cookie: "session=present" }),
      getSession: async () => session,
      redirectToLogin,
    });

    await expect(helpers.requireAuth()).resolves.toBe(session);
    expect(redirectToLogin).not.toHaveBeenCalled();
  });

  it("requireAuth invokes the injected redirect when absent", async () => {
    const redirectError = new Error("redirected");
    const redirectToLogin = vi.fn(() => {
      throw redirectError;
    });
    const helpers = createServerSessionHelpers<TestSession>({
      getHeaders: () => new Headers({ cookie: "session=missing" }),
      getSession: async () => null,
      redirectToLogin,
    });

    await expect(helpers.requireAuth()).rejects.toBe(redirectError);
    expect(redirectToLogin).toHaveBeenCalledTimes(1);
  });

  it("evaluates headers for each session call", async () => {
    const headers = [new Headers({ cookie: "session=first" }), new Headers({ cookie: "session=second" })];
    const getHeaders = vi.fn(() => headers.shift() ?? new Headers());
    const getSession = vi.fn(async (requestHeaders: Headers) => ({
      user: { id: requestHeaders.get("cookie") ?? "missing", email: "user@example.com" },
    }));
    const helpers = createServerSessionHelpers<TestSession>({
      getHeaders,
      getSession,
      redirectToLogin: () => {
        throw new Error("redirected");
      },
    });

    await expect(helpers.getCurrentSession()).resolves.toEqual({
      user: { id: "session=first", email: "user@example.com" },
    });
    await expect(helpers.getCurrentSession()).resolves.toEqual({
      user: { id: "session=second", email: "user@example.com" },
    });
    expect(getHeaders).toHaveBeenCalledTimes(2);
  });
});
