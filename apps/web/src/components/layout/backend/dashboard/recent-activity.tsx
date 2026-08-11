import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function RecentActivity() {
    const t = useTranslations("dashboard");
   
    return (
        <div>
            <Card>
            <CardHeader>
            <CardTitle>{t("recentActivity.title")}</CardTitle>
            <CardDescription>{t("recentActivity.description")}</CardDescription>
            </CardHeader>
            <CardContent>
            <div className="rounded-lg border border-dashed p-8 text-center">
                <p className="text-sm text-muted-foreground">
                {t("recentActivity.placeholder")}
                </p>
            </div>
            </CardContent>
        </Card>
        </div>
    )
}
