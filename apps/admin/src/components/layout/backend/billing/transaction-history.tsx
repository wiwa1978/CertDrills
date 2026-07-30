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
                    <TableCell className="w-44">
                      <Badge
                        variant="default"
                        className="w-32 justify-center"
                      >
                        <span>{transaction.type.toUpperCase()}</span>
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
