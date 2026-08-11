import type { PrivacyContribution } from "@platform/module-contracts";

export function createProductLifecycleCoordinator() {
  let privacyContributions: ReadonlyMap<string, PrivacyContribution> = new Map();

  return {
    setPrivacyContributions(contributions: ReadonlyMap<string, PrivacyContribution>) {
      privacyContributions = contributions;
    },
    async exportUserData(userId: string) {
      const entries = await Promise.all([...privacyContributions].map(async ([moduleId, contribution]) => (
        [moduleId, await contribution.exportUserData(userId)] as const
      )));
      return Object.fromEntries(entries);
    },
    async deleteUserData(userId: string) {
      await Promise.all([...privacyContributions.values()].map((contribution) => (
        contribution.deleteUserData?.(userId)
      )));
    },
  };
}

export type ProductLifecycleCoordinator = ReturnType<typeof createProductLifecycleCoordinator>;
