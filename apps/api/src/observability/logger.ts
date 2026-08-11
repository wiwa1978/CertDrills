import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

import { env } from "../env";
import { redactLogValue, redactString } from "./redaction";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogStream = "app" | "audit";

type LogMetadata = Record<string, unknown>;

type ReadLogEntriesInput = {
  stream?: LogStream;
  file?: string;
  limit?: number;
};

const fileNamePattern = /^\d{4}-\d{2}-\d{2}(?:\.audit)?\.jsonl$/;
const MAX_LOG_TAIL_BYTES = 256 * 1024;
const MAX_SERIALIZE_DEPTH = 5;
const MAX_SERIALIZE_ARRAY_LENGTH = 25;
const MAX_SERIALIZE_KEYS = 50;
const MAX_SERIALIZE_STRING_LENGTH = 1000;
const levelPriority = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
  silent: 99,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function truncateString(value: string) {
  return value.length > MAX_SERIALIZE_STRING_LENGTH ? `${value.slice(0, MAX_SERIALIZE_STRING_LENGTH)}...[truncated]` : value;
}

function serializeString(value: string) {
  return truncateString(redactString(value));
}

function serialize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return typeof value === "string" ? serializeString(value) : value;
  }

  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return serializeString(String(value));
  }

  if (depth >= MAX_SERIALIZE_DEPTH) {
    return "[max-depth]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: serializeString(value.name),
      message: serializeString(value.message),
      stack: value.stack ? serializeString(value.stack) : undefined,
      cause: serialize(value.cause, depth + 1, seen),
    };
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SERIALIZE_ARRAY_LENGTH).map((entry) => serialize(entry, depth + 1, seen));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_SERIALIZE_KEYS)
        .map(([key, entry]) => [key, serialize(entry, depth + 1, seen)]),
    );
  }

  return serializeString(String(value));
}

function normalizeArgs(arg1?: unknown, arg2?: unknown) {
  if (typeof arg1 === "string") {
    return {
      message: redactLogValue(arg1) as string,
      metadata: isRecord(arg2)
        ? (redactLogValue(serialize(arg2)) as LogMetadata)
        : arg2 === undefined
          ? {}
          : { value: redactLogValue(serialize(arg2)) },
    };
  }

  if (isRecord(arg1)) {
    return {
      message: typeof arg2 === "string" ? (redactLogValue(arg2) as string) : "log",
      metadata: redactLogValue(serialize(arg1)) as LogMetadata,
    };
  }

  return {
    message: typeof arg2 === "string" ? (redactLogValue(arg2) as string) : "log",
    metadata: arg1 === undefined ? {} : { value: redactLogValue(serialize(arg1)) },
  };
}

function resolveLogDirectory() {
  if (!env.LOG_FILE_PATH) {
    return null;
  }

  const resolved = path.resolve(env.LOG_FILE_PATH);
  return path.extname(resolved) ? path.dirname(resolved) : resolved;
}

const logDirectory = resolveLogDirectory();
let logDirReady = false;

function shouldLog(level: LogLevel) {
  return levelPriority[level] >= levelPriority[env.LOG_LEVEL ?? "info"];
}

function getLogFileName(stream: LogStream, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return stream === "audit" ? `${day}.audit.jsonl` : `${day}.jsonl`;
}

function getLogFilePath(stream: LogStream, date = new Date()) {
  if (!logDirectory) {
    throw new Error("File logging is disabled");
  }

  return path.join(logDirectory, getLogFileName(stream, date));
}

async function writeFileEntry(stream: LogStream, line: string) {
  if (!logDirectory) return;

  try {
    if (!logDirReady) {
      await fs.promises.mkdir(logDirectory, { recursive: true });
      logDirReady = true;
    }

    await fs.promises.appendFile(getLogFilePath(stream), line, "utf8");
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "log.write.failed",
      error: error instanceof Error ? error.message : String(error),
    }));
  }
}

function writeEntry(stream: LogStream, level: LogLevel, arg1?: unknown, arg2?: unknown) {
  if (!shouldLog(level)) return;

  const { message, metadata } = normalizeArgs(arg1, arg2);
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    stream,
    level,
    service: "api",
    environment: env.NODE_ENV,
    ...metadata,
    message,
  };

  const line = `${JSON.stringify(entry)}\n`;

  void writeFileEntry(stream, line);

  if (level === "error") {
    console.error(line.trim());
  } else if (level === "warn") {
    console.warn(line.trim());
  } else if (level === "debug") {
    console.debug(line.trim());
  } else {
    console.info(line.trim());
  }
}

function getExpectedPatternForStream(stream: LogStream) {
  return stream === "audit" ? /^\d{4}-\d{2}-\d{2}\.audit\.jsonl$/ : /^\d{4}-\d{2}-\d{2}\.jsonl$/;
}

function listLogFiles(stream: LogStream) {
  if (!logDirectory || !fs.existsSync(logDirectory)) {
    return {
      files: [] as string[],
      selectedFile: null,
    };
  }

  const pattern = getExpectedPatternForStream(stream);
  const files = fs
    .readdirSync(logDirectory)
    .filter((file) => fileNamePattern.test(file) && pattern.test(file))
    .sort((a, b) => b.localeCompare(a));

  return {
    files,
    selectedFile: files[0] ?? null,
  };
}

function readTail(filePath: string) {
  const stats = fs.statSync(filePath);
  const bytesToRead = Math.min(stats.size, MAX_LOG_TAIL_BYTES);
  const buffer = Buffer.alloc(bytesToRead);
  const fd = fs.openSync(filePath, "r");

  try {
    fs.readSync(fd, buffer, 0, bytesToRead, stats.size - bytesToRead);
  } finally {
    fs.closeSync(fd);
  }

  const raw = buffer.toString("utf8");
  if (stats.size <= MAX_LOG_TAIL_BYTES) {
    return raw;
  }

  const firstNewline = raw.indexOf("\n");
  return firstNewline >= 0 ? raw.slice(firstNewline + 1) : raw;
}

function readLogEntries(input: ReadLogEntriesInput) {
  if (!logDirectory) {
    return {
      file: null,
      entries: [] as Array<Record<string, unknown>>,
    };
  }

  const stream = input.stream ?? "app";
  const available = listLogFiles(stream);
  const selectedFile = input.file ?? available.selectedFile;

  if (!selectedFile) {
    return {
      file: null,
      entries: [] as Array<Record<string, unknown>>,
    };
  }

  if (!fileNamePattern.test(selectedFile) || !getExpectedPatternForStream(stream).test(selectedFile)) {
    throw new Error("Invalid log file");
  }

  const filePath = path.join(logDirectory, selectedFile);
  if (!fs.existsSync(filePath)) {
    return {
      file: selectedFile,
      entries: [] as Array<Record<string, unknown>>,
    };
  }

  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 100), 1), 500);
  const raw = readTail(filePath);
  const entries = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
    })
    .filter((entry): entry is Record<string, unknown> => entry !== null)
    .slice(-limit)
    .reverse();

  return {
    file: selectedFile,
    entries,
  };
}

export const logger = {
  debug(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "debug", arg1, arg2);
  },
  info(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "info", arg1, arg2);
  },
  warn(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "warn", arg1, arg2);
  },
  error(arg1?: unknown, arg2?: unknown) {
    writeEntry("app", "error", arg1, arg2);
  },
  audit(arg1?: unknown, arg2?: unknown) {
    writeEntry("audit", "info", arg1, arg2);
  },
  listLogFiles,
  readLogEntries,
};
