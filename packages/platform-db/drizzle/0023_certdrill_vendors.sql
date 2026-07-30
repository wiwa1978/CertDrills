CREATE TABLE IF NOT EXISTS "certdrill_vendors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "logo_url" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "certdrill_certifications" ADD COLUMN IF NOT EXISTS "vendor_id" uuid REFERENCES "certdrill_vendors"("id") ON DELETE set null;

CREATE INDEX IF NOT EXISTS "certdrill_vendors_is_active_idx" ON "certdrill_vendors" ("is_active");
CREATE INDEX IF NOT EXISTS "certdrill_vendors_sort_order_idx" ON "certdrill_vendors" ("sort_order");
CREATE INDEX IF NOT EXISTS "certdrill_certifications_vendor_id_idx" ON "certdrill_certifications" ("vendor_id");

INSERT INTO "certdrill_vendors" ("slug", "name", "sort_order") VALUES
  ('microsoft', 'Microsoft', 10),
  ('aws', 'AWS', 20),
  ('anthropic', 'Anthropic', 30),
  ('cisco', 'Cisco', 40)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "updated_at" = now();

UPDATE "certdrill_certifications" c
SET "vendor_id" = v."id"
FROM "certdrill_vendors" v
WHERE c."vendor_id" IS NULL
  AND lower(c."vendor") = lower(v."name");
