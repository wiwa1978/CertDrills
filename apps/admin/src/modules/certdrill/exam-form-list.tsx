import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Link as LocalizedLink } from "@/i18n/navigation";
import type { CertDrillAdminExamForm } from "@/lib/api/certdrill.server";
import { deactivateCertDrillExamFormAction } from "./exam-form-actions";
import { examFormEditorHref } from "./exam-form-href";

export function ExamFormList({ certificationId, examForms }: { certificationId: string; examForms: CertDrillAdminExamForm[] }) {
  return <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Target questions</TableHead><TableHead>Duration</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{examForms.map((form) => <TableRow key={form.id}><TableCell className="font-medium">{form.name}</TableCell><TableCell>{form.targetQuestionCount}</TableCell><TableCell>{form.durationMinutes} minutes</TableCell><TableCell><Badge variant={form.isActive ? "default" : "secondary"}>{form.isActive ? "Active" : "Inactive"}</Badge></TableCell><TableCell className="space-x-2 text-right"><Button asChild variant="outline" size="sm"><LocalizedLink href={examFormEditorHref(certificationId, form.id)}>Edit</LocalizedLink></Button>{form.isActive ? <form action={deactivateCertDrillExamFormAction} className="inline"><input type="hidden" name="certificationId" value={certificationId} /><input type="hidden" name="examFormId" value={form.id} /><Button type="submit" variant="outline" size="sm">Deactivate</Button></form> : null}</TableCell></TableRow>)}</TableBody></Table></div>;
}
