import {
  createVoucherApi,
  getVoucherByIdApi,
  getVouchersApi,
  searchUsersForVoucherApi,
  updateVoucherApi,
} from "@/lib/api/admin";
export type { VoucherStatus } from "@platform/contracts";
import type { VoucherAssignmentScope, VoucherStatus } from "@platform/contracts";

export interface Voucher {
  id: string;
  code: string;
  creditAmount: number;
  status: VoucherStatus;
  maxRedemptions: number;
  currentRedemptions: number;
  appliesToAllUsers: boolean;
  expiresAt: string | null;
  redeemedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VoucherWithUsers extends Voucher {
  assignedUsers?: Array<{
    id: string;
    name: string | null;
    email: string;
  }>;
  redemptions?: Array<{
    id: string;
    voucherId: string;
    userId: string;
    creditsGranted: number;
    redeemedAt: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface VoucherFormData {
  code: string;
  creditAmount: number;
  assignmentScope: VoucherAssignmentScope;
  maxRedemptions?: number;
  userIds: string[];
  expiresAt?: Date | null;
  secret: string;
}

export async function getVouchers(limit = 20, offset = 0, search?: string, status?: VoucherStatus) {
  return getVouchersApi(limit, offset, search, status) as Promise<{
    vouchers: VoucherWithUsers[];
    total: number;
    hasMore: boolean;
  }>;
}

export async function getVoucherById(voucherId: string) {
  return getVoucherByIdApi(voucherId) as Promise<{
    success: boolean;
    voucher?: VoucherWithUsers;
    error?: string;
  }>;
}

export async function createVoucher(input: VoucherFormData) {
  return createVoucherApi(input) as Promise<{ success: boolean; voucher?: Voucher; error?: string }>;
}

export async function updateVoucher(input: VoucherFormData & { id: string }) {
  return updateVoucherApi(input) as Promise<{ success: boolean; voucher?: Voucher; error?: string }>;
}

export async function updateVoucherStatus(input: { id: string; status: VoucherStatus; secret: string }) {
  return updateVoucherApi(input) as Promise<{ success: boolean; voucher?: Voucher; error?: string }>;
}

export async function searchUsersForVoucher(query: string, limit = 20) {
  return searchUsersForVoucherApi(query, limit);
}
