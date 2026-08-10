"use client";

import { useActionState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  resetCertDrillProgressAction,
  type CertDrillProgressResetActionState,
} from "./progress-reset-action";

const initialState: CertDrillProgressResetActionState = { status: "idle" };

export function CertDrillProgressResetCard({ userId, userName }: { userId: string; userName: string }) {
  const [state, action, pending] = useActionState(resetCertDrillProgressAction, initialState);

  function confirmReset(event: FormEvent<HTMLFormElement>) {
    const confirmed = window.confirm(
      `Delete all CertDrill attempts, answers, scenario responses, and missed-question review items for ${userName}? This cannot be undone.`,
    );
    if (!confirmed) event.preventDefault();
  }

  return (
    <Card className="mb-6 border-destructive/40">
      <CardHeader>
        <CardTitle>CertDrill test data</CardTitle>
        <CardDescription>
          Reset this user to a clean CertDrill starting state. Account details, purchases, and question feedback are preserved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} onSubmit={confirmReset} className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input type="hidden" name="userId" value={userId} />
          <p className="text-sm text-muted-foreground">
            Deletes completed and in-progress attempts, score history, and the missed-question queue.
          </p>
          <Button type="submit" variant="destructive" disabled={pending}>
            {pending ? "Resetting…" : "Reset CertDrill progress"}
          </Button>
        </form>
        {state.message ? (
          <p role={state.status === "error" ? "alert" : "status"} className={state.status === "error" ? "mt-3 text-sm text-destructive" : "mt-3 text-sm text-green-700 dark:text-green-400"}>
            {state.message}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
