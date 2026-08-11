import { env } from "@/env";
import type { paths } from "./openapi-types";

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL).replace(/\/$/, "");

export async function apiGet<TPath extends keyof paths>(
  path: TPath,
  options?: { headers?: HeadersInit },
): Promise<paths[TPath]["get"]["responses"][200]["content"]["application/json"]> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "GET",
    headers: options?.headers,
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`API request failed for ${String(path)} with status ${response.status}`);
  }

  return response.json();
}
