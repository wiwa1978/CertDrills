import type { InngestFunction } from "inngest";
import { serve } from "inngest/hono";

import { inngest } from "../inngest/client";

export function createInngestHandler(functions: readonly InngestFunction.Any[]) {
  return serve({
    client: inngest,
    functions: [...functions],
    servePath: "/api/inngest",
  });
}
