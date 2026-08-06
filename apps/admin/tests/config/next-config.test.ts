import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import nextConfig from "../../next.config";
import {
  MAX_QUESTION_IMPORT_BYTES,
  MAX_QUESTION_IMPORT_TRANSPORT_BYTES,
} from "@/modules/certdrill/question-import-types";

const nextConfigSource = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");

// Next parses server action size limits with the `bytes` package, which uses binary multipliers.
const sizeSuffixBytes: Record<string, number> = {
  b: 1,
  kb: 1024,
  mb: 1024 * 1024,
  gb: 1024 * 1024 * 1024,
};

function parseSizeLimit(value: unknown) {
  if (typeof value === "number") return value;
  expect(typeof value).toBe("string");

  const match = /^(\d+(?:\.\d+)?)(b|kb|mb|gb)$/.exec(String(value));
  expect(match, `unsupported bodySizeLimit value: ${String(value)}`).not.toBeNull();

  const [, amount, suffix] = match as RegExpExecArray;
  return Number(amount) * sizeSuffixBytes[suffix];
}

describe("admin next config server actions", () => {
  it("configures a server action body size limit for question imports", () => {
    const serverActions = (nextConfig as { experimental?: { serverActions?: { bodySizeLimit?: unknown } } })
      .experimental?.serverActions;

    expect(serverActions).toBeDefined();
    expect(serverActions?.bodySizeLimit).toBe("6mb");
  });

  it("keeps the limit above the question import document cap plus envelope overhead", () => {
    const serverActions = (nextConfig as { experimental?: { serverActions?: { bodySizeLimit?: unknown } } })
      .experimental?.serverActions;

    expect(parseSizeLimit(serverActions?.bodySizeLimit)).toBeGreaterThanOrEqual(MAX_QUESTION_IMPORT_TRANSPORT_BYTES);
    expect(MAX_QUESTION_IMPORT_TRANSPORT_BYTES).toBeGreaterThan(MAX_QUESTION_IMPORT_BYTES);
  });

  it("documents why the default 1 MB server action limit is raised", () => {
    expect(nextConfigSource).toContain("serverActions");
    expect(nextConfigSource).toContain('bodySizeLimit: "6mb"');
  });
});
