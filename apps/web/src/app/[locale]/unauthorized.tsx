"use client";

import { LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Logo } from "@/components/icons/logo";
import { Link, usePathname } from "@/i18n/navigation";

export default function UnauthorizedPage() {
  const pathname = usePathname();
  const callbackUrl = encodeURIComponent(pathname);

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="w-full max-w-md">
        <div className="rounded-xl border bg-card p-8 shadow-lg">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <Logo className="h-10 w-10" />
          </div>

          {/* Icon */}
          {/* <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <LogIn className="h-8 w-8 text-primary" />
            </div>
          </div> */}

          {/* Content */}
          <div className="mb-8 space-y-2 text-center">
            <h1 className="text-2xl font-bold tracking-tight">Authentication Required</h1>
            <p className="text-muted-foreground">
              You need to sign in to access this page. Please log in with your account to continue.
            </p>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-3">
            <Button asChild className="w-full">
              <Link href={`/login?callbackUrl=${callbackUrl}`}>Sign In</Link>
            </Button>
            <Button variant="outline" asChild className="w-full">
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>

        {/* Footer text */}
        <p className="mt-6 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="font-medium text-primary hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}