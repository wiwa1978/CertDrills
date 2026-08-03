import { Container } from "@/components/ui/container";
import { QuestionsIndexPage } from "@/modules/certdrill/questions-index-page";
import { normalizeQuestionsIndexQuery } from "@/modules/certdrill/questions-index-query";

type SearchParamValue = string | string[] | undefined;

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const query = await searchParams;
  const normalizedQuery = normalizeQuestionsIndexQuery(query);

  return (
    <Container className="py-6">
      <QuestionsIndexPage searchParams={query} initialQuery={normalizedQuery} />
    </Container>
  );
}
