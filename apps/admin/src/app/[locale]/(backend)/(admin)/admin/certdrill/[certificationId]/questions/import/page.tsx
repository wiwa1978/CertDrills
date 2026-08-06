import { Container } from "@/components/ui/container";
import { QuestionImportPage } from "@/modules/certdrill/question-import-page";

export default async function ImportCertDrillQuestionsPage({
  params,
}: {
  params: Promise<{ certificationId: string }>;
}) {
  const { certificationId } = await params;

  return (
    <Container className="py-6">
      <QuestionImportPage certificationId={certificationId} />
    </Container>
  );
}
