import type { PlatformWebContribution } from "@platform/module-contracts";

export const productWebContributions: readonly PlatformWebContribution[] = [
  {
    id: "certdrill",
    navigation: [
      { id: "certdrill-exams", href: "/exams", labelKey: "certdrill.nav.exams", iconKey: "file", order: 20 },
      { id: "certdrill-attempts", href: "/profile/attempts", labelKey: "certdrill.nav.attempts", iconKey: "file", order: 21 },
    ],
    messages: {
      en: { certdrill: { nav: { exams: "Exams", attempts: "Attempt history" } } },
      nl: { certdrill: { nav: { exams: "Examens", attempts: "Poginggeschiedenis" } } },
      fr: { certdrill: { nav: { exams: "Examens", attempts: "Historique des tentatives" } } },
    },
  },
];
