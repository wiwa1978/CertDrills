import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listCertDrillAdminQuestionIndexServer } from "@/lib/api/certdrill.server";

import {
  archiveCertDrillQuestionAction,
  publishCertDrillQuestionAction,
  publishSelectedCertDrillQuestionsAction,
  unpublishSelectedCertDrillQuestionsAction,
  setSelectedCertDrillQuestionsPracticeAction,
  setSelectedCertDrillQuestionsAssessmentAction,
} from "./admin-actions";
import { QuestionsIndexFilterBar } from "./questions-index-filter-bar";
import {
  buildQuestionsIndexHref,
  buildQuestionsIndexPageQuery,
  buildQuestionsIndexSortQuery,
  extractQuestionsIndexRequestQuery,
  mergeQuestionsIndexQuery,
  type QuestionsIndexQuery,
} from "./questions-index-query";
import { QuestionsIndexTable } from "./questions-index-table";

type QuestionsIndexPageProps = {
  searchParams: QuestionsIndexQuery;
};

export async function QuestionsIndexPage({ searchParams }: QuestionsIndexPageProps) {
  const result = await listCertDrillAdminQuestionIndexServer(extractQuestionsIndexRequestQuery(searchParams));
  const effectiveQuery = result.query;
  const hrefQuery = mergeQuestionsIndexQuery(searchParams, effectiveQuery);
  const sortHref = buildQuestionsIndexHref(
    "/admin/questions",
    buildQuestionsIndexSortQuery(hrefQuery, effectiveQuery.sort === "stem-desc" ? "stem-asc" : "stem-desc"),
  );
  const previousHref = result.page > 1
    ? buildQuestionsIndexHref("/admin/questions", buildQuestionsIndexPageQuery(hrefQuery, result.page - 1))
    : undefined;
  const nextHref = result.page < result.pageCount
    ? buildQuestionsIndexHref("/admin/questions", buildQuestionsIndexPageQuery(hrefQuery, result.page + 1))
    : undefined;

  return (
    <div className="space-y-6">
      <div>
        <Badge variant="secondary">Questions</Badge>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Questions</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Search and manage questions across every certification and category.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Question bank</CardTitle>
          <CardDescription>Click any row to review answers, edit the question, or manage its status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <QuestionsIndexFilterBar
            certifications={result.certifications}
            categories={result.categories}
            query={effectiveQuery}
          />
          {result.items.length > 0 ? (
            <QuestionsIndexTable
              result={result}
              sort={effectiveQuery.sort}
              sortHref={sortHref}
              previousHref={previousHref}
              nextHref={nextHref}
              publishAction={publishCertDrillQuestionAction}
              archiveAction={archiveCertDrillQuestionAction}
              bulkPublishAction={publishSelectedCertDrillQuestionsAction}
              bulkUnpublishAction={unpublishSelectedCertDrillQuestionsAction}
              bulkPracticeAction={setSelectedCertDrillQuestionsPracticeAction}
              bulkAssessmentAction={setSelectedCertDrillQuestionsAssessmentAction}
            />
          ) : <EmptyState>No questions match the current filters.</EmptyState>}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">{children}</div>;
}
