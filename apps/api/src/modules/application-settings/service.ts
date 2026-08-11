import { eq } from "drizzle-orm";

import { applicationSettings } from "@platform/platform-db";
import type { PlatformDb } from "@platform/platform-db";
import {
  getRuntimeApplicationSettingDefinition,
  isRuntimeApplicationSettingKey,
  mergeRuntimeApplicationSettings,
  runtimeApplicationSettingDefinitions,
  validateRuntimeApplicationSettingValue,
  type RuntimeApplicationSettingKey,
  type RuntimeApplicationSettings,
} from "@platform/contracts/ts";

type ApplicationSettingsServiceDeps = {
  db: PlatformDb;
};

export function createApplicationSettingsService(deps: ApplicationSettingsServiceDeps) {
  async function getRuntimeSettings(): Promise<RuntimeApplicationSettings> {
    const rows = await deps.db
      .select({ key: applicationSettings.key, value: applicationSettings.value })
      .from(applicationSettings);

    const settings: RuntimeApplicationSettings = {};

    for (const row of rows) {
      if (!isRuntimeApplicationSettingKey(row.key)) {
        continue;
      }

      const validation = validateRuntimeApplicationSettingValue(row.key, row.value);
      if (validation.success) {
        const key: RuntimeApplicationSettingKey = row.key;
        settings[key] = validation.value;
      }
    }

    return settings;
  }

  async function getRuntimeSettingsPayload() {
    const overrides = await getRuntimeSettings();

    return {
      definitions: [...runtimeApplicationSettingDefinitions],
      overrides,
      effective: mergeRuntimeApplicationSettings(overrides),
    };
  }

  async function updateRuntimeSetting(input: { key: RuntimeApplicationSettingKey; value: unknown; updatedByUserId: string }) {
    const validation = validateRuntimeApplicationSettingValue(input.key, input.value);
    if (!validation.success) {
      return { success: false as const, error: validation.error };
    }

    const definition = getRuntimeApplicationSettingDefinition(input.key);
    const updatedAt = new Date();

    await deps.db
      .insert(applicationSettings)
      .values({
        key: input.key,
        value: validation.value,
        valueType: definition.valueType,
        description: definition.descriptionKey,
        updatedByUserId: input.updatedByUserId,
        updatedAt,
      })
      .onConflictDoUpdate({
        target: applicationSettings.key,
        set: {
          value: validation.value,
          valueType: definition.valueType,
          description: definition.descriptionKey,
          updatedByUserId: input.updatedByUserId,
          updatedAt,
        },
      });

    return { success: true as const };
  }

  async function resetRuntimeSetting(key: RuntimeApplicationSettingKey) {
    await deps.db.delete(applicationSettings).where(eq(applicationSettings.key, key));
    return { success: true as const };
  }

  return {
    getRuntimeSettings,
    getRuntimeSettingsPayload,
    updateRuntimeSetting,
    resetRuntimeSetting,
  };
}
