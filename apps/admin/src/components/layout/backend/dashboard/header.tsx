import { useTranslations } from "next-intl";
import { useSession } from "@/lib/auth-client";

export function DashboardHeader() {
    const t = useTranslations("dashboard");
    const { data: session, isPending } = useSession();
    return (
        <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
            <p className="text-muted-foreground">
            {isPending
                ? t("loading")
                : session?.user
                ? t("welcomeBack", { name: session.user.name })
                : t("welcomeGeneric")}
            </p>
        </div>
    )
}
