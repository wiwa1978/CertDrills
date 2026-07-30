import { describe, expect, it, vi } from "vitest";

import { creditTransactions, userCredits, voucherRedemptions, vouchers } from "@platform/platform-db";

import { createVouchersService } from "../../../src/modules/vouchers/service";

describe("createVouchersService", () => {
  // Verifies all-user vouchers do not silently default to a single redemption.
  it("defaults all-user vouchers to the contract maximum redemptions", async () => {
    const createdVoucher = { id: "11111111-1111-4111-8111-111111111111", maxRedemptions: 100000 };
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([createdVoucher]),
    });
    const insert = vi.fn().mockReturnValue({ values });
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });
    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ insert, delete: deleteFn })),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.createVoucher({
      code: "WELCOME",
      creditAmount: 10,
      assignmentScope: "all",
      userIds: [],
    });

    expect(result).toEqual({ success: true, voucher: createdVoucher });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ maxRedemptions: 100000, appliesToAllUsers: true }));
  });

  // Verifies selected-user vouchers continue to use the selected-user count.
  it("defaults selected-user voucher redemptions to selected user count", async () => {
    const createdVoucher = { id: "11111111-1111-4111-8111-111111111111", maxRedemptions: 2 };
    const values = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([createdVoucher]),
    });
    const assignmentValues = vi.fn().mockResolvedValue(undefined);
    const insert = vi.fn().mockImplementation((table: unknown) => ({
      values: table === vouchers ? values : assignmentValues,
    }));
    const deleteWhere = vi.fn().mockResolvedValue(undefined);
    const deleteFn = vi.fn().mockReturnValue({ where: deleteWhere });
    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ insert, delete: deleteFn })),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.createVoucher({
      code: "WELCOME",
      creditAmount: 10,
      assignmentScope: "selected",
      userIds: ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
    });

    expect(result).toEqual({ success: true, voucher: createdVoucher });
    expect(values).toHaveBeenCalledWith(expect.objectContaining({ maxRedemptions: 2, appliesToAllUsers: false }));
  });

  // Verifies updates cannot create an impossible redeemed-count state.
  it("rejects maxRedemptions below currentRedemptions", async () => {
    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce({
            id: "11111111-1111-4111-8111-111111111111",
            code: "WELCOME",
            creditAmount: 10,
            status: "active",
            currentRedemptions: 3,
            maxRedemptions: 5,
            appliesToAllUsers: true,
            expiresAt: null,
            assignments: [],
          }),
        },
      },
      transaction: vi.fn(),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.updateVoucher({
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 2,
    });

    expect(result).toEqual({ success: false, error: "Max redemptions cannot be lower than current redemptions" });
    expect(db.transaction).not.toHaveBeenCalled();
  });

  // Verifies equal limits are allowed so admins can cap future redemptions at current usage.
  it("allows maxRedemptions equal to currentRedemptions", async () => {
    const updatedVoucher = { id: "11111111-1111-4111-8111-111111111111", maxRedemptions: 3 };
    const returning = vi.fn().mockResolvedValue([updatedVoucher]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const previousVoucher = {
      id: "11111111-1111-4111-8111-111111111111",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 3,
      maxRedemptions: 5,
      appliesToAllUsers: true,
      expiresAt: null,
      assignments: [],
    };

    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce(previousVoucher),
        },
      },
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ update })),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.updateVoucher({
      id: "11111111-1111-4111-8111-111111111111",
      maxRedemptions: 3,
    });

    expect(result).toEqual({ success: true, voucher: updatedVoucher, previousVoucher });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ maxRedemptions: 3, status: "redeemed" }));
  });

  // Verifies audit callers can compare the pre-update state to the persisted update.
  it("returns the previous voucher when an update succeeds", async () => {
    const previousVoucher = {
      id: "11111111-1111-4111-8111-111111111111",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 1,
      maxRedemptions: 5,
      appliesToAllUsers: true,
      expiresAt: null,
      assignments: [],
    };
    const updatedVoucher = { ...previousVoucher, code: "SPRING", creditAmount: 25 };
    const returning = vi.fn().mockResolvedValue([updatedVoucher]);
    const where = vi.fn().mockReturnValue({ returning });
    const set = vi.fn().mockReturnValue({ where });
    const update = vi.fn().mockReturnValue({ set });

    const db = {
      query: {
        vouchers: {
          findFirst: vi.fn().mockResolvedValueOnce(previousVoucher).mockResolvedValueOnce(null),
        },
      },
      transaction: vi.fn(async (cb: (tx: unknown) => unknown) => cb({ update })),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification: vi.fn() },
    });

    const result = await service.updateVoucher({
      id: "11111111-1111-4111-8111-111111111111",
      code: "spring",
      creditAmount: 25,
    });

    expect(result).toEqual({ success: true, voucher: updatedVoucher, previousVoucher });
    expect(set).toHaveBeenCalledWith(expect.objectContaining({ code: "SPRING", creditAmount: 25 }));
  });

  // Verifies committed redemptions are not reported as failed when only notification delivery fails.
  it("treats post-redemption notification failures as non-fatal", async () => {
    const voucher = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 0,
      maxRedemptions: 2,
      appliesToAllUsers: true,
      expiresAt: null,
      redeemedAt: null,
    };
    const execute = vi.fn().mockResolvedValue([voucher]);
    const findCredits = vi.fn().mockResolvedValueOnce({
      userId: "33333333-3333-4333-8333-333333333333",
      balance: "5",
      totalPurchased: "0",
      totalSpent: "0",
    });
    const insert = vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn(() => {
        if (table === voucherRedemptions) {
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([{ id: "redemption-1" }]),
            })),
          };
        }

        return Promise.resolve(undefined);
      }),
    }));
    const update = vi.fn().mockImplementation((table: unknown) => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(table === userCredits ? [{ balanceAfter: "15" }] : []),
        })),
      })),
    }));
    const tx = {
      execute,
      query: {
        userCredits: { findFirst: findCredits },
      },
      insert,
      update,
    };
    const createNotification = vi.fn().mockRejectedValue(new Error("notification unavailable"));
    const db = {
      transaction: vi.fn(async (cb: (trx: unknown) => unknown) => cb(tx)),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification },
    });

    const result = await service.redeemVoucher("33333333-3333-4333-8333-333333333333", "welcome");

    expect(result).toEqual({ success: true, creditsAdded: 10, newBalance: 15 });
    expect(createNotification).toHaveBeenCalledOnce();
    expect(insert).toHaveBeenCalledWith(voucherRedemptions);
    expect(insert).toHaveBeenCalledWith(creditTransactions);
    expect(update).toHaveBeenCalledWith(userCredits);
    expect(update).toHaveBeenCalledWith(vouchers);
  });

  // Verifies duplicate redemption fails before mutating user credits or voucher counters.
  it("rejects duplicate user redemptions before credit mutation", async () => {
    const voucher = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 0,
      maxRedemptions: 2,
      appliesToAllUsers: true,
      expiresAt: null,
      redeemedAt: null,
    };
    const execute = vi.fn().mockResolvedValue([voucher]);
    const insert = vi.fn().mockImplementation((table: unknown) => ({
      values: vi.fn(() => {
        if (table === voucherRedemptions) {
          return {
            onConflictDoNothing: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue([]),
            })),
          };
        }

        return Promise.resolve(undefined);
      }),
    }));
    const findCredits = vi.fn();
    const update = vi.fn();
    const tx = {
      execute,
      query: {
        userCredits: { findFirst: findCredits },
      },
      insert,
      update,
    };
    const createNotification = vi.fn();
    const db = {
      transaction: vi.fn(async (cb: (trx: unknown) => unknown) => cb(tx)),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification },
    });

    const result = await service.redeemVoucher("33333333-3333-4333-8333-333333333333", "welcome");

    expect(result).toEqual({ success: false, error: "Voucher has already been redeemed by this user" });
    expect(insert).toHaveBeenCalledWith(voucherRedemptions);
    expect(insert).not.toHaveBeenCalledWith(creditTransactions);
    expect(findCredits).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  // Verifies concurrent duplicate attempts rely on the redemption reservation before credit mutation.
  it("allows only one concurrent duplicate redemption to mutate credits", async () => {
    const voucher = {
      id: "22222222-2222-4222-8222-222222222222",
      code: "WELCOME",
      creditAmount: 10,
      status: "active",
      currentRedemptions: 0,
      maxRedemptions: 2,
      appliesToAllUsers: true,
      expiresAt: null,
      redeemedAt: null,
    };

    const createTx = (reservationRows: Array<{ id: string }>) => {
      const findCredits = vi.fn().mockResolvedValue({
        userId: "33333333-3333-4333-8333-333333333333",
        balance: "5",
        totalPurchased: "0",
        totalSpent: "0",
      });
      const insert = vi.fn().mockImplementation((table: unknown) => ({
        values: vi.fn(() => {
          if (table === voucherRedemptions) {
            return {
              onConflictDoNothing: vi.fn(() => ({
                returning: vi.fn().mockResolvedValue(reservationRows),
              })),
            };
          }

          return Promise.resolve(undefined);
        }),
      }));
      const update = vi.fn().mockImplementation(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue([{ balanceAfter: "15" }]),
          })),
        })),
      }));

      return {
        tx: {
          execute: vi.fn().mockResolvedValue([voucher]),
          query: { userCredits: { findFirst: findCredits } },
          insert,
          update,
        },
        findCredits,
        insert,
        update,
      };
    };

    const winner = createTx([{ id: "redemption-1" }]);
    const duplicate = createTx([]);
    const createNotification = vi.fn().mockResolvedValue(undefined);
    const db = {
      transaction: vi.fn()
        .mockImplementationOnce((cb: (trx: unknown) => unknown) => cb(winner.tx))
        .mockImplementationOnce((cb: (trx: unknown) => unknown) => cb(duplicate.tx)),
    };

    const service = createVouchersService({
      db,
      notifications: { createNotification },
    });

    const [firstResult, secondResult] = await Promise.all([
      service.redeemVoucher("33333333-3333-4333-8333-333333333333", "welcome"),
      service.redeemVoucher("33333333-3333-4333-8333-333333333333", "welcome"),
    ]);

    expect(firstResult).toEqual({ success: true, creditsAdded: 10, newBalance: 15 });
    expect(secondResult).toEqual({ success: false, error: "Voucher has already been redeemed by this user" });
    expect(winner.insert).toHaveBeenCalledWith(creditTransactions);
    expect(winner.update).toHaveBeenCalledWith(userCredits);
    expect(winner.update).toHaveBeenCalledWith(vouchers);
    expect(duplicate.insert).toHaveBeenCalledWith(voucherRedemptions);
    expect(duplicate.insert).not.toHaveBeenCalledWith(creditTransactions);
    expect(duplicate.findCredits).not.toHaveBeenCalled();
    expect(duplicate.update).not.toHaveBeenCalled();
    expect(createNotification).toHaveBeenCalledOnce();
  });
});
