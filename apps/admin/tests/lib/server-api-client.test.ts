import { describe, expect, it, vi } from "vitest";

const { capturedOptions } = vi.hoisted(() => ({
  capturedOptions: {
    current: undefined as
      | {
          getHeaders?: () => HeadersInit | undefined | Promise<HeadersInit | undefined>;
        }
      | undefined,
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    toString: (): string => "better-auth.session_token=session-token",
  })),
}));
vi.mock("@/env", () => ({
  env: {
    NEXT_PUBLIC_API_URL: "http://192.168.1.213:8877",
    NEXT_PUBLIC_APP_URL: "http://192.168.1.213:3201",
  },
}));
vi.mock("@platform/frontend-shared", () => ({
  normalizeBaseUrl: (value: string) => value.replace(/\/$/, ""),
  createApiRequest: (options: typeof capturedOptions.current) => {
    capturedOptions.current = options;
    return vi.fn();
  },
}));

await import("../../src/lib/api/client.server");

describe("admin server API client", () => {
  it("identifies the trusted admin origin when forwarding a session cookie", async () => {
    const headers = new Headers(await capturedOptions.current?.getHeaders?.());

    expect(headers.get("cookie")).toBe("better-auth.session_token=session-token");
    expect(headers.get("origin")).toBe("http://192.168.1.213:3201");
  });
});
