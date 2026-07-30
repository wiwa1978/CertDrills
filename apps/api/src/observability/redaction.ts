const REDACTED = "[redacted]";
const MAX_REDACTION_DEPTH = 5;
const MAX_REDACTION_ARRAY_LENGTH = 25;
const MAX_SAFE_CONTEXT_DEPTH = 4;
const MAX_SAFE_CONTEXT_ARRAY_LENGTH = 8;
const MAX_SAFE_CONTEXT_KEYS = 8;
const MAX_SAFE_CONTEXT_STRING_LENGTH = 128;
const SENSITIVE_KEY_PATTERN = /(?:password|passcode|secret|token|authorization|cookie|api[-_]?key|session|credential|signature)/i;
const SENSITIVE_STRING_KEY_PATTERN = String.raw`[A-Za-z0-9_-]*(?:password|passcode|secret|token|authorization|cookie|api[-_]?key|session|credential|signature)[A-Za-z0-9_-]*`;
const URL_SECRET_PARAM_PATTERN = /([?&][^=]*(?:token|secret|code|key|signature|session)[^=]*=)[^&#]*/gi;
const SECRET_ASSIGNMENT_PREFIX_PATTERN = new RegExp(
  String.raw`((?:(?:\\(["'])${SENSITIVE_STRING_KEY_PATTERN}\\\2|(["'])${SENSITIVE_STRING_KEY_PATTERN}\3|\b${SENSITIVE_STRING_KEY_PATTERN})\s*[:=])\s*)`,
  "gi",
);
const BEARER_PATTERN = /\bBearer\s+[-._~+/A-Za-z0-9]+=*/gi;
const JWT_PATTERN = /\b[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;

function findQuotedValueEnd(value: string, start: number, quote: string, stopAtStructuralDelimiter = false) {
  let structuralDelimiterIndex = -1;

  for (let index = start + 1; index < value.length; index += 1) {
    if (value[index] === "\\") {
      index += 1;
      continue;
    }

    if (value[index] === quote) {
      if (
        stopAtStructuralDelimiter &&
        structuralDelimiterIndex !== -1 &&
        value.slice(structuralDelimiterIndex + 1, index).search(SECRET_ASSIGNMENT_PREFIX_PATTERN) !== -1
      ) {
        return -1;
      }

      return index;
    }

    if (stopAtStructuralDelimiter && value[index] === "}" && structuralDelimiterIndex === -1) {
      structuralDelimiterIndex = index;
    }
  }

  return -1;
}

function findEscapedQuotedValueEnd(value: string, start: number, quote: string, stopAtStructuralDelimiter = false) {
  let structuralDelimiterIndex = -1;

  for (let index = start + 2; index < value.length; index += 1) {
    if (value[index] === "\\" && value[index + 1] === quote && value[index - 1] !== "\\") {
      if (
        stopAtStructuralDelimiter &&
        structuralDelimiterIndex !== -1 &&
        value.slice(structuralDelimiterIndex + 1, index).search(SECRET_ASSIGNMENT_PREFIX_PATTERN) !== -1
      ) {
        return -1;
      }

      return index;
    }

    if (stopAtStructuralDelimiter && value[index] === "}" && structuralDelimiterIndex === -1) {
      structuralDelimiterIndex = index;
    }
  }

  return -1;
}

function isStructuralColonAssignment(prefix: string) {
  return prefix.includes(":") && /^\\?["']/.test(prefix.trimStart());
}

function findUnterminatedQuotedValueEnd(value: string, start: number, extraDelimiters: string) {
  let index = start;
  while (index < value.length) {
    if (value[index] === "\\") {
      index += 2;
      continue;
    }

    if (extraDelimiters.includes(value[index] ?? "")) {
      return index;
    }

    index += 1;
  }

  return index;
}

function findUnquotedValueEnd(value: string, start: number, extraDelimiters: string) {
  let index = start;
  while (index < value.length && !extraDelimiters.includes(value[index] ?? "")) {
    if (index > start && value.slice(index).search(SECRET_ASSIGNMENT_PREFIX_PATTERN) === 0) {
      return index;
    }

    index += 1;
  }

  return index;
}

function redactSecretAssignments(value: string) {
  let redacted = "";
  let readIndex = 0;

  for (const match of value.matchAll(SECRET_ASSIGNMENT_PREFIX_PATTERN)) {
    const prefix = match[0];
    const matchIndex = match.index ?? 0;
    const separator = prefix.includes(":") ? ":" : "=";
    const stopAtStructuralDelimiter = isStructuralColonAssignment(prefix);
    const valueStart = matchIndex + prefix.length;
    if (valueStart < readIndex) {
      continue;
    }

    redacted += value.slice(readIndex, valueStart);
    const valueQuote = value[valueStart];
    if (valueQuote === "\\" && (value[valueStart + 1] === '"' || value[valueStart + 1] === "'")) {
      const quote = value[valueStart + 1] ?? "";
      const quotedEnd = findEscapedQuotedValueEnd(value, valueStart, quote, stopAtStructuralDelimiter);
      if (quotedEnd === -1) {
        const valueEnd = findUnterminatedQuotedValueEnd(value, valueStart + 2, separator === ":" ? ",}]" : "&#,}]\n");
        redacted += REDACTED;
        readIndex = valueEnd;
      } else if (separator === ":") {
        redacted += `\\${quote}${REDACTED}\\${quote}`;
        readIndex = quotedEnd + 2;
      } else {
        redacted += REDACTED;
        readIndex = quotedEnd + 2;
      }
      continue;
    }

    if (valueQuote === '"' || valueQuote === "'") {
      const quotedEnd = findQuotedValueEnd(value, valueStart, valueQuote, stopAtStructuralDelimiter);
      if (quotedEnd === -1) {
        const valueEnd = findUnterminatedQuotedValueEnd(value, valueStart + 1, separator === ":" ? ",}]" : "&#,}]\n");
        redacted += REDACTED;
        readIndex = valueEnd;
      } else if (separator === ":") {
        redacted += `${valueQuote}${REDACTED}${valueQuote}`;
        readIndex = quotedEnd + 1;
      } else {
        redacted += REDACTED;
        readIndex = quotedEnd + 1;
      }
      continue;
    }

    const valueEnd = findUnquotedValueEnd(value, valueStart, separator === ":" ? ",}][\"'" : "&#");
    redacted += REDACTED;
    readIndex = valueEnd;
  }

  return redacted + value.slice(readIndex);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function redactString(value: string) {
  return redactSecretAssignments(value)
    .replace(BEARER_PATTERN, "Bearer [redacted]")
    .replace(JWT_PATTERN, REDACTED)
    .replace(URL_SECRET_PARAM_PATTERN, `$1${REDACTED}`);
}

function truncateString(value: string, maxLength: number) {
  const suffix = "...[truncated]";
  return value.length > maxLength ? `${value.slice(0, Math.max(0, maxLength - suffix.length))}${suffix}` : value;
}

export function redactLogValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redactString(value);
  }

  if (value == null || typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_REDACTION_DEPTH) {
    return "[max-depth]";
  }

  if (value instanceof Date) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message),
      stack: value.stack ? redactString(value.stack) : undefined,
      cause: redactLogValue(value.cause, depth + 1),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, MAX_REDACTION_ARRAY_LENGTH).map((entry) => redactLogValue(entry, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactLogValue(entry, depth + 1),
      ]),
    );
  }

  return redactString(String(value));
}

export function redactSafeContext(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    return truncateString(redactString(value), MAX_SAFE_CONTEXT_STRING_LENGTH);
  }

  if (value == null || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }

  if (typeof value === "bigint" || typeof value === "symbol" || typeof value === "function") {
    return truncateString(redactString(String(value)), MAX_SAFE_CONTEXT_STRING_LENGTH);
  }

  if (depth >= MAX_SAFE_CONTEXT_DEPTH) {
    return "[max-depth]";
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: truncateString(redactString(value.name), MAX_SAFE_CONTEXT_STRING_LENGTH),
      message: truncateString(redactString(value.message), MAX_SAFE_CONTEXT_STRING_LENGTH),
      stack: value.stack ? truncateString(redactString(value.stack), MAX_SAFE_CONTEXT_STRING_LENGTH) : undefined,
      cause: redactSafeContext(value.cause, depth + 1, seen),
    };
  }

  if (seen.has(value)) {
    return "[circular]";
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.slice(0, MAX_SAFE_CONTEXT_ARRAY_LENGTH).map((entry) => redactSafeContext(entry, depth + 1, seen));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, MAX_SAFE_CONTEXT_KEYS)
        .map(([key, entry]) => [
          key,
          SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactSafeContext(entry, depth + 1, seen),
        ]),
    );
  }

  return truncateString(redactString(String(value)), MAX_SAFE_CONTEXT_STRING_LENGTH);
}
