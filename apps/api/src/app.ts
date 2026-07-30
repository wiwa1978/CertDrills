import { Hono } from "hono";
import { requestId } from "hono/request-id";

import type { AppEnv } from "./context";
import { bootstrap } from "./bootstrap";
import { env } from "./env";
import { corsMiddleware } from "./middleware/cors";
import { errorHandler } from "./middleware/error-handler";
import { originGuard } from "./middleware/origin-guard";
import { requestGuardrails } from "./middleware/request-guardrails";
import { requestLogger } from "./middleware/request-logger";
import { securityHeaders } from "./middleware/security-headers";
import { createAdminRouter } from "./routes/admin";
import { createAuthRouter } from "./routes/auth";
import { createDocsRouter } from "./routes/docs";
import { createLogsRouter } from "./routes/logs";
import { createJobsRouter } from "./routes/jobs";
import { createMeRouter } from "./routes/me";
import { createPaymentsRouter } from "./routes/payments";
import { createSystemRouter } from "./routes/system";
import { createCertDrillAdminRouter, createCertDrillUserRouter } from "./modules/certdrill/routes";

const app = new Hono<AppEnv>();

function clearSessionCookieHeader() {
  const parts = [
    "better-auth.session_token=",
    "Path=/",
    "HttpOnly",
    "Max-Age=0",
    `SameSite=${env.COOKIE_SAMESITE}`,
  ];

  if (env.COOKIE_DOMAIN) parts.push(`Domain=${env.COOKIE_DOMAIN}`);
  if (env.NODE_ENV === "production") parts.push("Secure");

  return parts.join("; ");
}

app.use("/*", requestId());
app.use("/*", corsMiddleware);
app.use("/*", originGuard);
app.use("/*", requestGuardrails);
app.use("/*", requestLogger);
app.use("/*", securityHeaders);
app.onError(errorHandler);

app.use("/auth/admin/*", bootstrap.authModule.requireAuth);
app.use("/auth/admin/*", bootstrap.authModule.requireAdminAccess);
app.use("/auth/admin/*", async (c, next) => {
  await next();

  if (c.res.status === 403) {
    c.res.headers.append("Set-Cookie", clearSessionCookieHeader());
  }
});

app.route("/auth", bootstrap.authModule.router);
app.route("/session", bootstrap.authModule.sessionRouter);
app.route("/auth/mobile", bootstrap.authModule.mobileRouter);
app.route("/", createSystemRouter());
app.route("/", createLogsRouter());
app.route("/", createJobsRouter());
app.route("/", createPaymentsRouter());
app.route("/me", createMeRouter());
if (env.FEATURE_CERTDRILL_ENABLED) {
  app.use("/api/certdrill/*", bootstrap.authModule.requireAuth);
  app.route("/api/certdrill", createCertDrillUserRouter({ service: bootstrap.certdrillService }));
}
app.use("/admin/*", bootstrap.authModule.requireAuth);
app.use("/admin/*", bootstrap.authModule.requireAdminAccess);
app.route("/admin", createAdminRouter());
if (env.FEATURE_CERTDRILL_ENABLED) {
  app.use("/api/admin/certdrill/*", bootstrap.authModule.requireAuth);
  app.use("/api/admin/certdrill/*", bootstrap.authModule.requireAdminAccess);
  app.route("/api/admin/certdrill", createCertDrillAdminRouter({ service: bootstrap.certdrillAdminService }));
}
app.route("/auth", createAuthRouter());
app.route("/", createDocsRouter());

export { app };
