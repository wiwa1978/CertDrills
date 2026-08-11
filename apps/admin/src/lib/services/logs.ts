import { getAdminLogEntriesApi, getAdminLogFilesApi } from "@/lib/api/admin";

export type LogStream = "app" | "audit";

export type LogFileList = {
  files: string[];
  selectedFile: string | null;
};

export type LogEntry = {
  id: string;
  timestamp: string;
  requestId?: string;
  stream: LogStream;
  level: "debug" | "info" | "warn" | "error";
  category?: string;
  action?: string;
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
};

export async function getLogFiles(stream: LogStream) {
  return getAdminLogFilesApi(stream) as Promise<LogFileList>;
}

export async function getLogEntries(payload: { stream?: LogStream; file?: string; limit?: number }) {
  return getAdminLogEntriesApi(payload) as Promise<{
    file: string | null;
    entries: LogEntry[];
  }>;
}
