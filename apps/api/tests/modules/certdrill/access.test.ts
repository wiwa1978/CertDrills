import { describe, expect, it } from "vitest";

import {
  CertDrillAccessDeniedError,
  createAllPurchasedCertificationAccessProvider,
  createStaticCertificationAccessProvider,
} from "../../../src/modules/certdrill/access";

describe("CertDrill access", () => {
  it("treats every requested certification as purchased by default", async () => {
    const provider = createAllPurchasedCertificationAccessProvider();

    await expect(provider.getAccessForUser("user-1", ["cert-1", "cert-2"])).resolves.toEqual(new Map([
      ["cert-1", "purchased"],
      ["cert-2", "purchased"],
    ]));
    await expect(provider.assertCanStartAttempt("user-1", "cert-1")).resolves.toBeUndefined();
  });

  it("uses static statuses and denies missing or not purchased certifications", async () => {
    const provider = createStaticCertificationAccessProvider({ "cert-1": "purchased" });

    await expect(provider.getAccessForUser("user-1", ["cert-1", "cert-2"])).resolves.toEqual(new Map([
      ["cert-1", "purchased"],
      ["cert-2", "not_purchased"],
    ]));
    await expect(provider.assertCanStartAttempt("user-1", "cert-2")).rejects.toThrow(CertDrillAccessDeniedError);
    await expect(provider.assertCanStartAttempt("user-1", "cert-2")).rejects.toThrow("Certification has not been purchased");
  });
});
