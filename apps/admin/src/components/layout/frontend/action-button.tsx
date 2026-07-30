"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button, type buttonVariants } from "@/components/ui/button";
import type { VariantProps } from "class-variance-authority";

export interface ActionButtonProps
  extends Omit<React.ComponentProps<"button">, "onError">,
    VariantProps<typeof buttonVariants> {
  /** Async action that returns success/error state */
  action: () => Promise<{ error: boolean; message?: string }>;
  /** Text to show while loading (optional, shows spinner with children by default) */
  loadingText?: string;
  /** Called on success with the message */
  onSuccess?: (message?: string) => void;
  /** Called on error with the message */
  onError?: (message?: string) => void;
  /** Whether to show toast messages (default: true) */
  showToast?: boolean;
}

export function ActionButton({
  action,
  loadingText,
  onSuccess,
  onError,
  showToast = true,
  children,
  disabled,
  ...props
}: ActionButtonProps) {
  const [isPending, setIsPending] = React.useState(false);

  const handleClick = async () => {
    setIsPending(true);
    try {
      const result = await action();
      if (result.error) {
        if (showToast && result.message) {
          toast.error(result.message);
        }
        onError?.(result.message);
      } else {
        if (showToast && result.message) {
          toast.success(result.message);
        }
        onSuccess?.(result.message);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "An error occurred";
      if (showToast) {
        toast.error(message);
      }
      onError?.(message);
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Button {...props} disabled={disabled || isPending} onClick={handleClick}>
      {isPending ? (
        <>
          <Loader2 className="animate-spin" />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
