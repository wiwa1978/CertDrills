import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

type PlatformDbOptions = {
  connectionString: string;
  max?: number;
};

export function createPlatformDb(options: PlatformDbOptions) {
  const sql = postgres(options.connectionString, {
    max: options.max,
  });

  const db = drizzle(sql, { schema });

  return {
    db,
    sql,
  };
}

export type PlatformSchema = typeof schema;
