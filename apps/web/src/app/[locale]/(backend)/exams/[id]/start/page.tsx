import { notFound } from "next/navigation";

import { getCertDrillCategoriesServer, getCertDrillCertificationsServer } from "@/lib/api/certdrill.server";
import { StartPage } from "@/modules/certdrill/start-page";

export default async function StartExamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const certifications = await getCertDrillCertificationsServer();
  const certification = certifications.find((item) => item.id === id);

  if (!certification) {
    notFound();
  }

  const categories = await getCertDrillCategoriesServer(id);

  return <StartPage certification={certification} categories={categories} />;
}
