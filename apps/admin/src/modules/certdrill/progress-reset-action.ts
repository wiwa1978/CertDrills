"use server";

import { revalidatePath } from "next/cache";

import { resetCertDrillAdminUserProgressServer } from "@/lib/api/certdrill.server";

export type CertDrillProgressResetActionState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function resetCertDrillProgressAction(
  _state: CertDrillProgressResetActionState,
  formData: FormData,
): Promise<CertDrillProgressResetActionState> {
  const userId = formData.get("userId");
  if (typeof userId !== "string" || !userId) {
    return { status: "error", message: "A valid user is required." };
  }

  try {
    const result = await resetCertDrillAdminUserProgressServer(userId);
    revalidatePath(`/admin/users/${userId}`);
    return {
      status: "success",
      message: `Deleted ${result.deletedAttemptCount} attempt${result.deletedAttemptCount === 1 ? "" : "s"} and ${result.deletedReviewItemCount} missed-question review item${result.deletedReviewItemCount === 1 ? "" : "s"}.`,
    };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "CertDrill progress could not be reset.",
    };
  }
}
