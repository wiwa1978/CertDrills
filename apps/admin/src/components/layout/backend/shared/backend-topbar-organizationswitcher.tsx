import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export function BackendTopbarOrganizationSwitcher() {
  const t = useTranslations("dashboard.topNav");

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
      <TooltipTrigger asChild>
          <Button
          variant="ghost"
          size="icon"
          className="inline-flex h-9 w-9 hover:bg-muted transition-colors"
          >
          <Building2 className="h-4 w-4" />
          <span className="sr-only">{t("organizationSwitcher")}</span>
          </Button>
      </TooltipTrigger>
      <TooltipContent>{t("organizationSwitcher")}</TooltipContent>
      </Tooltip>
  </TooltipProvider>
   
  )
}
