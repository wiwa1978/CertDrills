import { Hono } from "hono";

import type { AppEnv } from "../context";
import { bootstrap } from "../bootstrap";
import { env } from "../env";
import { forbidden, ok } from "../lib/http";

export function createJobsRouter() {
  const router = new Hono<AppEnv>();

  router.post("/jobs/run", async (c) => {
    const authorization = c.req.header("authorization") ?? "";
    const expected = env.JOBS_SECRET_KEY ? `Bearer ${env.JOBS_SECRET_KEY}` : null;
    if (!expected || authorization !== expected) {
      return forbidden(c, "Invalid jobs secret");
    }

    const result = await bootstrap.jobsRunner.runDue();
    return ok(c, result);
  });

  return router;
}
