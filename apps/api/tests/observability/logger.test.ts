import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { redactString } from "../../src/observability/redaction";

const tmpDirs: string[] = [];

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("logger.readLogEntries", () => {
  it("reads bounded bytes from the end of the log file", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "2026-04-27.jsonl");
    const lines = Array.from({ length: 1000 }, (_, index) => JSON.stringify({ message: `line-${index}` })).join("\n") + "\n";
    fs.writeFileSync(file, lines, "utf8");
    const readFileSpy = vi.spyOn(fs, "readFileSync");

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    const result = logger.readLogEntries({ stream: "app", file: "2026-04-27.jsonl", limit: 5 });

    expect(result.entries).toHaveLength(5);
    expect(result.entries[0]?.message).toBe("line-999");
    expect(readFileSpy).not.toHaveBeenCalled();
  });
});

describe("redactString", () => {
  it("redacts quoted multi-word colon-style secret values", () => {
    expect(redactString('password: "correct horse battery staple"')).toBe('password: "[redacted]"');
    expect(redactString("client_secret: 'single word secret'")).toBe("client_secret: '[redacted]'");
  });

  it("redacts quoted multiline secret values", () => {
    expect(redactString('password = "line1\nline2"')).toBe("password = [redacted]");
    expect(redactString("api_key = 'line1\nline2'")).toBe("api_key = [redacted]");
    expect(redactString('password: "line1\nline2"')).toBe('password: "[redacted]"');
    expect(redactString("client_secret: 'line1\nline2'")).toBe("client_secret: '[redacted]'");
  });

  it("redacts quoted secret values containing escaped delimiters", () => {
    expect(redactString('password = "abc\\"def"')).toBe("password = [redacted]");
    expect(redactString("api_key = 'abc\\'def'")).toBe("api_key = [redacted]");
    expect(redactString('password: "abc\\"def"')).toBe('password: "[redacted]"');
    expect(redactString("client_secret: 'abc\\'def'")).toBe("client_secret: '[redacted]'");
    expect(redactString('{"password":"abc\\"def"}')).toBe('{"password":"[redacted]"}');
  });

  it("redacts quoted secret values containing structural delimiters", () => {
    expect(redactString('password: "abc}def"')).toBe('password: "[redacted]"');
    expect(redactString("client_secret = 'abc}def'")).toBe("client_secret = [redacted]");
    expect(redactString('{"password":"abc}def"}')).toBe('{"password":"[redacted]"}');
    expect(redactString(String.raw`\"password\":\"abc}def\"`)).toBe(String.raw`\"password\":\"[redacted]\"`);
  });

  it("redacts serialized escaped-quote secret values without leaking suffix tokens", () => {
    expect(redactString(String.raw`\"password\":\"abc\\\"def\"`)).toBe(String.raw`\"password\":\"[redacted]\"`);
    expect(redactString(String.raw`\'client_secret\':\'abc\\\'def\'`)).toBe(String.raw`\'client_secret\':\'[redacted]\'`);
  });

  it("redacts unterminated quoted secret values without leaking suffix tokens", () => {
    expect(redactString('password = "first second')).toBe("password = [redacted]");
    expect(redactString('password: "first second')).toBe("password: [redacted]");
    expect(redactString('{"password":"first second}')).toBe('{"password":[redacted]}');
    expect(redactString('"client_secret" : "first second')).toBe('"client_secret" : [redacted]');
  });

  it("redacts quoted sensitive keys with equals assignments", () => {
    expect(redactString('"password" = "secret value"')).toBe('"password" = [redacted]');
    expect(redactString('"client_secret" = bare-secret')).toBe('"client_secret" = [redacted]');
    expect(redactString('\\"password\\"=\\"secret value\\"')).toBe('\\"password\\"=[redacted]');
  });

  it("redacts unquoted multi-token secret assignment values", () => {
    expect(redactString("Authorization: Basic abc123")).toBe("Authorization: [redacted]");
    expect(redactString("password: correct horse battery")).toBe("password: [redacted]");
    expect(redactString("client_secret = correct horse battery")).toBe("client_secret = [redacted]");
    expect(redactString("password: correct horse token: plain-secret")).toBe("password: [redacted]token: [redacted]");
  });

  it("keeps redacting existing colon-style secret variants", () => {
    expect(redactString('"token": abc123')).toBe('"token": [redacted]');
    expect(redactString('"client_secret" : bare-secret')).toBe('"client_secret" : [redacted]');
    expect(redactString("'client_secret': 'single-secret'")).toBe("'client_secret': '[redacted]'");
  });
});

describe("logger metadata serialization", () => {
  it("redacts token-like key-value pairs in messages and nested metadata strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: "accessToken=abc123 refreshToken=def456",
        nested: { detail: "lowercase accesstoken=ghi789 refreshtoken=jkl012" },
      },
      "client sent accessToken=abc123 and refreshToken=def456",
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("accessToken=[redacted]");
    expect(output).toContain("refreshToken=[redacted]");
    expect(output).toContain("accesstoken=[redacted]");
    expect(output).toContain("refreshtoken=[redacted]");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("def456");
    expect(output).not.toContain("ghi789");
    expect(output).not.toContain("jkl012");
  });

  it("redacts JSON-like and colon-style secrets in messages and nested metadata strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: '{"password":"json-secret","accessToken": "access-secret", "client_secret" : bare-secret}',
        nested: {
          detail:
            "password: \"correct horse battery staple\" refreshToken: refresh-secret token: plain-secret client_secret: 'single word secret' 'client_secret': 'single-secret'",
        },
      },
      'client sent {"token": abc123,"password": "secret"}',
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\"token\\": [redacted]');
    expect(output).toContain('\\"password\\": \\"[redacted]\\"');
    expect(output).toContain('\\"accessToken\\": \\"[redacted]\\"');
    expect(output).toContain('\\"client_secret\\" : [redacted]');
    expect(output).toContain("'client_secret': '[redacted]'");
    expect(output).toContain("refreshToken: [redacted]");
    expect(output).toContain("token: [redacted]");
    expect(output).toContain('password: \\\"[redacted]\\\"');
    expect(output).toContain("client_secret: '[redacted]'");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain('"secret"');
    expect(output).not.toContain("json-secret");
    expect(output).not.toContain("access-secret");
    expect(output).not.toContain("bare-secret");
    expect(output).not.toContain("refresh-secret");
    expect(output).not.toContain("plain-secret");
    expect(output).not.toContain("correct horse battery staple");
    expect(output).not.toContain("horse battery staple");
    expect(output).not.toContain("single word secret");
    expect(output).not.toContain("word secret");
    expect(output).not.toContain("single-secret");
  });

  it("redacts whitespace-tolerant secret assignments in messages and nested metadata strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: 'nested oauth_client_secret=oauth-secret password = "correct horse battery staple" {"clientSecret":"json-secret"}',
        nested: { detail: "clientSecret = camel-secret clientSecret: colon-secret client_secret = 'multi word secret'" },
      },
      "client sent client_secret = query-secret",
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("client_secret = [redacted]");
    expect(output).toContain("oauth_client_secret=[redacted]");
    expect(output).toContain("password = [redacted]");
    expect(output).toContain("clientSecret = [redacted]");
    expect(output).toContain("client_secret = [redacted]");
    expect(output).toContain("clientSecret: [redacted]");
    expect(output).toContain('\\"clientSecret\\":\\"[redacted]\\"');
    expect(output).not.toContain("query-secret");
    expect(output).not.toContain("oauth-secret");
    expect(output).not.toContain("correct horse battery staple");
    expect(output).not.toContain("horse battery staple");
    expect(output).not.toContain("camel-secret");
    expect(output).not.toContain("colon-secret");
    expect(output).not.toContain("multi word secret");
    expect(output).not.toContain("word secret");
    expect(output).not.toContain("json-secret");
  });

  it("redacts escaped delimiter secret values in messages and nested metadata strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: '{"password":"abc\\"def"}',
        nested: { detail: "client_secret: 'abc\\'def'" },
      },
      'client sent password: "abc\\"def"',
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('password: \\"[redacted]\\"');
    expect(output).toContain('\\"password\\":\\"[redacted]\\"');
    expect(output).toContain("client_secret: '[redacted]'");
    expect(output).not.toContain("abc");
    expect(output).not.toContain("def");
  });

  it("redacts quoted metadata secrets containing structural delimiters", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: 'password: "abc}def" {"password":"abc}def"}',
        nested: { detail: "client_secret = 'abc}def'" },
      },
      String.raw`client sent password: "abc}def" \"password\":\"abc}def\"`,
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('password: \\"[redacted]\\"');
    expect(output).toContain('\\"password\\":\\"[redacted]\\"');
    expect(output).toContain('\\\\\\"password\\\\\\":\\\\\\"[redacted]\\\\\\"');
    expect(output).toContain("client_secret = [redacted]");
    expect(output).not.toContain("abc");
    expect(output).not.toContain("def");
  });

  it("redacts serialized escaped-quote metadata secrets without leaking suffix tokens", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: String.raw`\"password\":\"abc\\\"def\"`,
        nested: { detail: String.raw`\'client_secret\':\'abc\\\'def\'` },
      },
      String.raw`client sent \"password\":\"abc\\\"def\"`,
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\\\\\"password\\\\\\":\\\\\\"[redacted]\\\\\\"');
    expect(output).toContain("\\\\'client_secret\\\\':\\\\'[redacted]\\\\'");
    expect(output).not.toContain("abc");
    expect(output).not.toContain("def");
  });

  it("redacts unterminated quoted metadata secrets without leaking suffix tokens", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: 'password = "first second',
        nested: { detail: 'password: "first second' },
      },
      'client sent {"password":"first second}',
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("password = [redacted]");
    expect(output).toContain("password: [redacted]");
    expect(output).toContain('\\"password\\":[redacted]');
    expect(output).not.toContain("first");
    expect(output).not.toContain("second");
  });

  it("redacts quoted equals metadata secrets without leaking values", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: '"password" = "secret value"',
        nested: { detail: '"client_secret" = bare-secret' },
      },
      'client sent "password"="secret value"',
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain('\\"password\\" = [redacted]');
    expect(output).toContain('\\"client_secret\\" = [redacted]');
    expect(output).toContain('\\"password\\"=[redacted]');
    expect(output).not.toContain("secret value");
    expect(output).not.toContain("bare-secret");
  });

  it("redacts unquoted multi-token metadata secrets without leaking values", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn(
      {
        safe: "Authorization: Basic abc123",
        nested: { detail: "client_secret = correct horse battery token: plain-secret" },
      },
      "client sent password: correct horse battery",
    );

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("Authorization: [redacted]");
    expect(output).toContain("client_secret = [redacted]");
    expect(output).toContain("token: [redacted]");
    expect(output).toContain("password: [redacted]");
    expect(output).not.toContain("Basic abc123");
    expect(output).not.toContain("correct horse");
    expect(output).not.toContain("horse battery");
    expect(output).not.toContain("plain-secret");
  });

  it("redacts long quoted metadata secrets before serialization truncates strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secretRemainder = "S".repeat(1100);

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn({ detail: `password = "first ${secretRemainder}"` }, "metadata test");

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("password = [redacted]");
    expect(output).not.toContain("first");
    expect(output).not.toContain("SSSSSSSSSS");
    expect(output.length).toBeLessThan(3000);
  });

  it("redacts long quoted symbol metadata secrets before serialization truncates strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secretRemainder = "S".repeat(1100);

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn({ symbol: Symbol(`password = "first ${secretRemainder}"`) }, "metadata test");

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("password = [redacted]");
    expect(output).not.toContain("first");
    expect(output).not.toContain("SSSSSSSSSS");
    expect(output.length).toBeLessThan(3000);
  });

  it("redacts long quoted error stack secrets before serialization truncates strings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secretRemainder = "S".repeat(1100);
    const error = new Error("safe message");
    error.stack = `Error: password = "first ${secretRemainder}"`;

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    logger.warn({ error }, "metadata test");

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("password = [redacted]");
    expect(output).not.toContain("first");
    expect(output).not.toContain("SSSSSSSSSS");
    expect(output.length).toBeLessThan(3000);
  });

  it("tolerates circular deep unusual metadata while redacting and bounding output", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "api-logs-"));
    tmpDirs.push(dir);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.doMock("../../src/env", () => ({ env: { NODE_ENV: "test", LOG_FILE_PATH: dir } }));
    const { logger } = await import("../../src/observability/logger");

    const metadata: Record<string, unknown> = {
      token: "secret-token",
      bigint: 123n,
      symbol: Symbol("secret-symbol"),
      fn: () => "secret",
      longValue: "x".repeat(10_000),
      deep: { level1: { level2: { level3: { level4: { level5: "too-deep" } } } } },
    };
    metadata.self = metadata;

    expect(() => logger.warn(metadata, "metadata test")).not.toThrow();

    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("[redacted]");
    expect(output).toContain("[circular]");
    expect(output).toContain("[max-depth]");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("too-deep");
    expect(output.length).toBeLessThan(3000);
  });
});
