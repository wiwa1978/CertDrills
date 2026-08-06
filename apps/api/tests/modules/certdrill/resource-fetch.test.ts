import type { LookupAddress, LookupOneOptions } from "node:dns";

import { describe, expect, it, vi } from "vitest";

import {
  assertPublicResourceUrl,
  fetchPublicResource,
  ResourceFetchError,
} from "../../../src/modules/certdrill/resource-fetch";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();
const PUBLIC_ADDRESS = "93.184.216.34";

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void;
type LookupAllCallback = (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void;
type LookupAllOptions = LookupOneOptions & { all: true };
type InjectedLookup = {
  (hostname: string, options: LookupOneOptions, callback: LookupCallback): void;
  (hostname: string, options: LookupAllOptions, callback: LookupAllCallback): void;
};

function toBytes(value: string) {
  return textEncoder.encode(value);
}

async function expectFetchError<T>(promise: Promise<T>, code: ResourceFetchError["code"]) {
  await expect(promise).rejects.toMatchObject({
    name: "ResourceFetchError",
    code,
  });
}

describe("assertPublicResourceUrl", () => {
  it("rejects invalid URLs, non-http schemes, and embedded credentials", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS]);

    await expectFetchError(assertPublicResourceUrl("not a url", resolve), "INVALID_URL");
    await expectFetchError(assertPublicResourceUrl("ftp://example.com/resource", resolve), "INVALID_URL");
    await expectFetchError(assertPublicResourceUrl("https://user:pass@example.com/resource", resolve), "INVALID_URL");

    expect(resolve).not.toHaveBeenCalled();
  });

  it("rejects loopback, private, link-local, and mapped loopback destinations", async () => {
    await expectFetchError(assertPublicResourceUrl("http://127.0.0.1/resource"), "PRIVATE_DESTINATION");
    await expectFetchError(assertPublicResourceUrl("http://10.20.30.40/resource"), "PRIVATE_DESTINATION");
    await expectFetchError(assertPublicResourceUrl("http://169.254.10.20/resource"), "PRIVATE_DESTINATION");
    await expectFetchError(assertPublicResourceUrl("http://[::ffff:127.0.0.1]/resource"), "PRIVATE_DESTINATION");
  });

  it("rejects hostnames when any resolved address is not public", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS, "10.0.0.8"]);

    await expectFetchError(assertPublicResourceUrl("https://example.com/resource", resolve), "PRIVATE_DESTINATION");
    expect(resolve).toHaveBeenCalledWith("example.com");
  });
});

describe("fetchPublicResource", () => {
  it("revalidates redirect targets and rejects redirects to private destinations", async () => {
    const resolve = vi.fn(async (hostname: string) => {
      if (hostname === "example.com") {
        return [PUBLIC_ADDRESS];
      }

      if (hostname === "internal.example") {
        return ["10.0.0.15"];
      }

      throw new Error(`Unexpected hostname: ${hostname}`);
    });
    const request = vi.fn().mockResolvedValue({
      statusCode: 302,
      headers: { Location: "https://internal.example/private" },
      body: [],
    });

    await expectFetchError(fetchPublicResource("https://example.com/start", { resolve, request }), "PRIVATE_DESTINATION");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("stops after the redirect limit", async () => {
    const resolve = vi.fn(async (hostname: string) => {
      if (/^redirect\d+\.example\.com$/.test(hostname)) {
        return [PUBLIC_ADDRESS];
      }

      throw new Error(`Unexpected hostname: ${hostname}`);
    });
    const request = vi.fn(async ({ url }: { url: URL }) => ({
      statusCode: 302,
      headers: {
        location: url.hostname === "redirect1.example.com"
          ? "https://redirect2.example.com/two"
          : "https://redirect3.example.com/three",
      },
      body: [],
    }));

    await expectFetchError(fetchPublicResource("https://redirect1.example.com/one", { resolve, request, maxRedirects: 1 }), "REDIRECT_LIMIT");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("rejects non-2xx responses", async () => {
    const request = vi.fn().mockResolvedValue({
      statusCode: 404,
      headers: { "content-type": "text/plain" },
      body: [toBytes("Not found")],
    });

    await expectFetchError(fetchPublicResource("https://example.com/missing", {
      resolve: vi.fn().mockResolvedValue([PUBLIC_ADDRESS]),
      request,
    }), "FETCH_FAILED");
  });

  it("rejects redirects without a location header", async () => {
    const request = vi.fn().mockResolvedValue({
      statusCode: 301,
      headers: {},
      body: [],
    });

    await expectFetchError(fetchPublicResource("https://example.com/start", {
      resolve: vi.fn().mockResolvedValue([PUBLIC_ADDRESS]),
      request,
    }), "FETCH_FAILED");
  });

  it("rejects oversized responses from content-length before streaming", async () => {
    let readCount = 0;
    const request = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { "Content-Length": "9", "Content-Type": "text/plain" },
      body: {
        async *[Symbol.asyncIterator]() {
          readCount += 1;
          yield toBytes("ignored");
        },
      },
    });

    await expectFetchError(fetchPublicResource("https://example.com/large", {
      resolve: vi.fn().mockResolvedValue([PUBLIC_ADDRESS]),
      request,
      maxBytes: 8,
    }), "RESPONSE_TOO_LARGE");
    expect(readCount).toBe(0);
  });

  it("rejects oversized responses while streaming the body", async () => {
    const request = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: {
        async *[Symbol.asyncIterator]() {
          yield toBytes("1234");
          yield toBytes("5678");
        },
      },
    });

    await expectFetchError(fetchPublicResource("https://example.com/stream", {
      resolve: vi.fn().mockResolvedValue([PUBLIC_ADDRESS]),
      request,
      maxBytes: 7,
    }), "RESPONSE_TOO_LARGE");
  });

  it("closes the response when the streamed body exceeds the byte limit", async () => {
    const close = vi.fn();
    const request = vi.fn().mockResolvedValue({
      statusCode: 200,
      headers: { "content-type": "text/plain" },
      body: {
        async *[Symbol.asyncIterator]() {
          yield toBytes("1234");
          yield toBytes("5678");
        },
      },
      close,
    });

    await expectFetchError(fetchPublicResource("https://example.com/stream", {
      resolve: vi.fn().mockResolvedValue([PUBLIC_ADDRESS]),
      request,
      maxBytes: 7,
    }), "RESPONSE_TOO_LARGE");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("returns the final URL, content type, and body for successful responses", async () => {
    const resolve = vi.fn(async (hostname: string) => {
      if (hostname === "example.com" || hostname === "cdn.example.com") {
        return [PUBLIC_ADDRESS];
      }

      throw new Error(`Unexpected hostname: ${hostname}`);
    });
    const request = vi.fn(async ({ url }: { url: URL }) => {
      if (url.hostname === "example.com" && url.pathname === "/start") {
        return {
          statusCode: 302,
          headers: { Location: "/download" },
          body: [],
        };
      }

      return {
        statusCode: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
        body: [toBytes("Hello "), toBytes("world")],
      };
    });

    const result = await fetchPublicResource("https://example.com/start", {
      resolve,
      request,
    });

    expect(result.finalUrl).toBe("https://example.com/download");
    expect(result.contentType).toBe("text/html; charset=utf-8");
    expect(textDecoder.decode(result.body)).toBe("Hello world");
  });

  it("passes pinned validated addresses to the injected request lookup", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS]);
    const request = vi.fn(async ({ url, lookup }: { url: URL; lookup: InjectedLookup }) => {
      const resolved = await new Promise<{ address: string; family: number }>((resolveLookup, rejectLookup) => {
        lookup(url.hostname, { family: 0, all: false, hints: 0 }, (error, address, family) => {
          if (error) {
            rejectLookup(error);
            return;
          }

          resolveLookup({ address, family });
        });
      });

      expect(url.hostname).toBe("example.com");
      expect(resolved).toEqual({ address: PUBLIC_ADDRESS, family: 4 });

      return {
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: [toBytes("pdf")],
      };
    });

    const result = await fetchPublicResource("https://example.com/file.pdf", { resolve, request });

    expect(result.contentType).toBe("application/pdf");
    expect(textDecoder.decode(result.body)).toBe("pdf");
  });

  it("returns all pinned validated addresses for all=true lookups", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS, "2606:2800:220:1:248:1893:25c8:1946"]);
    const request = vi.fn(async ({ url, lookup }: { url: URL; lookup: InjectedLookup }) => {
      const resolved = await new Promise<LookupAddress[]>((resolveLookup, rejectLookup) => {
        lookup(url.hostname, { family: 0, all: true, hints: 0 }, (error, addresses) => {
          if (error) {
            rejectLookup(error);
            return;
          }

          resolveLookup(addresses);
        });
      });

      expect(resolved).toEqual([
        { address: PUBLIC_ADDRESS, family: 4 },
        { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
      ]);

      return {
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: [toBytes("pdf")],
      };
    });

    const result = await fetchPublicResource("https://example.com/file.pdf", { resolve, request });

    expect(result.contentType).toBe("application/pdf");
    expect(textDecoder.decode(result.body)).toBe("pdf");
  });

  it("returns ENOTFOUND with an empty address list when no pinned address matches an all=true family lookup", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS]);
    const request = vi.fn(async ({ url, lookup }: { url: URL; lookup: InjectedLookup }) => {
      const outcome = await new Promise<{ error: NodeJS.ErrnoException | null; addresses: LookupAddress[] }>((resolveLookup) => {
        lookup(url.hostname, { family: 6, all: true, hints: 0 }, (error, addresses) => {
          resolveLookup({ error, addresses });
        });
      });

      expect(outcome.error).toMatchObject({ code: "ENOTFOUND" });
      expect(outcome.addresses).toEqual([]);

      return {
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: [toBytes("pdf")],
      };
    });

    await fetchPublicResource("https://example.com/file.pdf", { resolve, request });
  });

  it("returns ENOTFOUND with empty single-address fields when no pinned address matches a single-address family lookup", async () => {
    const resolve = vi.fn().mockResolvedValue([PUBLIC_ADDRESS]);
    const request = vi.fn(async ({ url, lookup }: { url: URL; lookup: InjectedLookup }) => {
      const outcome = await new Promise<{ error: NodeJS.ErrnoException | null; address: string; family: 4 | 6 }>((resolveLookup) => {
        lookup(url.hostname, { family: 6, all: false, hints: 0 }, (error, address, family) => {
          resolveLookup({ error, address, family });
        });
      });

      expect(outcome.error).toMatchObject({ code: "ENOTFOUND" });
      expect(outcome.address).toBe("");
      expect(outcome.family).toBe(4);

      return {
        statusCode: 200,
        headers: { "content-type": "application/pdf" },
        body: [toBytes("pdf")],
      };
    });

    await fetchPublicResource("https://example.com/file.pdf", { resolve, request });
  });

  it("exports typed fetch errors", () => {
    const error = new ResourceFetchError("FETCH_FAILED", "Request failed");

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe("FETCH_FAILED");
    expect(error.name).toBe("ResourceFetchError");
  });
});
