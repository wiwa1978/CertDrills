import { redirect } from "next/navigation";

export default function AdminDiscountsPage() {
  redirect("/admin/billing?section=discounts");
}
