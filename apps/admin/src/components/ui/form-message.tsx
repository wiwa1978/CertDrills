import * as React from "react";
import { cn } from "@/lib/utils";

interface FormMessageProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children?: React.ReactNode;
}

/**
 * Form message component for displaying field-level validation errors.
 * Styled with primary color to match the app's design.
 */
export function FormMessage({
  className,
  children,
  ...props
}: FormMessageProps) {
  if (!children) return null;

  return (
    <p
      className={cn("text-sm font-medium text-primary", className)}
      {...props}
    >
      {children}
    </p>
  );
}
