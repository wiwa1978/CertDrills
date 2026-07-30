"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import type { ApiKeyScope } from "@platform/contracts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMyApiKey, listMyApiKeys, revokeMyApiKey } from "@/lib/api/me";
import { formatDateTime } from "@/lib/utils";

const scopes = ["read:profile", "read:billing", "read:credits"] as const satisfies readonly ApiKeyScope[];

export function ApiKeysCard() {
  const queryClient = useQueryClient();
  const [name, setName] = React.useState("");
  const [selectedScopes, setSelectedScopes] = React.useState<ApiKeyScope[]>(["read:profile"]);
  const [plaintextKey, setPlaintextKey] = React.useState<string | null>(null);

  const keysQuery = useQuery({ queryKey: ["me", "api-keys"], queryFn: listMyApiKeys });
  const createMutation = useMutation({
    mutationFn: () => createMyApiKey({ name: name.trim(), scopes: selectedScopes }),
    onSuccess: async (result) => {
      setPlaintextKey(result.plaintextKey);
      setName("");
      setSelectedScopes(["read:profile"]);
      await queryClient.invalidateQueries({ queryKey: ["me", "api-keys"] });
      toast.success("API key created");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to create API key"),
  });
  const revokeMutation = useMutation({
    mutationFn: revokeMyApiKey,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["me", "api-keys"] });
      toast.success("API key revoked");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Failed to revoke API key"),
  });

  function toggleScope(scope: ApiKeyScope) {
    setSelectedScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope]);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><KeyRound className="size-5" /> API keys</CardTitle>
        <CardDescription>Create user-scoped API keys. The full key is shown once.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {plaintextKey ? (
          <div className="rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="font-medium">Copy this key now</div>
            <div className="mt-2 break-all rounded-md bg-background p-3 font-mono text-xs">{plaintextKey}</div>
          </div>
        ) : null}

        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="api-key-name">Name</Label>
            <Input id="api-key-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Production integration" />
          </div>
          <Button disabled={!name.trim() || selectedScopes.length === 0 || createMutation.isPending} onClick={() => createMutation.mutate()}>
            Create key
          </Button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {scopes.map((scope) => (
            <label key={scope} className="flex items-center gap-2 rounded-lg border p-3 text-sm">
              <Checkbox checked={selectedScopes.includes(scope)} onCheckedChange={() => toggleScope(scope)} />
              <span className="font-mono text-xs">{scope}</span>
            </label>
          ))}
        </div>

        <div className="space-y-3">
          {(keysQuery.data ?? []).map((key) => (
            <div key={key.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-medium">{key.name}</div>
                <div className="text-xs text-muted-foreground">{key.keyPrefix}... · {key.scopes.join(", ")} · created {formatDateTime(key.createdAt)}</div>
                {key.revokedAt ? <div className="text-xs text-destructive">Revoked {formatDateTime(key.revokedAt)}</div> : null}
              </div>
              <Button variant="outline" size="sm" disabled={Boolean(key.revokedAt) || revokeMutation.isPending} onClick={() => revokeMutation.mutate(key.id)}>
                <Trash2 className="mr-2 size-4" /> Revoke
              </Button>
            </div>
          ))}
          {keysQuery.data?.length === 0 ? <p className="text-sm text-muted-foreground">No API keys yet.</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
