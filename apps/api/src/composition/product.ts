import type { PlatformApiModule } from "@platform/module-contracts";

import type { Inngest } from "inngest";
import type { PlatformDb } from "@platform/platform-db";

import { createCertDrillApiModule, type CertDrillFoundryConfig } from "../product/certdrill/module";
import { productDefinition } from "./product-definition";

export { productDefinition };


type ProductApiModuleDeps = {
  db: PlatformDb;
  capabilityService: {
    resolveForUser(userId: string): Promise<readonly string[]>;
  };
  inngest: Inngest;
  certdrillFoundry?: CertDrillFoundryConfig;
};

export function createProductApiModules(deps: ProductApiModuleDeps): readonly PlatformApiModule[] {
  return [
    {
      id: "product-billing",
      capabilities: productDefinition.capabilities,
      resolveCapabilities: deps.capabilityService.resolveForUser,
    },
    createCertDrillApiModule({ db: deps.db, inngest: deps.inngest, foundry: deps.certdrillFoundry }),
  ];
}
