import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createDiscountsService } from "../../../src/modules/discounts/service";
import { createDodoPaymentProvider } from "../../../src/modules/payments/providers/dodo";

function dodoProvider(apiKey?: string) {
  return createDodoPaymentProvider({
    apiKey,
    environment: "test_mode",
    appUrl: "http://localhost:3100",
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("createDiscountsService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  // Verifies discount creation enforces chronological date windows.
  it("rejects create discount when endDate is before startDate", async () => {
    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn() } } } as any,
      paymentProvider: dodoProvider(),
    });

    const result = await service.createDiscount({
      code: "SAVE10",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-02-01"),
      endDate: new Date("2026-01-01"),
    });

    expect(result).toEqual({ success: false, error: "End date must be after start date" });
  });

  // Verifies fixed discounts are rejected because the provider only supports percentages.
  it("rejects fixed discounts", async () => {
    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn() } } } as any,
      paymentProvider: dodoProvider(),
    });

    const result = await service.createDiscount({
      code: "SAVE-ABC-1234",
      type: "fixed",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
    });

    expect(result).toEqual({ success: false, error: "Only percentage discounts are supported" });
  });

  // Verifies discount creation performs remote sync and stores an inferred active status.
  it("creates discount and infers active status", async () => {
    const now = Date.now();
    const insert = vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: "d1", status: "active" }]),
      }),
    }));
    const tx = { insert };
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (callback) => callback(tx)),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider("key"),
    });

    const result = await service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date(now - 10_000),
      endDate: new Date(now + 10_000),
      maxUses: 100,
      userIds: ["u1", "u2"],
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as any).mock.calls[1][0]).toContain("https://test.dodopayments.com/discounts");
    expect((fetch as any).mock.calls[1][1].body).toContain("SAVE-ABC-1234");
    expect((fetch as any).mock.calls[1][1].signal).toBeInstanceOf(AbortSignal);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  // Verifies a remote discount is deleted when local persistence fails after provider creation.
  it("cleans up provider discount when local creation fails", async () => {
    const localError = new Error("local insert failed");
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn().mockRejectedValue(localError),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });
    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204, text: vi.fn().mockResolvedValue("") });

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider("key"),
    });

    await expect(service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
    })).rejects.toThrow("local insert failed");

    expect(fetch).toHaveBeenCalledTimes(3);
    expect((fetch as any).mock.calls[2][0]).toContain("/discounts/dodo_1");
    expect((fetch as any).mock.calls[2][1]).toEqual(expect.objectContaining({ method: "DELETE" }));
  });

  // Verifies cleanup errors do not hide the original local persistence failure.
  it("preserves local creation failure when dodo cleanup fails", async () => {
    const localError = new Error("assignment insert failed");
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn().mockRejectedValue(localError),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dodo_1",
        code: "SAVE-ABC-1234",
        amount: 1000,
        type: "percentage",
      }),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("provider details"),
    });

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider("key"),
    });

    await expect(service.createDiscount({
      code: "save-abc-1234",
      type: "percentage",
      value: 10,
      startDate: new Date("2026-01-01"),
      endDate: new Date("2026-02-01"),
    })).rejects.toThrow("assignment insert failed");

    expect(fetch).toHaveBeenCalledTimes(3);
  });

  // Verifies remote validation failures do not fail open anymore.
  it("fails closed when provider validation errors", async () => {
    (fetch as any).mockRejectedValueOnce(new Error("network failure"));

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      paymentProvider: dodoProvider("key"),
    });

    await expect(service.validateDiscountCode("SAVE-ABC-1234")).rejects.toThrow("Payment provider request failed");
  });

  // Verifies provider response bodies are never leaked through errors.
  it("sanitizes discount provider response failures", async () => {
    (fetch as any).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue("provider secret details"),
    });

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      paymentProvider: dodoProvider("key"),
    });

    let error: unknown;
    try {
      await service.validateDiscountCode("SAVE-ABC-1234");
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe("Payment provider request failed");
    expect((error as Error).message).not.toContain("provider secret details");
  });

  // Verifies provider timeouts have a stable sanitized error.
  it("sanitizes discount provider timeouts", async () => {
    (fetch as any).mockRejectedValueOnce(new DOMException("The operation timed out", "TimeoutError"));

    const service = createDiscountsService({
      db: { query: { discounts: { findFirst: vi.fn().mockResolvedValue(null) } } } as any,
      paymentProvider: dodoProvider("key"),
    });

    await expect(service.validateDiscountCode("SAVE-ABC-1234")).rejects.toThrow("Payment provider discounts request timed out");
  });

  // Verifies remote provider deletion occurs before local discount deletion.
  it("deletes provider discount before local deletion", async () => {
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const dbDelete = vi.fn().mockReturnValue({ where: deleteWhere });

    const service = createDiscountsService({
      db: {
        query: {
          discounts: {
            findFirst: vi.fn().mockResolvedValue({ id: "d1", dodoDiscountId: "dd_1" }),
          },
        },
        delete: dbDelete,
      } as any,
      paymentProvider: dodoProvider("key"),
    });

    (fetch as any).mockResolvedValueOnce({ ok: true, status: 204, json: vi.fn().mockResolvedValue(undefined), text: vi.fn().mockResolvedValue("") });

    const result = await service.deleteDiscount("d1");

    expect(result).toEqual({ success: true, previousDiscount: { id: "d1", dodoDiscountId: "dd_1", providerDiscountId: "dd_1" } });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/discounts/dd_1"),
      expect.objectContaining({ method: "DELETE" }),
    );
    expect(dbDelete).toHaveBeenCalled();
  });

  // Verifies discount edits ignore unsupported selected-user assignment fields.
  it("does not update user assignments when updating a discount", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "d1", code: "SAVE-ABC-1234" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({
            id: "d1",
            code: "SAVE-ABC-1234",
            type: "percentage",
            value: "10",
            startDate: new Date("2026-01-01"),
            endDate: new Date("2026-02-01"),
            maxUses: null,
            dodoDiscountId: "dd_1",
            status: "active",
          }),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSet }),
      transaction: vi.fn(),
      delete: vi.fn(),
      insert: vi.fn(),
    };

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider(),
    });

    const result = await service.updateDiscount({
      id: "d1",
      userIds: ["u1", " u1 ", "u2"],
    } as any);

    expect(result.success).toBe(true);
    expect(db.transaction).not.toHaveBeenCalled();
    expect(db.delete).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  // Verifies changed discount codes are normalized locally and synced to the provider.
  it("syncs discount code updates to the provider", async () => {
    const updateReturning = vi.fn().mockResolvedValue([{ id: "d1", code: "SAVE-NEW-1234" }]);
    const updateWhere = vi.fn().mockReturnValue({ returning: updateReturning });
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const db = {
      query: {
        discounts: {
          findFirst: vi
            .fn()
            .mockResolvedValueOnce({
              id: "d1",
              code: "SAVE-OLD-1234",
              startDate: new Date("2026-01-01"),
              endDate: new Date("2026-02-01"),
              dodoDiscountId: "dd_1",
            })
            .mockResolvedValueOnce(null),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };

    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([]),
    });
    (fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        discount_id: "dd_1",
        code: "SAVE-NEW-1234",
        amount: 1000,
        type: "percentage",
      }),
    });

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider("key"),
    });

    const result = await service.updateDiscount({
      id: "d1",
      code: "save-new-1234",
    });

    expect(result.success).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect((fetch as any).mock.calls[1][0]).toContain("/discounts/dd_1");
    expect((fetch as any).mock.calls[1][1]).toEqual(expect.objectContaining({ method: "PATCH" }));
    expect(JSON.parse((fetch as any).mock.calls[1][1].body)).toEqual({ code: "SAVE-NEW-1234" });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ code: "SAVE-NEW-1234" }));
  });

  // Verifies detail responses return the recomputed status instead of a stale stored status.
  it("refreshes stale discount status in detail responses", async () => {
    const now = Date.now();
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const db = {
      query: {
        discounts: {
          findFirst: vi.fn().mockResolvedValue({
            id: "d1",
            code: "SAVE-ABC-1234",
            status: "active",
            startDate: new Date(now - 20_000),
            endDate: new Date(now - 10_000),
            userDiscounts: [],
          }),
        },
      },
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider(),
    });

    const result = await service.getDiscountById("d1");

    expect(result).toEqual({
      success: true,
      discount: expect.objectContaining({ id: "d1", status: "expired" }),
    });
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "expired" }));
  });

  // Verifies list responses refresh statuses and filter by the date-derived status, not stale stored status.
  it("refreshes stale discount statuses in list responses", async () => {
    const now = Date.now();
    const updateWhere = vi.fn().mockResolvedValue(undefined);
    const updateSet = vi.fn().mockReturnValue({ where: updateWhere });
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "d1",
        code: "SAVE-ABC-1234",
        status: "inactive",
        startDate: new Date(now - 10_000),
        endDate: new Date(now + 10_000),
        userDiscounts: [],
      },
    ]);
    const selectWhere = vi.fn().mockResolvedValue([{ count: 1 }]);
    const db = {
      query: {
        discounts: { findMany },
      },
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({ where: selectWhere }),
      }),
      update: vi.fn().mockReturnValue({ set: updateSet }),
    };

    const service = createDiscountsService({
      db: db as any,
      paymentProvider: dodoProvider(),
    });

    const result = await service.getDiscounts(20, 0, undefined, "active");

    expect(result.discounts).toEqual([expect.objectContaining({ id: "d1", status: "active" })]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.anything() }));
    expect(selectWhere).toHaveBeenCalledWith(expect.anything());
    expect(updateSet).toHaveBeenCalledWith(expect.objectContaining({ status: "active" }));
  });

  // Verifies code generation retries when a generated code already exists.
  it("generates unique codes and retries on collision", async () => {
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: "exists" })
      .mockResolvedValueOnce(null);

    const service = createDiscountsService({
      db: {
        query: {
          discounts: { findFirst },
        },
      } as any,
      paymentProvider: dodoProvider(),
    });

    const code = await service.generateDiscountCode("TEST");

    expect(code.startsWith("TEST-")).toBe(true);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});
