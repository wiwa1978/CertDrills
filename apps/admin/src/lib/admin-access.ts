import { errorCode } from "@platform/contracts/wire";
import { ApiRequestError } from "@platform/frontend-shared";

export type AdminAccessCheck =
  | { allowed: true }
  | { allowed: false; reason: "two-factor-required" | "forbidden" };

export async function checkAdminAccess(loadStatus: () => Promise<unknown>): Promise<AdminAccessCheck> {
  try {
    await loadStatus();
    return { allowed: true };
  } catch (error) {
    const reason = error instanceof ApiRequestError && error.errorCode === errorCode.twoFactorRequired
      ? "two-factor-required"
      : "forbidden";
    return { allowed: false, reason };
  }
}
