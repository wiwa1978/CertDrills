import { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number | React.ReactNode;
  icon?: LucideIcon;
  iconColor?: string;
  iconBgColor?: string;
  description?: string;
  className?: string;
  trend?: {
    value: number; // Percentage change
    label?: string; // Optional custom label, defaults to "vs last month"
  };
}

export function StatCard({
  title,
  value,
  icon: Icon,
  iconColor,
  iconBgColor,
  description,
  className,
  trend,
}: StatCardProps) {
  const isPositive = trend && trend.value >= 0;
  const trendLabel = trend?.label || "vs last month";

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && (
          iconBgColor ? (
            <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBgColor)}>
              <Icon className={cn("h-5 w-5", iconColor)} />
            </div>
          ) : (
            <Icon className={cn("h-4 w-4 text-muted-foreground", iconColor)} />
          )
        )}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <div className="flex items-center gap-1 mt-1">
            {isPositive ? (
              <TrendingUp className="h-3 w-3 text-green-600" />
            ) : (
              <TrendingDown className="h-3 w-3 text-red-600" />
            )}
            <p className={cn(
              "text-xs font-medium",
              isPositive ? "text-green-600" : "text-red-600"
            )}>
              {isPositive ? "+" : ""}{trend.value.toFixed(1)}%
            </p>
            <p className="text-xs text-muted-foreground">{trendLabel}</p>
          </div>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
