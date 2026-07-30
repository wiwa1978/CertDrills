import { Container } from "@/components/ui/container";
import { getCertDrillCertificationsServer } from "@/lib/api/certdrill.server";
import { CertDrillAdminPage } from "@/modules/certdrill/admin-page";

type SearchParamValue = string | string[] | undefined;

function firstSearchParamString(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminCertDrillCertificationPage({
  params,
  searchParams,
}: {
  params: Promise<{ certificationId: string }>;
  searchParams: Promise<{
    categoryId?: SearchParamValue;
    examFormId?: SearchParamValue;
    resourceId?: SearchParamValue;
    questionSearch?: SearchParamValue;
    questionStatus?: SearchParamValue;
    questionDifficulty?: SearchParamValue;
    questionCategoryId?: SearchParamValue;
    questionSort?: SearchParamValue;
    feedbackStatus?: SearchParamValue;
    tab?: SearchParamValue;
  }>;
}) {
  const [
    { certificationId },
    { categoryId, examFormId, resourceId, questionSearch, questionStatus, questionDifficulty, questionCategoryId, questionSort, feedbackStatus, tab },
  ] = await Promise.all([params, searchParams]);
  const certifications = await getCertDrillCertificationsServer();

  return (
    <Container className="py-6">
      <CertDrillAdminPage
        certifications={certifications}
        selectedCertificationId={certificationId}
        selectedCategoryId={firstSearchParamString(categoryId)}
        selectedExamFormId={firstSearchParamString(examFormId)}
        selectedResourceId={firstSearchParamString(resourceId)}
        questionSearch={firstSearchParamString(questionSearch)}
        questionStatus={firstSearchParamString(questionStatus)}
        questionDifficulty={firstSearchParamString(questionDifficulty)}
        questionCategoryId={firstSearchParamString(questionCategoryId)}
        questionSort={firstSearchParamString(questionSort)}
        feedbackStatus={firstSearchParamString(feedbackStatus)}
        selectedTab={firstSearchParamString(tab)}
      />
    </Container>
  );
}
