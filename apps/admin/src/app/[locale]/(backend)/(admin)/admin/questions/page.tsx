import { Container } from "@/components/ui/container";
import { QuestionsIndexPage } from "@/modules/certdrill/questions-index-page";

type SearchParamValue = string | string[] | undefined;

export default async function AdminQuestionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, SearchParamValue>>;
}) {
  const query = await searchParams;

  return (
    <Container className="py-6">
      <QuestionsIndexPage searchParams={query} />
    </Container>
  );
}
