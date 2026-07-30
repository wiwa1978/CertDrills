import { Container } from "@/components/ui/container";
import { CertDrillQuestionEditorPage } from "@/modules/certdrill/admin-page";

export default async function EditCertDrillQuestionPage({
  params,
}: {
  params: Promise<{ certificationId: string; questionId: string }>;
}) {
  const { certificationId, questionId } = await params;

  return (
    <Container className="py-6">
      <CertDrillQuestionEditorPage certificationId={certificationId} questionId={questionId} />
    </Container>
  );
}
