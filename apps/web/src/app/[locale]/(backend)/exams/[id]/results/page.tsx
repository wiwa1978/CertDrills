import {
  getCertDrillAttemptsServer,
  getCertDrillCertificationsServer,
  getCertDrillReviewServer,
} from "@/lib/api/certdrill.server";
import { ResultsPage } from "@/modules/certdrill/results-page";

export default async function CertDrillResultsRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [review, attempts, certifications] = await Promise.all([
    getCertDrillReviewServer(id),
    getCertDrillAttemptsServer(),
    getCertDrillCertificationsServer(),
  ]);
  const attempt = attempts.find((item) => item.id === id);
  const certification = attempt ? certifications.find((item) => item.id === attempt.certification.id) : undefined;

  return <ResultsPage review={review} attempt={attempt} certification={certification} />;
}
