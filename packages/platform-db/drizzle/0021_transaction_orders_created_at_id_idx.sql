CREATE INDEX IF NOT EXISTS "transaction_orders_created_at_id_idx" ON "transaction_orders" USING btree ("created_at" DESC, "id" DESC);
