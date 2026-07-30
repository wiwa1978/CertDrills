import { Container } from "@/components/ui/container";
import { CertDrillQuestionEditorPage } from "@/modules/certdrill/admin-page";

export default async function NewCertDrillQuestionPage({
  params,
}: {
  params: Promise<{ certificationId: string }>;
}) {
  const { certificationId } = await params;

  return (
    <Container className="py-6">
      <CertDrillQuestionEditorPage certificationId={certificationId} />
    </Container>
  );
}
