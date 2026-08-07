import { listCertDrillAdminCategoriesServer, listCertDrillAdminCertificationsServer, listCertDrillAdminQuestionsServer, getCertDrillAdminExamFormServer } from "@/lib/api/certdrill.server";
import { ExamFormEditor } from "./exam-form-editor";

export async function CertDrillExamFormEditorPage({ certificationId, examFormId }: { certificationId: string; examFormId: string }) {
  const [certifications, categories, questions, examForm] = await Promise.all([
    listCertDrillAdminCertificationsServer(),
    listCertDrillAdminCategoriesServer(certificationId),
    listCertDrillAdminQuestionsServer(certificationId),
    getCertDrillAdminExamFormServer(examFormId),
  ]);
  const certification = certifications.find((item) => item.id === certificationId);
  if (!certification || examForm.certificationId !== certificationId) return <div className="rounded-lg border p-8 text-center text-muted-foreground">Exam form not found.</div>;
  return <ExamFormEditor certification={certification} categories={categories} questions={questions} examForm={examForm} />;
}
