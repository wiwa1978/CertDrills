DELETE FROM "user_discounts" a
USING "user_discounts" b
WHERE a."discount_id" = b."discount_id"
  AND a."user_id" = b."user_id"
  AND a."created_at" >= b."created_at"
  AND a."id" > b."id";
--> statement-breakpoint
DROP INDEX "user_discounts_discount_user_idx";--> statement-breakpoint
CREATE UNIQUE INDEX "user_discounts_discount_user_idx" ON "user_discounts" USING btree ("discount_id","user_id");
