import { lookup as dnsLookup } from "node:dns/promises";
import type { LookupOneOptions } from "node:dns";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import ipaddr from "ipaddr.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 1_000_000;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);
const textEncoder = new TextEncoder();

export type ResourceFetchErrorCode =
  | "INVALID_URL"
  | "PRIVATE_DESTINATION"
  | "FETCH_FAILED"
  | "REDIRECT_LIMIT"
  | "RESPONSE_TOO_LARGE";

export class ResourceFetchError extends Error {
  constructor(public readonly code: ResourceFetchErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ResourceFetchError";
  }
}

export type ResourceFetchResolver = (hostname: string) => Promise<string[]>;

export type ResourceLookupCallback = (error: NodeJS.ErrnoException | null, address: string, family: 4 | 6) => void;

export type ResourceLookup = (
  hostname: string,
  options: LookupOneOptions,
  callback: ResourceLookupCallback,
) => void;

export type ResourceFetchRequestInput = {
  url: URL;
  signal: AbortSignal;
  lookup: ResourceLookup;
};

export type ResourceFetchResponse = {
  statusCode: number;
  headers?: Record<string, string | number | readonly string[] | undefined>;
  body?: AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>;
  close?: () => void;
};

export type FetchPublicResourceDeps = {
  resolve?: ResourceFetchResolver;
  request?: (input: ResourceFetchRequestInput) => Promise<ResourceFetchResponse>;
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

export type PublicResourceFetchResult = {
  finalUrl: string;
  contentType: string | null;
  body: Uint8Array;
};

type ValidatedResourceUrl = {
  url: URL;
  addresses: string[];
};

export async function assertPublicResourceUrl(value: string, resolve: ResourceFetchResolver = defaultResolveHostname) {
  const { url } = await validateResourceUrl(value, resolve);
  return url;
}

export async function fetchPublicResource(value: string, deps: FetchPublicResourceDeps = {}): Promise<PublicResourceFetchResult> {
  const resolve = deps.resolve ?? defaultResolveHostname;
  const request = deps.request ?? defaultRequest;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  let currentUrl = value;
  let redirectsFollowed = 0;

  while (true) {
    const { url, addresses } = await validateResourceUrl(currentUrl, resolve);
    const lookup = createPinnedLookup(url.hostname, addresses);
    let response: ResourceFetchResponse;

    try {
      response = await request({
        url,
        signal: AbortSignal.timeout(timeoutMs),
        lookup: lookup as never,
      });
    } catch (error) {
      throw asResourceFetchError(error, "FETCH_FAILED", `Failed to fetch resource: ${url.toString()}`);
    }

    const headers = normalizeHeaders(response.headers);

    if (REDIRECT_STATUS_CODES.has(response.statusCode)) {
      response.close?.();

      if (redirectsFollowed >= maxRedirects) {
        throw new ResourceFetchError("REDIRECT_LIMIT", `Resource redirect limit exceeded for ${url.toString()}.`);
      }

      const location = headers.location;
      if (!location) {
        throw new ResourceFetchError("FETCH_FAILED", `Redirect response from ${url.toString()} did not include a location header.`);
      }

      let redirectedUrl: URL;
      try {
        redirectedUrl = new URL(location, url);
      } catch (error) {
        throw new ResourceFetchError("FETCH_FAILED", `Redirect response from ${url.toString()} contained an invalid location header.`, { cause: error });
      }

      redirectsFollowed += 1;
      currentUrl = redirectedUrl.toString();
      continue;
    }

    if (response.statusCode < 200 || response.statusCode >= 300) {
      response.close?.();
      throw new ResourceFetchError("FETCH_FAILED", `Resource responded with HTTP ${response.statusCode} for ${url.toString()}.`);
    }

    const contentLength = parseContentLength(headers["content-length"]);
    if (contentLength !== null && contentLength > maxBytes) {
      response.close?.();
      throw new ResourceFetchError("RESPONSE_TOO_LARGE", `Resource exceeded the ${maxBytes} byte response limit.`);
    }

    let body: Uint8Array;
    try {
      body = await readResponseBody(response.body, maxBytes);
    } catch (error) {
      response.close?.();
      throw error;
    }

    return {
      finalUrl: url.toString(),
      contentType: headers["content-type"] ?? null,
      body,
    };
  }
}

async function validateResourceUrl(value: string, resolve: ResourceFetchResolver): Promise<ValidatedResourceUrl> {
  let url: URL;

  try {
    url = new URL(value);
  } catch (error) {
    throw new ResourceFetchError("INVALID_URL", "Resource URL must be a valid absolute HTTP(S) URL.", { cause: error });
  }

  if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || !url.hostname) {
    throw new ResourceFetchError("INVALID_URL", "Resource URL must use HTTP(S) without embedded credentials.");
  }

  const hostname = stripIpv6Brackets(url.hostname);
  const addresses = await resolvePublicAddresses(hostname, resolve);

  return {
    url,
    addresses,
  };
}

async function resolvePublicAddresses(hostname: string, resolve: ResourceFetchResolver) {
  if (ipaddr.isValid(hostname)) {
    assertPublicAddress(hostname);
    return [hostname];
  }

  let addresses: string[];
  try {
    addresses = await resolve(hostname);
  } catch (error) {
    throw asResourceFetchError(error, "FETCH_FAILED", `Failed to resolve resource hostname: ${hostname}`);
  }

  if (addresses.length === 0) {
    throw new ResourceFetchError("PRIVATE_DESTINATION", `Resource hostname ${hostname} did not resolve to any public addresses.`);
  }

  addresses.forEach(assertPublicAddress);

  return addresses;
}

function assertPublicAddress(address: string) {
  const normalizedAddress = stripIpv6Brackets(address.trim());

  try {
    if (ipaddr.process(normalizedAddress).range() !== "unicast") {
      throw new ResourceFetchError("PRIVATE_DESTINATION", `Resource address ${address} is not a public unicast destination.`);
    }
  } catch (error) {
    if (error instanceof ResourceFetchError) {
      throw error;
    }

    throw new ResourceFetchError("PRIVATE_DESTINATION", `Resource address ${address} is not a valid public IP address.`, { cause: error });
  }
}

function createPinnedLookup(hostname: string, addresses: string[]): ResourceLookup {
  const normalizedHostname = stripIpv6Brackets(hostname);

  return (requestedHostname, options, callback) => {
    if (requestedHostname !== hostname && stripIpv6Brackets(requestedHostname) !== normalizedHostname) {
      callback(Object.assign(new Error(`Unexpected lookup hostname: ${requestedHostname}`), { code: "EINVAL" }), "", 4);
      return;
    }

    const family = options.family === 4 || options.family === 6 ? options.family : 0;
    const selectedAddress = addresses.find((address) => family === 0 || getAddressFamily(address) === family) ?? addresses[0];

    if (!selectedAddress) {
      callback(Object.assign(new Error(`No validated addresses available for ${hostname}`), { code: "ENOTFOUND" }), "", 4);
      return;
    }

    callback(null, selectedAddress, getAddressFamily(selectedAddress));
  };
}

function getAddressFamily(address: string): 4 | 6 {
  return ipaddr.process(stripIpv6Brackets(address)).kind() === "ipv6" ? 6 : 4;
}

async function defaultResolveHostname(hostname: string) {
  try {
    const addresses = await dnsLookup(hostname, { all: true, verbatim: true });
    return addresses.map((entry) => entry.address);
  } catch (error) {
    const code = getErrorCode(error);
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return [];
    }

    throw error;
  }
}

async function defaultRequest({ url, signal, lookup }: ResourceFetchRequestInput): Promise<ResourceFetchResponse> {
  const request = url.protocol === "https:" ? httpsRequest : httpRequest;
  const hostname = stripIpv6Brackets(url.hostname);
  const servername = ipaddr.isValid(hostname) ? undefined : hostname;

  return await new Promise<ResourceFetchResponse>((resolve, reject) => {
    const clientRequest = request(url, {
      method: "GET",
      signal,
      lookup: lookup as never,
      servername,
    }, (response) => {
      resolve({
        statusCode: response.statusCode ?? 0,
        headers: response.headers as Record<string, string | number | readonly string[] | undefined>,
        body: response,
        close: () => response.destroy(),
      });
    });

    clientRequest.once("error", reject);
    clientRequest.end();
  });
}

function normalizeHeaders(headers: ResourceFetchResponse["headers"]) {
  const normalized: Record<string, string> = {};

  if (!headers) {
    return normalized;
  }

  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) {
      continue;
    }

    normalized[key.toLowerCase()] = Array.isArray(value)
      ? value.join(", ")
      : String(value);
  }

  return normalized;
}

function parseContentLength(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

async function readResponseBody(body: ResourceFetchResponse["body"], maxBytes: number) {
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  for await (const chunk of body ?? []) {
    const bytes = typeof chunk === "string" ? textEncoder.encode(chunk) : chunk;
    totalBytes += bytes.byteLength;

    if (totalBytes > maxBytes) {
      throw new ResourceFetchError("RESPONSE_TOO_LARGE", `Resource exceeded the ${maxBytes} byte response limit.`);
    }

    chunks.push(bytes);
  }

  const merged = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return merged;
}

function stripIpv6Brackets(value: string) {
  return value.startsWith("[") && value.endsWith("]") ? value.slice(1, -1) : value;
}

function asResourceFetchError(error: unknown, code: ResourceFetchErrorCode, message: string) {
  if (error instanceof ResourceFetchError) {
    return error;
  }

  return new ResourceFetchError(code, message, { cause: error });
}

function getErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error ? String(error.code) : null;
}
