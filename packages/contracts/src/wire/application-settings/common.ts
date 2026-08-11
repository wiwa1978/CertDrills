import { z } from "zod";

export const runtimeApplicationSettingKeys = [
  "ui.notificationsDropdownLimit",
  "ui.notificationsPollingIntervalMs",
  "ui.deleteAccountCountdownSeconds",
] as const;

export const runtimeApplicationSettingKeySchema = z.enum(runtimeApplicationSettingKeys);
