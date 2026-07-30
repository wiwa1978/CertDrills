"use client";

import { createClientLogger, normalizeBaseUrl } from "@platform/frontend-shared";

import { env } from "@/env";

const endpoint = `${normalizeBaseUrl(env.NEXT_PUBLIC_API_URL || env.NEXT_PUBLIC_APP_URL)}/logs/client`;

const { installConsoleLogBridge, logger: clientLogger } = createClientLogger({ endpoint });

export { clientLogger, installConsoleLogBridge };
