CREATE TABLE IF NOT EXISTS "transaction_baskets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "currency" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_basket_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "basket_id" uuid NOT NULL,
  "product_key" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" integer NOT NULL,
  "currency" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transaction_basket_items_quantity_positive" CHECK ("transaction_basket_items"."quantity" > 0),
  CONSTRAINT "transaction_basket_items_unit_price_nonnegative" CHECK ("transaction_basket_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_orders" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "basket_id" uuid,
  "status" text DEFAULT 'pending_payment' NOT NULL,
  "currency" text NOT NULL,
  "subtotal_amount" integer NOT NULL,
  "tax_amount" integer DEFAULT 0 NOT NULL,
  "total_amount" integer NOT NULL,
  "payment_provider" text DEFAULT 'dodo' NOT NULL,
  "payment_id" text,
  "provider_customer_id" text,
  "checkout_reference_id" text,
  "paid_at" timestamp with time zone,
  "failed_at" timestamp with time zone,
  "fulfilled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transaction_orders_subtotal_nonnegative" CHECK ("transaction_orders"."subtotal_amount" >= 0),
  CONSTRAINT "transaction_orders_tax_nonnegative" CHECK ("transaction_orders"."tax_amount" >= 0),
  CONSTRAINT "transaction_orders_total_nonnegative" CHECK ("transaction_orders"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_order_items" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "order_id" uuid NOT NULL,
  "product_key" text NOT NULL,
  "quantity" integer NOT NULL,
  "unit_price" integer NOT NULL,
  "total_amount" integer NOT NULL,
  "currency" text NOT NULL,
  "provider_product_id" text NOT NULL,
  "fulfillment_type" text DEFAULT 'entitlement' NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transaction_order_items_quantity_positive" CHECK ("transaction_order_items"."quantity" > 0),
  CONSTRAINT "transaction_order_items_unit_price_nonnegative" CHECK ("transaction_order_items"."unit_price" >= 0),
  CONSTRAINT "transaction_order_items_total_nonnegative" CHECK ("transaction_order_items"."total_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "transaction_entitlements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "order_id" uuid NOT NULL,
  "order_item_id" uuid NOT NULL,
  "unit_index" integer NOT NULL,
  "product_key" text NOT NULL,
  "status" text DEFAULT 'available' NOT NULL,
  "source_payment_id" text,
  "consumed_at" timestamp with time zone,
  "refunded_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "transaction_entitlements_unit_index_nonnegative" CHECK ("transaction_entitlements"."unit_index" >= 0)
);
--> statement-breakpoint
ALTER TABLE "transaction_baskets" ADD CONSTRAINT "transaction_baskets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_basket_items" ADD CONSTRAINT "transaction_basket_items_basket_id_transaction_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."transaction_baskets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_orders" ADD CONSTRAINT "transaction_orders_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_orders" ADD CONSTRAINT "transaction_orders_basket_id_transaction_baskets_id_fk" FOREIGN KEY ("basket_id") REFERENCES "public"."transaction_baskets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_order_items" ADD CONSTRAINT "transaction_order_items_order_id_transaction_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."transaction_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_entitlements" ADD CONSTRAINT "transaction_entitlements_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_entitlements" ADD CONSTRAINT "transaction_entitlements_order_id_transaction_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."transaction_orders"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "transaction_entitlements" ADD CONSTRAINT "transaction_entitlements_order_item_id_transaction_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."transaction_order_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_baskets_user_draft_idx" ON "transaction_baskets" USING btree ("user_id") WHERE "status" = 'draft';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_baskets_user_id_idx" ON "transaction_baskets" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_baskets_status_idx" ON "transaction_baskets" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_basket_items_basket_product_idx" ON "transaction_basket_items" USING btree ("basket_id", "product_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_basket_items_basket_id_idx" ON "transaction_basket_items" USING btree ("basket_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_orders_user_id_idx" ON "transaction_orders" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_orders_status_idx" ON "transaction_orders" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_orders_payment_id_idx" ON "transaction_orders" USING btree ("payment_id");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_orders_checkout_reference_idx" ON "transaction_orders" USING btree ("checkout_reference_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_order_items_order_id_idx" ON "transaction_order_items" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_order_items_product_key_idx" ON "transaction_order_items" USING btree ("product_key");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transaction_entitlements_order_item_unit_idx" ON "transaction_entitlements" USING btree ("order_item_id", "unit_index");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_entitlements_user_id_idx" ON "transaction_entitlements" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_entitlements_order_id_idx" ON "transaction_entitlements" USING btree ("order_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_entitlements_status_idx" ON "transaction_entitlements" USING btree ("status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "transaction_entitlements_product_key_idx" ON "transaction_entitlements" USING btree ("product_key");
