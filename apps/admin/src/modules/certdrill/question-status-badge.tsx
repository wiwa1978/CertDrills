import { Badge } from "@/components/ui/badge";

export function QuestionStatusBadge({ status = "draft" }: { status?: "draft" | "published" | "archived" }) {
  const label = status === "published" ? "Published" : status === "archived" ? "Archived" : "Draft";

  return (
    <Badge
      variant="outline"
      className={status === "published"
        ? "border-green-600/40 bg-green-600/10 text-green-700 dark:text-green-400"
        : undefined}
    >
      {label}
    </Badge>
  );
}
