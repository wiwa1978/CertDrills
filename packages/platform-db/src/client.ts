import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";

import * as schema from "./schema";

type PlatformDbOptions<TSchema extends Record<string, unknown> = PlatformSchema> = {
  connectionString: string;
  max?: number;
  schema?: TSchema;
};

type UnionToIntersection<T> = (T extends unknown ? (value: T) => void : never) extends
  ((value: infer TIntersection) => void) ? TIntersection : never;

export function composePlatformSchema<const TSchemas extends readonly Record<string, unknown>[]>(
  ...moduleSchemas: TSchemas
): PlatformSchema & UnionToIntersection<TSchemas[number]> {
  const composed: Record<string, unknown> = { ...schema };
  for (const moduleSchema of moduleSchemas) {
    for (const [name, value] of Object.entries(moduleSchema)) {
      if (name in composed) throw new Error(`Duplicate database schema export: ${name}`);
      composed[name] = value;
    }
  }
  return composed as PlatformSchema & UnionToIntersection<TSchemas[number]>;
}

export function createPlatformDb<TSchema extends Record<string, unknown> = PlatformSchema>(options: PlatformDbOptions<TSchema>) {
  const sql = postgres(options.connectionString, {
    max: options.max,
  });

  const db = drizzle(sql, { schema: (options.schema ?? schema) as TSchema });

  return {
    db,
    sql,
  };
}

export type PlatformSchema = typeof schema;
export type PlatformDb = PostgresJsDatabase<PlatformSchema> & { $client: Sql };
export type PlatformDbTransaction = Parameters<Parameters<PlatformDb["transaction"]>[0]>[0];
export type PlatformDbExecutor = PlatformDb | PlatformDbTransaction;
