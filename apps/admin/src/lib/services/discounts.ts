import {
  createDiscountApi,
  deleteDiscountApi,
  generateDiscountCodeApi,
  getDiscountByIdApi,
  getDiscountsApi,
  updateDiscountApi,
  validateDiscountCodeApi,
} from "@/lib/api/admin";

import type {
  AdminCreateDiscountInput,
  AdminUpdateDiscountInput,
  CreateDiscountInput,
  Discount,
  DiscountActionResult,
  DiscountListResponse,
  DiscountResponse,
  UpdateDiscountInput,
} from "@/types/discounts";

function discountFailure(error: string): DiscountActionResult {
  return {
    success: false,
    error,
  };
}

function discountSuccess(
  payload: Omit<Extract<DiscountActionResult, { success: true }>, "success">,
): DiscountActionResult {
  return {
    success: true,
    ...payload,
  };
}

export async function generateDiscountCodeAction(overridePrefix?: string): Promise<{ code: string; error?: string }> {
  try {
    const result = await generateDiscountCodeApi(overridePrefix);
    return { code: result.data?.code ?? "", error: result.error };
  } catch (error) {
    return {
      code: "",
      error: error instanceof Error ? error.message : "Failed to generate discount code",
    };
  }
}

export async function validateDiscountCodeAction(
  code: string,
  excludeId?: string,
): Promise<{ valid: boolean; error?: string }> {
  try {
    const result = await validateDiscountCodeApi(code, excludeId);
    return result;
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Failed to validate discount code",
    };
  }
}

export async function createDiscount(input: AdminCreateDiscountInput): Promise<DiscountActionResult> {
  try {
    const result = await createDiscountApi(input);
    if (!result.success) {
      return discountFailure(result.error || "Failed to create discount");
    }

    return discountSuccess({ discount: result.discount as Discount });
  } catch (error) {
    return discountFailure(error instanceof Error ? error.message : "Failed to create discount");
  }
}

export async function getDiscounts(
  limit: number = 20,
  offset: number = 0,
  search?: string,
  status?: "active" | "inactive" | "expired",
): Promise<DiscountListResponse> {
  const data = (await getDiscountsApi(limit, offset, search, status)) as DiscountListResponse;
  return data;
}

export async function getDiscountById(id: string): Promise<DiscountResponse> {
  const response = await getDiscountByIdApi(id);

  if (!response.success || !response.discount) {
    return { success: false, discount: null, error: "Discount not found" };
  }

  return response as DiscountResponse;
}

export async function updateDiscount(input: AdminUpdateDiscountInput): Promise<DiscountActionResult> {
  const result = await updateDiscountApi(input);

  if (!result.success) {
    return discountFailure(result.error || "Failed to update discount");
  }

  return discountSuccess({ discount: result.discount as Discount });
}

export async function deleteDiscount(id: string, secret: string): Promise<DiscountActionResult> {
  const result = await deleteDiscountApi(id, secret);
  if (!result.success) {
    return discountFailure(result.error || "Failed to delete discount");
  }

  return discountSuccess({});
}
