import * as React from "react";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  value: number; // Used tokens
  max: number;   // Total tokens
}

export function ProgressBar({ value, max }: ProgressBarProps) {
  const percent = Math.min(100, (value / max) * 100);
  let color = "bg-primary";
  if (percent >= 90) {
    color = "bg-red-500";
  } else if (percent >= 80) {
    color = "bg-amber-500";
  }

  return (
    <div className="w-full h-3 rounded bg-primary/20 relative overflow-hidden">
      <div
        className={cn(
          "h-full rounded transition-all duration-300",
          color
        )}
        style={{ width: `${percent}%` }}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-medium">
        {value.toLocaleString()} / {max.toLocaleString()}
      </span>
    </div>
  );
}
