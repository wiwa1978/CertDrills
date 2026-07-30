import { CatalogPage } from "@/modules/certdrill/catalog-page";
import {
  getCertDrillAttemptsServer,
  getCertDrillCertificationsServer,
  getCertDrillReadinessServer,
  getMyCertDrillCertificationsServer,
} from "@/lib/api/certdrill.server";

export default async function ExamsPage() {
  const [allCertifications, myCertifications, readiness, attempts] = await Promise.all([
    getCertDrillCertificationsServer(),
    getMyCertDrillCertificationsServer(),
    getCertDrillReadinessServer(),
    getCertDrillAttemptsServer(),
  ]);

  return <CatalogPage allCertifications={allCertifications} myCertifications={myCertifications} attempts={attempts} readiness={readiness} />;
}
