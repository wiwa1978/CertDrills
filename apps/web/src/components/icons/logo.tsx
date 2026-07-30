import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
}

export function Logo({ className }: LogoProps) {
  return (
    <svg
      className={cn("h-8 w-8", className)}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        className="fill-primary"
      />
      <path
        d="M8 12L16 8L24 12V20L16 24L8 20V12Z"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 16L24 12"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 16V24"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16 16L8 12"
        className="stroke-primary-foreground"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function LogoWithText({ className }: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Logo />
      <span className="text-xl font-bold">Acme</span>
    </div>
  );
}
