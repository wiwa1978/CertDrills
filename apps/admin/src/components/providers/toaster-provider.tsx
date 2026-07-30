"use client";

import { Toaster } from "sonner";

import { useTheme } from "@/components/providers/theme-provider";

export function ToasterProvider() {
  const { resolvedTheme } = useTheme();

  return (
    <Toaster
      position="top-right"
      theme={resolvedTheme as "light" | "dark" | "system"}
      className="toaster group"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "group toast w-full flex items-center gap-3 rounded-lg border border-border bg-card p-4 shadow-lg",
          title: "text-sm font-medium text-card-foreground",
          description: "text-sm text-muted-foreground",
          actionButton:
            "inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          cancelButton:
            "inline-flex h-8 items-center justify-center rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
          success:
            "border-green-500/30 bg-green-50 dark:bg-green-950/30 [&_[data-title]]:text-green-800 dark:[&_[data-title]]:text-green-200 [&_[data-icon]]:text-green-600 dark:[&_[data-icon]]:text-green-400",
          error:
            "border-destructive/30 bg-red-50 dark:bg-red-950/30 [&_[data-title]]:text-red-800 dark:[&_[data-title]]:text-red-200 [&_[data-icon]]:text-red-600 dark:[&_[data-icon]]:text-red-400",
          warning:
            "border-yellow-500/30 bg-yellow-50 dark:bg-yellow-950/30 [&_[data-title]]:text-yellow-800 dark:[&_[data-title]]:text-yellow-200 [&_[data-icon]]:text-yellow-600 dark:[&_[data-icon]]:text-yellow-400",
          info: "border-blue-500/30 bg-blue-50 dark:bg-blue-950/30 [&_[data-title]]:text-blue-800 dark:[&_[data-title]]:text-blue-200 [&_[data-icon]]:text-blue-600 dark:[&_[data-icon]]:text-blue-400",
          closeButton:
            "absolute right-2 top-2 rounded-md p-1 text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground focus:opacity-100 focus:outline-none group-hover:opacity-100",
          icon: "[&_svg]:size-5",
        },
      }}
    />
  );
}
