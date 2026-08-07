import { Container } from "@/components/ui/container";
import { CertDrillExamFormEditorPage } from "@/modules/certdrill/exam-form-editor-page";

export default async function EditCertDrillExamFormPage({ params }: { params: Promise<{ certificationId: string; examFormId: string }> }) {
  const { certificationId, examFormId } = await params;
  return <Container className="py-6"><CertDrillExamFormEditorPage certificationId={certificationId} examFormId={examFormId} /></Container>;
}
