import { Badge } from "@/components/ui/badge";

export function QuestionDeliveryPurposeBadge({ purpose = "both" }: { purpose?: "practice" | "assessment" | "both" }) {
  const label = purpose === "assessment" ? "Assessment" : purpose === "practice" ? "Practice" : "Practice + assessment";
  return <Badge variant={purpose === "assessment" ? "default" : purpose === "practice" ? "secondary" : "outline"}>{label}</Badge>;
}
