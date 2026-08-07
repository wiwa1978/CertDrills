export function examFormListHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}?tab=exam-forms`;
}

export function examFormEditorHref(certificationId: string, examFormId: string) {
  return `/admin/certdrill/${certificationId}/exam-forms/${examFormId}`;
}
