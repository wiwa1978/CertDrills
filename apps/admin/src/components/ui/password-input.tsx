"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { type ComponentProps, useState } from "react";

import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

export interface PasswordInputProps extends ComponentProps<typeof Input> {
  /**
   * When true, shows a toggle button to reveal/hide the password.
   * @default false
   */
  enableToggle?: boolean;
}

/**
 * Password input with optional visibility toggle.
 *
 * @example
 * ```tsx
 * <PasswordInput
 *   placeholder="Enter password"
 *   enableToggle
 *   {...field}
 * />
 * ```
 */
export function PasswordInput({
  className,
  enableToggle = false,
  onChange,
  ...props
}: PasswordInputProps) {
  const [hasValue, setHasValue] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        className={cn(enableToggle && "pr-10", className)}
        {...props}
        type={isVisible && enableToggle ? "text" : "password"}
        onChange={(event) => {
          setHasValue(!!event.target.value);
          onChange?.(event);
        }}
      />

      {enableToggle && (
        <>
          <Button
            className="absolute top-0 right-0 !bg-transparent"
            disabled={!hasValue}
            size="icon"
            type="button"
            variant="ghost"
            onClick={() => setIsVisible(!isVisible)}
            aria-label={isVisible ? "Hide password" : "Show password"}
          >
            {isVisible ? (
              <EyeIcon className="h-4 w-4" />
            ) : (
              <EyeOffIcon className="h-4 w-4" />
            )}
          </Button>

          {/* Hide browser's built-in password reveal button */}
          <style>{`
            .hide-password-toggle::-ms-reveal,
            .hide-password-toggle::-ms-clear {
              visibility: hidden;
              pointer-events: none;
              display: none;
            }
          `}</style>
        </>
      )}
    </div>
  );
}
