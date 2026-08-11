import { describe, expect, it } from "vitest";

import { getTableConfig } from "drizzle-orm/pg-core";
import { transactionOrders } from "@platform/platform-db";

describe("transaction dashboard database index", () => {
  it("supports the unfiltered created-at and id descending range order", () => {
    const index = getTableConfig(transactionOrders).indexes.find((entry) => entry.config.name === "transaction_orders_created_at_id_idx");

    expect(index?.config.columns).toHaveLength(2);
    expect(index?.config.columns.map((column: any) => column.indexConfig?.order)).toEqual(["desc", "desc"]);
  });
});
