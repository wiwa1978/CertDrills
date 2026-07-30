import "dotenv/config";

import { serve } from "@hono/node-server";

import { app } from "./app";
import { env } from "./env";
import { logger } from "./observability/logger";

const server = serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    logger.info({ port: info.port }, `API server listening on http://localhost:${info.port}`);
  },
);

function shutdown(signal: string) {
  logger.info({ signal }, "api.server.shutdown");
  server.close(() => {
    logger.info("api.server.closed");
    process.exit(0);
  });

  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
