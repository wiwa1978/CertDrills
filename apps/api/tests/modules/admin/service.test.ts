import { afterEach, describe, expect, it, vi } from "vitest";

import { createAdminService } from "../../../src/modules/admin/service";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createAdminService", () => {
  // Verifies whitespace-only admin secret input is rejected before comparison.
  it("rejects empty secret input", async () => {
    const service = createAdminService({
      db: {},
      adminSecret: "secret",
    });

    const result = await service.verifyAdminSecret("   ");

    expect(result).toEqual({ success: false, error: "Secret key is required." });
  });

  // Verifies incorrect admin secret values are rejected with a deterministic error.
  it("rejects invalid secret input", async () => {
    const service = createAdminService({
      db: {},
      adminSecret: "secret",
    });

    const result = await service.verifyAdminSecret("wrong1");

    expect(result.success).toBe(false);
    expect(result.error).toBe("Invalid secret key provided.");
  });

  // Verifies exact secret matches are accepted.
  it("accepts valid secret input", async () => {
    const service = createAdminService({
      db: {},
      adminSecret: "secret",
    });

    const result = await service.verifyAdminSecret("secret");

    expect(result).toEqual({ success: true, error: undefined });
  });

  // Verifies missing server configuration fails closed for secret validation.
  it("returns configuration error when admin secret is missing", async () => {
    const service = createAdminService({
      db: {},
    });

    const result = await service.verifyAdminSecret("anything");

    expect(result).toEqual({
      success: false,
      error: "Admin secret is not configured.",
    });
  });

  // Verifies user stats expose global totals for admin summary cards.
  it("returns global user stats", async () => {
    const counts = [10, 2, 1];
    const select = vi.fn(() => ({
      from: vi.fn(() => {
        const count = counts.shift() ?? 0;
        return {
          then: (resolve: (value: Array<{ count: number }>) => void) => resolve([{ count }]),
          where: vi.fn().mockResolvedValue([{ count }]),
        };
      }),
    }));

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    const result = await service.getUserStats();

    expect(result).toEqual({ totalUsers: 10, totalAdmins: 2, totalBanned: 1 });
  });

  // Verifies unknown users return null rather than throwing.
  it("returns null for unknown user in getUserById", async () => {
    const service = createAdminService({
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
      adminSecret: "secret",
    } as any);

    const result = await service.getUserById("missing-user");
    expect(result).toBeNull();
  });

  // Verifies cents-based revenue is converted to euros in response payloads.
  it("maps billing stats and converts cents to EUR", async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ count: 7, total: 12345, purchased: 900, bonus: 100 }]),
        }),
      }),
    };

    const service = createAdminService({
      db,
      adminSecret: "secret",
    });

    const stats = await service.getBillingStats();
    expect(stats.totalPurchases).toBe(7);
    expect(stats.totalRevenue).toBe(123.45);
  });

  // Verifies paginated transaction responses include hasMore based on total count.
  it("builds pagination response for transactions", async () => {
    const transactionRows = [{ id: "t1" }, { id: "t2" }];

    const select = vi
      .fn()
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  offset: vi.fn().mockResolvedValue(transactionRows),
                }),
              }),
            }),
          }),
        }),
      })
      .mockReturnValueOnce({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([{ count: 10 }]),
          }),
        }),
      });

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    const result = await service.getAllTransactions(2, 0);
    expect(result.transactions).toEqual(transactionRows);
    expect(result.total).toBe(10);
    expect(result.hasMore).toBe(true);
  });

  // Verifies transaction pagination inputs are normalized before reaching the query builder.
  it("normalizes transaction pagination inputs", async () => {
    const limit = vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) });
    const orderBy = vi.fn().mockReturnValue({ limit });
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });

    const totalWhere = vi.fn().mockResolvedValue([{ count: 0 }]);
    const totalInnerJoin = vi.fn().mockReturnValue({ where: totalWhere });
    const totalFrom = vi.fn().mockReturnValue({ innerJoin: totalInnerJoin });

    const select = vi.fn()
      .mockReturnValueOnce({ from })
      .mockReturnValueOnce({ from: totalFrom });

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    await service.getAllTransactions(999, -50, "  john@example.com  ");

    expect(limit).toHaveBeenCalledWith(100);
    expect(where).toHaveBeenCalled();
  });

  // Verifies the broad user list is capped to avoid unbounded responses.
  it("caps admin user listing", async () => {
    const listLimit = vi.fn().mockReturnValue({ offset: vi.fn().mockResolvedValue([]) });
    const listOrderBy = vi.fn().mockReturnValue({ limit: listLimit });
    const listFrom = vi.fn().mockReturnValue({ orderBy: listOrderBy });

    const countFrom = vi.fn().mockResolvedValue([{ count: 0 }]);

    const select = vi.fn()
      .mockReturnValueOnce({ from: listFrom })
      .mockReturnValueOnce({ from: countFrom });

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    await service.getUsers();

    expect(listLimit).toHaveBeenCalledWith(20);
  });

  // Verifies admin user search is applied consistently to list and count queries.
  it("filters admin user listing by trimmed name or email search", async () => {
    const listRows = [{ id: "u1", name: "Alice", email: "alice@example.com" }];
    const listOffset = vi.fn().mockResolvedValue(listRows);
    const listLimit = vi.fn().mockReturnValue({ offset: listOffset });
    const listOrderBy = vi.fn().mockReturnValue({ limit: listLimit });
    const listWhere = vi.fn().mockReturnValue({ orderBy: listOrderBy });
    const listFrom = vi.fn().mockReturnValue({ where: listWhere, orderBy: listOrderBy });

    const countRows = [{ count: 1 }];
    const countWhere = vi.fn().mockResolvedValue(countRows);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });

    const select = vi.fn()
      .mockReturnValueOnce({ from: listFrom })
      .mockReturnValueOnce({ from: countFrom });

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    const result = await service.getUsers(20, 0, "  alice  ");

    expect(listWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledWith(listWhere.mock.calls[0]?.[0]);
    expect(result).toEqual({ users: listRows, total: 1 });
  });

  // Verifies privileged account listings can reuse the users API with role filtering.
  it("filters admin user listing by role", async () => {
    const listRows = [{ id: "admin-1", name: "Alice", email: "alice@example.com", role: "admin" }];
    const listOffset = vi.fn().mockResolvedValue(listRows);
    const listLimit = vi.fn().mockReturnValue({ offset: listOffset });
    const listOrderBy = vi.fn().mockReturnValue({ limit: listLimit });
    const listWhere = vi.fn().mockReturnValue({ orderBy: listOrderBy });
    const listFrom = vi.fn().mockReturnValue({ where: listWhere, orderBy: listOrderBy });

    const countRows = [{ count: 1 }];
    const countWhere = vi.fn().mockResolvedValue(countRows);
    const countFrom = vi.fn().mockReturnValue({ where: countWhere });

    const select = vi.fn()
      .mockReturnValueOnce({ from: listFrom })
      .mockReturnValueOnce({ from: countFrom });

    const service = createAdminService({
      db: { select } as any,
      adminSecret: "secret",
    });

    const result = await service.getUsers(20, 0, undefined, "admin");

    expect(listWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledOnce();
    expect(countWhere).toHaveBeenCalledWith(listWhere.mock.calls[0]?.[0]);
    expect(result).toEqual({ users: listRows, total: 1 });
  });
});
