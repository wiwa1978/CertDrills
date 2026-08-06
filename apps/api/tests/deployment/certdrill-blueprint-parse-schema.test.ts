import { getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import type { CertDrillBlueprintConfidence, CertDrillBlueprintParseStatus } from "@platform/platform-db";
import * as platformDb from "@platform/platform-db";

type Assert<T extends true> = T;
type IsEqual<Left, Right> = (
  <Value>() => Value extends Left ? 1 : 2
) extends (<Value>() => Value extends Right ? 1 : 2) ? true : false;

const _blueprintParseStatusType: Assert<
  IsEqual<CertDrillBlueprintParseStatus, "pending" | "running" | "completed" | "failed">
> = true;
const _blueprintConfidenceType: Assert<IsEqual<CertDrillBlueprintConfidence, "high" | "medium" | "low">> = true;

function getBlueprintParseRunsTable() {
  const table = platformDb.certdrillBlueprintParseRuns;

  expect(table).toBeDefined();

  if (!table) {
    throw new Error("Expected certdrillBlueprintParseRuns export to exist.");
  }

  return table;
}

describe("CertDrill blueprint parse run schema contract", () => {
  it("exports the blueprint parse runs table with the expected columns, foreign keys, and indexes", () => {
    const table = getBlueprintParseRunsTable();
    const config = getTableConfig(table);
    const columns = Object.fromEntries(config.columns.map((column) => [column.name, column]));
    const foreignKeys = config.foreignKeys.map((foreignKey) => {
      const reference = foreignKey.reference();

      return {
        columns: reference.columns.map((column) => column.name),
        foreignColumns: reference.foreignColumns.map((column) => column.name),
        foreignTable: getTableName(reference.foreignTable),
        onDelete: foreignKey.onDelete,
      };
    });
    const indexes = config.indexes.map((index) => ({
      columns: index.config.columns.map((column) => column.name),
      name: index.config.name,
    }));

    expect(getTableName(table)).toBe("certdrill_blueprint_parse_runs");
    expect(Object.keys(columns)).toEqual([
      "id",
      "certification_id",
      "resource_id",
      "status",
      "provider",
      "model",
      "content_checksum",
      "proposal_json",
      "raw_output",
      "confidence",
      "warnings_json",
      "error_message",
      "started_at",
      "completed_at",
      "created_at",
      "updated_at",
    ]);

    expect(columns.id).toMatchObject({ columnType: "PgUUID", hasDefault: true, notNull: true, primary: true });
    expect(columns.certification_id).toMatchObject({ columnType: "PgUUID", hasDefault: false, notNull: true });
    expect(columns.resource_id).toMatchObject({ columnType: "PgUUID", hasDefault: false, notNull: true });
    expect(columns.status).toMatchObject({
      columnType: "PgText",
      default: "pending",
      hasDefault: true,
      notNull: true,
    });
    expect(columns.provider).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: true });
    expect(columns.model).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: true });
    expect(columns.content_checksum).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: true });
    expect(columns.proposal_json).toMatchObject({ columnType: "PgJsonb", hasDefault: false, notNull: false });
    expect(columns.raw_output).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: false });
    expect(columns.confidence).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: false });
    expect(columns.warnings_json).toMatchObject({ columnType: "PgJsonb", hasDefault: true, notNull: true });
    expect(columns.warnings_json?.default?.queryChunks?.[0]?.value?.[0]).toBe("'[]'::jsonb");
    expect(columns.error_message).toMatchObject({ columnType: "PgText", hasDefault: false, notNull: false });
    expect(columns.started_at).toMatchObject({ columnType: "PgTimestamp", hasDefault: false, notNull: false });
    expect(columns.completed_at).toMatchObject({ columnType: "PgTimestamp", hasDefault: false, notNull: false });
    expect(columns.created_at).toMatchObject({ columnType: "PgTimestamp", hasDefault: true, notNull: true });
    expect(columns.updated_at).toMatchObject({ columnType: "PgTimestamp", hasDefault: true, notNull: true });
    expect(typeof columns.updated_at?.onUpdateFn).toBe("function");

    expect(foreignKeys).toEqual([
      {
        columns: ["certification_id"],
        foreignColumns: ["id"],
        foreignTable: "certdrill_certifications",
        onDelete: "cascade",
      },
      {
        columns: ["resource_id"],
        foreignColumns: ["id"],
        foreignTable: "certdrill_learn_resources",
        onDelete: "cascade",
      },
    ]);

    expect(indexes).toEqual([
      {
        columns: ["certification_id"],
        name: "certdrill_blueprint_parse_runs_certification_id_idx",
      },
      {
        columns: ["resource_id"],
        name: "certdrill_blueprint_parse_runs_resource_id_idx",
      },
      {
        columns: ["status"],
        name: "certdrill_blueprint_parse_runs_status_idx",
      },
    ]);
  });
});
