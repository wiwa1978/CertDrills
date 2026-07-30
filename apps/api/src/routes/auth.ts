import { Hono } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { createJsonResponseFromAuthResponse, resolveAdminAuthApi } from "../lib/auth-admin";
import { serverError } from "../lib/http";
import { getAuditRequestContext } from "../modules/audit/service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSuccessfulMutationResult(result: unknown) {
  return !isRecord(result) || result.success !== false;
}

export function createAuthRouter() {
  const router = new Hono<AppEnv>();

  router.post("/admin/stop-impersonating", async (c) => {
    const adminAuthApi = resolveAdminAuthApi(bootstrap.authModule);
    if (!adminAuthApi) {
      return serverError(c, "Better Auth admin API is unavailable");
    }

    const response = (await adminAuthApi.stopImpersonating({
      headers: c.req.raw.headers,
      asResponse: true,
    })) as Response;

    const jsonResponse = await createJsonResponseFromAuthResponse(response, "Failed to stop impersonation");
    const payload = await jsonResponse.clone().json().catch(() => null);
    if (jsonResponse.ok && isSuccessfulMutationResult(payload)) {
      await bootstrap.auditService.recordAuditEntry({
        ...getAuditRequestContext(c),
        action: "admin.impersonation.stop",
        outcome: "success",
        targetType: "session",
        metadata: { stopped: true },
      }).catch(() => undefined);
    }

    return jsonResponse;
  });

  return router;
}
