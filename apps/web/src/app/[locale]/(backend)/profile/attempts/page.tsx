import { getCertDrillAttemptsServer } from "@/lib/api/certdrill.server";
import { AttemptHistoryPage } from "@/modules/certdrill/attempt-history-page";

export default async function ProfileAttemptsPage() {
  const attempts = await getCertDrillAttemptsServer();

  return <AttemptHistoryPage attempts={attempts} />;
}
