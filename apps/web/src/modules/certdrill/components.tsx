import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function CertDrillShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "min-h-[calc(100vh-7rem)] rounded-xl bg-background px-4 py-8 text-foreground",
        className
      )}
    >
      <div className="mx-auto w-full max-w-7xl">{children}</div>
    </section>
  );
}

export function StampBox({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <div className="mb-6 inline-flex flex-wrap border border-border bg-card font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">
      {items.map((item) => (
        <div key={`${item.label}:${item.value}`} className="border-r border-border px-3 py-2 last:border-r-0">
          {item.label}: <b className="font-semibold text-primary">{item.value}</b>
        </div>
      ))}
    </div>
  );
}

type ActionButtonProps = ComponentProps<"button"> & {
  href?: string;
  variant?: "primary" | "secondary" | "ghost";
};

export function ActionButton({ href, className, variant = "primary", disabled, ...props }: ActionButtonProps) {
  const classes = cn(
    "inline-flex items-center justify-center rounded-[3px] px-5 py-2.5 font-semibold transition",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    variant === "primary" && "bg-primary text-primary-foreground hover:opacity-90",
    variant === "secondary" && "border border-border bg-card text-foreground hover:bg-accent",
    variant === "ghost" && "text-muted-foreground hover:text-foreground",
    disabled && "pointer-events-none opacity-50",
    className
  );

  if (href && !disabled) {
    return <Link href={href} className={classes}>{props.children}</Link>;
  }

  return <button className={classes} disabled={disabled} {...props} />;
}

export function CategoryTag({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "success" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2.5 py-1 font-mono text-xs",
        tone === "default" && "border-border text-muted-foreground",
        tone === "accent" && "border-primary bg-primary/10 text-primary",
        tone === "success" && "border-green-600 bg-green-600/10 text-green-700 dark:text-green-400",
        tone === "danger" && "border-destructive bg-destructive/10 text-destructive"
      )}
    >
      {children}
    </span>
  );
}
