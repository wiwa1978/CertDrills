import type { PlatformWebContribution } from "@platform/module-contracts";

export const productAdminContributions: readonly PlatformWebContribution[] = [
  {
    id: "certdrill-admin",
    navigation: [
      { id: "certdrill-admin-home", href: "/admin/certdrill", labelKey: "certdrill.nav.certifications", iconKey: "file", order: 20 },
      { id: "certdrill-admin-questions", href: "/admin/questions", labelKey: "certdrill.nav.questions", iconKey: "file", order: 21 },
    ],
    messages: {
      en: { certdrill: { nav: { certifications: "CertDrill", questions: "Questions" } } },
      nl: { certdrill: { nav: { certifications: "CertDrill", questions: "Vragen" } } },
      fr: { certdrill: { nav: { certifications: "CertDrill", questions: "Questions" } } },
    },
  },
];
