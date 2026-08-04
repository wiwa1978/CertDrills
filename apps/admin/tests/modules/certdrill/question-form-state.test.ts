import { describe, expect, it } from "vitest";

import { initialQuestionFormActionState } from "@/modules/certdrill/question-form-state";

describe("question form action state", () => {
  it("starts without messages or field errors", () => {
    expect(initialQuestionFormActionState).toEqual({
      status: "idle",
      fieldErrors: {},
    });
  });
});
