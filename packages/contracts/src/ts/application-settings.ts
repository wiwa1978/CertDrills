export { runtimeApplicationSettingKeys, runtimeApplicationSettingKeySchema } from "../wire/application-settings/common";
import { runtimeApplicationSettingKeys } from "../wire/application-settings/common";

export type RuntimeApplicationSettingKey = (typeof runtimeApplicationSettingKeys)[number];
export type RuntimeApplicationSettingValue = number;

export type RuntimeApplicationSettingDefinition = {
  key: RuntimeApplicationSettingKey;
  labelKey: string;
  descriptionKey: string;
  categoryKey: string;
  valueType: "number";
  sourceValue: RuntimeApplicationSettingValue;
  min: number;
  max: number;
};

export const runtimeApplicationSettingDefinitions = [
  {
    key: "ui.notificationsDropdownLimit",
    labelKey: "notificationsDropdownLimit.label",
    descriptionKey: "notificationsDropdownLimit.description",
    categoryKey: "categories.ui",
    valueType: "number",
    sourceValue: 5,
    min: 1,
    max: 50,
  },
  {
    key: "ui.notificationsPollingIntervalMs",
    labelKey: "notificationsPollingIntervalMs.label",
    descriptionKey: "notificationsPollingIntervalMs.description",
    categoryKey: "categories.ui",
    valueType: "number",
    sourceValue: 30_000,
    min: 0,
    max: 300_000,
  },
  {
    key: "ui.deleteAccountCountdownSeconds",
    labelKey: "deleteAccountCountdownSeconds.label",
    descriptionKey: "deleteAccountCountdownSeconds.description",
    categoryKey: "categories.ui",
    valueType: "number",
    sourceValue: 10,
    min: 0,
    max: 60,
  },
] as const satisfies RuntimeApplicationSettingDefinition[];

const runtimeApplicationSettingDefinitionsByKey = new Map(
  runtimeApplicationSettingDefinitions.map((definition) => [definition.key, definition])
);

export function isRuntimeApplicationSettingKey(value: string): value is RuntimeApplicationSettingKey {
  return runtimeApplicationSettingDefinitionsByKey.has(value as RuntimeApplicationSettingKey);
}

export function getRuntimeApplicationSettingDefinition(key: RuntimeApplicationSettingKey) {
  const definition = runtimeApplicationSettingDefinitionsByKey.get(key);

  if (!definition) {
    throw new Error(`Unknown runtime application setting: ${key}`);
  }

  return definition;
}

export function validateRuntimeApplicationSettingValue(
  key: RuntimeApplicationSettingKey,
  value: unknown
): { success: true; value: RuntimeApplicationSettingValue } | { success: false; error: string } {
  const definition = getRuntimeApplicationSettingDefinition(key);

  if (typeof value !== "number" || !Number.isInteger(value)) {
    return { success: false, error: "Value must be an integer." };
  }

  if (value < definition.min || value > definition.max) {
    return { success: false, error: `Value must be between ${definition.min} and ${definition.max}.` };
  }

  return { success: true, value };
}

export type RuntimeApplicationSettings = Partial<Record<RuntimeApplicationSettingKey, RuntimeApplicationSettingValue>>;

export type RuntimeApplicationSettingsPayload = {
  definitions: RuntimeApplicationSettingDefinition[];
  overrides: RuntimeApplicationSettings;
  effective: Record<RuntimeApplicationSettingKey, RuntimeApplicationSettingValue>;
};

export function mergeRuntimeApplicationSettings(overrides: RuntimeApplicationSettings) {
  return runtimeApplicationSettingDefinitions.reduce(
    (effective, definition) => ({
      ...effective,
      [definition.key]: overrides[definition.key] ?? definition.sourceValue,
    }),
    {} as Record<RuntimeApplicationSettingKey, RuntimeApplicationSettingValue>
  );
}
