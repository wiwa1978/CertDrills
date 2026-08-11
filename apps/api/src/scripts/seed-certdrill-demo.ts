import "dotenv/config";

import { createPlatformDb } from "@platform/platform-db";

import { env } from "../env";
import { seedCertDrillDemoData } from "../product/certdrill/seed-demo";

const { db, sql } = createPlatformDb({ connectionString: env.DATABASE_URL });

try {
  const result = await seedCertDrillDemoData(db);
  console.log(JSON.stringify({ success: true, result }, null, 2));
} finally {
  await sql.end();
}
