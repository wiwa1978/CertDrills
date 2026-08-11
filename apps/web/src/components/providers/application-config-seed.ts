import type { ApplicationConfig } from "@platform/contracts";

export type ApplicationConfigSnapshot = {
  contentKey: string | null;
  dataUpdatedAt: number;
};

export function createApplicationConfigSnapshot(data: ApplicationConfig | undefined, dataUpdatedAt = 0): ApplicationConfigSnapshot {
  return {
    contentKey: data ? JSON.stringify(data) : null,
    dataUpdatedAt,
  };
}

export function matchesApplicationConfigSnapshot(
  snapshot: ApplicationConfigSnapshot,
  data: ApplicationConfig | undefined,
  dataUpdatedAt = 0,
) {
  return snapshot.contentKey === (data ? JSON.stringify(data) : null)
    && snapshot.dataUpdatedAt === dataUpdatedAt;
}
