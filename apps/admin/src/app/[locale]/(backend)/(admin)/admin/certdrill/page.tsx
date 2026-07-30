import { Container } from "@/components/ui/container";
import { getCertDrillCertificationsServer } from "@/lib/api/certdrill.server";
import { CertDrillAdminOverviewPage } from "@/modules/certdrill/admin-page";

export default async function AdminCertDrillPage() {
  const certifications = await getCertDrillCertificationsServer();

  return (
    <Container className="py-6">
      <CertDrillAdminOverviewPage certifications={certifications} />
    </Container>
  );
}
