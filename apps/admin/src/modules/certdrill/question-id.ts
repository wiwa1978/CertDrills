export function compactQuestionId(questionId: string) {
  return questionId.split("-", 1)[0] ?? questionId;
}
