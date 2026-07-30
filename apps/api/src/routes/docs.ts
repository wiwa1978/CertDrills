import { Hono } from "hono";
import type { Context } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { env } from "../env";
import { resolveAdminAuthApi } from "../lib/auth-admin";
import { createFallbackOpenApiSpec, mergeOpenApiSpecs } from "../openapi";

function buildScalarHtml(specUrl: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Docs</title>
  </head>
  <body>
    <script id="api-reference" data-url="${specUrl}"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`;
}

function buildSwaggerHtml(specUrl: string) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>API Swagger</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: ${JSON.stringify(specUrl)},
        dom_id: "#swagger-ui",
        deepLinking: true,
        layout: "BaseLayout"
      });
    </script>
  </body>
</html>`;
}

async function buildOpenApiSpec() {
  const adminAuthApi = resolveAdminAuthApi(bootstrap.authModule);
  if (!adminAuthApi) {
    return createFallbackOpenApiSpec();
  }

  const authSpec = await adminAuthApi.generateOpenAPISchema({});
  return mergeOpenApiSpecs(authSpec as Record<string, any>);
}

export function createDocsRouter() {
  const router = new Hono<AppEnv>();

  const openApiHandler = async (c: Context<AppEnv>) => {
    return c.json(await buildOpenApiSpec());
  };

  if (env.NODE_ENV === "production") {
    router.use("/openapi.json", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
    router.use("/api/openapi.json", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
    router.use("/docs", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
    router.use("/api/docs", bootstrap.authModule.requireAuth, bootstrap.authModule.requireAdminAccess);
  }

  router.get("/openapi.json", openApiHandler);
  router.get("/api/openapi.json", openApiHandler);

  router.get("/api/docs", (c) => c.html(buildSwaggerHtml("/api/openapi.json")));
  router.get("/docs", (c) => c.html(buildScalarHtml("/openapi.json")));

  return router;
}
