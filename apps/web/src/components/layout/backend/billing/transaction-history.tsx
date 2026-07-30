import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getCreditHistory } from "@/lib/services/credits";
import { formatDateTime } from "@/lib/utils";

export async function TransactionHistory() {
  const transactions = await getCreditHistory();
  const t = await getTranslations("billing.transactions");

  const getTransactionTypePresentation = (type: (typeof transactions)[number]["type"]) => {
    switch (type) {
      case "purchase":
        return { label: t("types.purchase"), variant: "default" as const, className: "" };
      case "usage":
        return { label: t("types.usage"), variant: "secondary" as const, className: "" };
      case "bonus":
        return {
          label: t("types.bonus"),
          variant: "outline" as const,
          className: "bg-green-100 text-green-800 hover:bg-green-200 border-green-300",
        };
      case "admin_adjustment":
        return { label: t("types.admin_adjustment"), variant: "outline" as const, className: "" };
      case "voucher":
        return {
          label: t("types.voucher"),
          variant: "outline" as const,
          className: "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border-emerald-300",
        };
      default:
        return { label: type, variant: "default" as const, className: "" };
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">{t("empty")}</p>
          </div>
        ) : (
          <div className="relative overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">{t("table.type")}</TableHead>
                  <TableHead>{t("table.amount")}</TableHead>
                  <TableHead>{t("table.balance")}</TableHead>
                  <TableHead>{t("table.description")}</TableHead>
                  <TableHead>{t("table.date")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    {(() => {
                      const typePresentation = getTransactionTypePresentation(transaction.type);

                      return (
                        <>
                    <TableCell className="w-44">
                      <Badge
                        variant={typePresentation.variant}
                        className={`w-32 justify-center ${typePresentation.className}`.trim()}
                      >
                        <span>{typePresentation.label}</span>
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={
                        parseFloat(transaction.amount) > 0
                          ? "text-green-600 font-medium"
                          : "text-red-600 font-medium"
                      }
                    >
                      {parseFloat(transaction.amount) > 0 ? "+" : ""}
                      {parseFloat(transaction.amount).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {parseFloat(transaction.balanceAfter).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {transaction.description || "-"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {formatDateTime(transaction.createdAt)}
                    </TableCell>
                        </>
                      );
                    })()}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TableSkeleton() {
  return (
    <Card>
      <CardHeader>
        <Skeleton className="h-6 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
