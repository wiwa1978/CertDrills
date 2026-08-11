"use client";

type LogLevel = "debug" | "info" | "warn" | "error";
type LogContext = Record<string, unknown> | undefined;
const REDACTED_VALUE = "[REDACTED]";

function isSensitiveKey(key: string | undefined) {
  if (!key) return false;

  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return normalized.includes("password")
    || normalized === "authorization"
    || normalized === "cookie"
    || normalized === "setcookie"
    || normalized === "apikey"
    || normalized.endsWith("token")
    || normalized.endsWith("secret")
    || normalized === "otp"
    || normalized === "totp"
    || normalized === "recoverycode";
}

function serializeStructuredBody(value: string, key: string | undefined) {
  if (key !== "body" && key !== "requestBody") return undefined;

  try {
    const parsed = JSON.parse(value);
    if (parsed === null || typeof parsed !== "object") return undefined;
    return JSON.stringify(toSerializable(parsed));
  } catch {
    return undefined;
  }
}


function toSerializable(value: unknown, key?: string): unknown {
  if (isSensitiveKey(key)) return REDACTED_VALUE;

  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return serializeStructuredBody(value, key) ?? value;
  }

  if (value instanceof Error) {
    const errorWithCause = value as Error & { cause?: unknown };

    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      cause: toSerializable(errorWithCause.cause, "cause"),
    };
  }

  if (value instanceof URL) {
    return value.toString();
  }

  if (typeof Headers !== "undefined" && value instanceof Headers) {
    return Object.fromEntries(value.entries());
  }

  if (typeof Request !== "undefined" && value instanceof Request) {
    return {
      method: value.method,
      url: value.url,
      credentials: value.credentials,
      headers: toSerializable(value.headers, "headers"),
    };
  }

  if (typeof Response !== "undefined" && value instanceof Response) {
    return {
      status: value.status,
      statusText: value.statusText,
      ok: value.ok,
      redirected: value.redirected,
      type: value.type,
      url: value.url,
      headers: toSerializable(value.headers, "headers"),
    };
  }

  if (Array.isArray(value)) {
    return value.map((item) => toSerializable(item));
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};

    for (const propertyName of Object.getOwnPropertyNames(record)) {
      output[propertyName] = toSerializable(record[propertyName], propertyName);
    }

    return output;
  }

  return String(value);
}

export function createClientLogger(options: { endpoint: string }) {
  const rawConsole = {
    debug: console.debug.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  let consoleBridgeInstalled = false;

  function sendLog(level: LogLevel, message: string, context?: LogContext) {
    const payload = {
      level,
      message,
      context: toSerializable(context),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      timestamp: new Date().toISOString(),
    };

    if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
      const body = JSON.stringify(payload);
      navigator.sendBeacon(options.endpoint, new Blob([body], { type: "application/json" }));
      return;
    }

    fetch(options.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      credentials: "include",
      keepalive: true,
    }).catch(() => {
    });
  }

  function consoleLog(level: LogLevel, message: string, context?: LogContext) {
    const method =
      level === "error"
        ? rawConsole.error
        : level === "warn"
          ? rawConsole.warn
          : level === "info"
            ? rawConsole.info
            : rawConsole.debug;
    method(message, toSerializable(context) ?? {});
  }

  return {
    installConsoleLogBridge() {
      if (consoleBridgeInstalled || typeof window === "undefined") {
        return;
      }

      const wrap = (level: LogLevel, base: (...args: unknown[]) => void) => {
        return (...args: unknown[]) => {
          base(...args);
          const [message, ...rest] = args;
          const normalizedMessage = typeof message === "string" ? message : "[client-log]";
          const context = rest.length > 0 ? { args: toSerializable(rest) } : undefined;
          sendLog(level, normalizedMessage, context);
        };
      };

      console.debug = wrap("debug", rawConsole.debug);
      console.info = wrap("info", rawConsole.info);
      console.warn = wrap("warn", rawConsole.warn);
      console.error = wrap("error", rawConsole.error);

      consoleBridgeInstalled = true;
    },
    logger: {
      debug(message: string, context?: LogContext) {
        consoleLog("debug", message, context);
        sendLog("debug", message, context);
      },
      info(message: string, context?: LogContext) {
        consoleLog("info", message, context);
        sendLog("info", message, context);
      },
      warn(message: string, context?: LogContext) {
        consoleLog("warn", message, context);
        sendLog("warn", message, context);
      },
      error(message: string, context?: LogContext) {
        consoleLog("error", message, context);
        sendLog("error", message, context);
      },
    },
  };
}
