import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { useIsMobile } from "@/hooks/use-mobile";
import { useState } from "react";

export function BackendTopbarSearch() {
  const t = useTranslations("dashboard.topNav");
  const isMobile = useIsMobile();
  const [isExpanded, setIsExpanded] = useState(false);

  // On mobile: show icon only, expand on click
  // On desktop: always show full input
  if (isMobile) {
    if (!isExpanded) {
      return (
        <div className="flex items-center justify-center flex-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(true)}
            className="h-10 w-10"
          >
            <Search className="h-5 w-5" />
          </Button>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-center flex-1">
        <div className="relative w-full max-w-lg">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder={t("searchPlaceholder")}
            className="pl-10 pr-10 py-2 h-10 bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all duration-200"
            autoFocus
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(false)}
            className="absolute right-1 top-1/2 -translate-y-1/2 h-4 w-4"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  }

  // Desktop: always show full input
  return (
    <div className="flex items-center justify-center flex-1">
      <div className="relative w-full max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder={t("searchPlaceholder")}
          className="pl-10 pr-4 py-2 h-10 bg-muted/50 border-0 focus:bg-background focus:ring-2 focus:ring-primary/20 transition-all duration-200"
        />
      </div>
    </div>
  );
}
