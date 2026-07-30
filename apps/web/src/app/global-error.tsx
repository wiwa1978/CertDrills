"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

import { Logo } from "@/components/icons/logo";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string; errorCode?: string; requestId?: string };
  reset: () => void;
}) {
  const isDevelopment = process.env.NODE_ENV === "development";
  const diagnosticCode = error.errorCode || error.digest || error.requestId || "WEB-UNEXPECTED";

  return (
    <html>
      <body className="min-h-screen bg-muted/30">
        <main className="flex min-h-screen items-center justify-center px-4 py-12">
          <div className="w-full max-w-2xl rounded-2xl border bg-card p-8 shadow-xl">
            <div className="mb-6 flex justify-center">
              <Logo className="h-10 w-10" />
            </div>

            <div className="mb-8 flex justify-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertTriangle className="h-7 w-7" />
              </div>
            </div>

            <div className="space-y-3 text-center">
              <h1 className="text-2xl font-semibold tracking-tight">Something went wrong</h1>
              <p className="text-muted-foreground">
                {isDevelopment
                  ? error.message
                  : "An unexpected error occurred. Use the error code below to find the matching server logs."}
              </p>
            </div>

            <div className="mt-8 rounded-xl border bg-muted/40 p-4">
              <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">Error Code</p>
              <p className="mt-2 break-all font-mono text-sm">{diagnosticCode}</p>
            </div>

            {isDevelopment && error.stack ? (
              <pre className="mt-6 max-h-80 overflow-auto rounded-xl border bg-black p-4 text-left text-xs text-white">
                {error.stack}
              </pre>
            ) : null}

            <div className="mt-8 flex justify-center">
              <Button onClick={() => reset()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
