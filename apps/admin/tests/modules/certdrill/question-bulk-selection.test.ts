import { describe, expect, it } from "vitest";

import {
  runQuestionBulkAction,
  selectAllQuestionIds,
  setQuestionIdSelected,
} from "@/modules/certdrill/question-bulk-selection";

describe("question bulk selection", () => {
  it("selects and clears every visible question", () => {
    const questionIds = ["question-1", "question-2", "question-3"];

    expect(selectAllQuestionIds(questionIds, true)).toEqual(questionIds);
    expect(selectAllQuestionIds(questionIds, false)).toEqual([]);
  });

  it("adds each row once and removes only the unchecked row", () => {
    expect(setQuestionIdSelected(["question-1"], "question-2", true)).toEqual(["question-1", "question-2"]);
    expect(setQuestionIdSelected(["question-1", "question-2"], "question-2", true)).toEqual(["question-1", "question-2"]);
    expect(setQuestionIdSelected(["question-1", "question-2"], "question-1", false)).toEqual(["question-2"]);
  });

  it("clears selection only after a successful bulk action", async () => {
    const calls: string[] = [];
    const clearSelection = () => calls.push("clear");

    await runQuestionBulkAction(async () => { calls.push("publish"); }, new FormData(), clearSelection);
    expect(calls).toEqual(["publish", "clear"]);

    await expect(runQuestionBulkAction(async () => { throw new Error("publish failed"); }, new FormData(), clearSelection))
      .rejects.toThrow("publish failed");
    expect(calls).toEqual(["publish", "clear"]);
  });
});
