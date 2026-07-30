import { getCertDrillAttemptServer } from "@/lib/api/certdrill.server";
import { ExamRunnerFromSession } from "@/modules/certdrill/exam-runner";

export default async function ExamAttemptPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const resumeAttempt = await getCertDrillAttemptServer(id);

  return <ExamRunnerFromSession attemptId={id} resumeAttempt={resumeAttempt} />;
}
