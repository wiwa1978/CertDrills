export type CertificationAccessStatus = "not_purchased" | "purchased";

export class CertDrillAccessDeniedError extends Error {
  constructor() {
    super("Certification has not been purchased");
    this.name = "CertDrillAccessDeniedError";
  }
}

export interface CertificationAccessProvider {
  getAccessForUser(userId: string, certificationIds: string[]): Promise<Map<string, CertificationAccessStatus>>;
  assertCanStartAttempt(userId: string, certificationId: string): Promise<void>;
}

export function createAllPurchasedCertificationAccessProvider(): CertificationAccessProvider {
  return {
    async getAccessForUser(_userId, certificationIds) {
      return new Map(certificationIds.map((id) => [id, "purchased" as const]));
    },
    async assertCanStartAttempt() {
      return undefined;
    },
  };
}

export function createStaticCertificationAccessProvider(statuses: Record<string, CertificationAccessStatus>): CertificationAccessProvider {
  return {
    async getAccessForUser(_userId, certificationIds) {
      return new Map(certificationIds.map((id) => [id, statuses[id] ?? "not_purchased"]));
    },
    async assertCanStartAttempt(_userId, certificationId) {
      if ((statuses[certificationId] ?? "not_purchased") !== "purchased") {
        throw new CertDrillAccessDeniedError();
      }
    },
  };
}
