import { Container } from "@/components/ui/container";
import { LogsViewer } from "@/components/layout/backend/admin/logs/logs-viewer";

export default function AdminLogsPage() {
  return (
    <Container className="py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Logs</h1>
        <p className="text-muted-foreground mt-2">Browse app and audit logs written by the API.</p>
      </div>
      <LogsViewer />
    </Container>
  );
}
