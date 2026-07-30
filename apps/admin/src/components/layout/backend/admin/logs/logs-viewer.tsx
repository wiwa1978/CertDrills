"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getLogEntries, getLogFiles, type LogStream } from "@/lib/services/logs";
import { DataTable } from "@/components/ui/data-table";
import type { ColumnDef } from "@tanstack/react-table";

export function LogsViewer() {
  const [stream, setStream] = React.useState<LogStream>("app");
  const [file, setFile] = React.useState<string | undefined>();

  const filesQuery = useQuery({
    queryKey: ["admin", "logs", "files", stream],
    queryFn: () => getLogFiles(stream),
  });

  React.useEffect(() => {
    if (!file && filesQuery.data?.selectedFile) {
      setFile(filesQuery.data.selectedFile);
    }
  }, [file, filesQuery.data?.selectedFile]);

  const entriesQuery = useQuery({
    queryKey: ["admin", "logs", "entries", stream, file],
    queryFn: () => getLogEntries({ stream, file, limit: 200 }),
    enabled: !!file,
  });

  const columns = React.useMemo<ColumnDef<Record<string, unknown>>[]>(() => [
    {
      accessorKey: "timestamp",
      header: "Timestamp",
    },
    {
      accessorKey: "level",
      header: "Level",
      cell: ({ row }) => <Badge variant="outline">{String(row.original.level ?? "info")}</Badge>,
    },
    {
      accessorKey: "requestId",
      header: "Request ID",
    },
    {
      accessorKey: "message",
      header: "Message",
      cell: ({ row }) => <span className="line-clamp-1">{String(row.original.message ?? "")}</span>,
    },
  ], []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structured Logs</CardTitle>
        <CardDescription>Browse daily app and audit JSONL logs.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <Select value={stream} onValueChange={(value) => { setStream(value as LogStream); setFile(undefined); }}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="app">App</SelectItem>
              <SelectItem value="audit">Audit</SelectItem>
            </SelectContent>
          </Select>

          <Select value={file} onValueChange={setFile}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Select log file" />
            </SelectTrigger>
            <SelectContent>
              {(filesQuery.data?.files ?? []).map((entry) => (
                <SelectItem key={entry} value={entry}>{entry}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={columns}
          data={entriesQuery.data?.entries ?? []}
          loading={filesQuery.isLoading || entriesQuery.isLoading}
          emptyText="No log entries found."
        />
      </CardContent>
    </Card>
  );
}
