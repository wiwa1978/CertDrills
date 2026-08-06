export function questionEditorNewHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}/questions/new`;
}

export function questionEditorHref(certificationId: string, questionId: string) {
  return `/admin/certdrill/${certificationId}/questions/${questionId}`;
}

export function questionImportHref(certificationId: string) {
  return `/admin/certdrill/${certificationId}/questions/import`;
}
