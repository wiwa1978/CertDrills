import { Container } from "@/components/ui/container";
import { getCertDrillCertificationsServer } from "@/lib/api/certdrill.server";
import { CertDrillAdminPage } from "@/modules/certdrill/admin-page";

type SearchParamValue = string | string[] | undefined;

function firstSearchParamString(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

function parsePositiveIntegerSearchParam(value: SearchParamValue) {
  const parsed = Number(firstSearchParamString(value));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export default async function AdminCertDrillCertificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ certificationId: string }>;
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const [{ certificationId }, query] = await Promise.all([params, searchParams]);
  const { categoryId, questionSearch, questionStatus, questionDifficulty, questionCategoryId, questionSort, questionPage, feedbackStatus, tab, imported, generated, scenariosGenerated } = query;
  const certifications = await getCertDrillCertificationsServer();

  return (
    <Container className="py-6">
      <CertDrillAdminPage
        certifications={certifications}
        selectedCertificationId={certificationId}
        selectedCategoryId={firstSearchParamString(categoryId)}
        questionSearch={firstSearchParamString(questionSearch)}
        questionStatus={firstSearchParamString(questionStatus)}
        questionDifficulty={firstSearchParamString(questionDifficulty)}
        questionCategoryId={firstSearchParamString(questionCategoryId)}
        questionSort={firstSearchParamString(questionSort)}
        questionPage={firstSearchParamString(questionPage)}
        feedbackStatus={firstSearchParamString(feedbackStatus)}
        selectedTab={firstSearchParamString(tab)}
        questionTableQuery={query}
        importedQuestionCount={parsePositiveIntegerSearchParam(imported)}
        generatedQuestionCount={parsePositiveIntegerSearchParam(generated)}
        generatedScenarioCount={parsePositiveIntegerSearchParam(scenariosGenerated)}
      />
    </Container>
  );
}
