import { createMeApi } from "@platform/frontend-shared/me-api";
import type { ApplicationConfig } from "@platform/contracts";

import { serverApiRequest } from "./client.server";

const meApi = createMeApi(serverApiRequest);

export async function getMyApplicationConfigServer() {
  const result = await meApi.getApplicationConfig() as { success: boolean; data: ApplicationConfig };
  return result.data;
}
