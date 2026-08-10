import { beforeEach, describe, expect, it, vi } from "vitest";

const { updateStatuses, updatePurposes, revalidatePath } = vi.hoisted(() => ({
  updateStatuses: vi.fn(),
  updatePurposes: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/api/certdrill.server", () => ({
  updateCertDrillAdminQuestionStatusesServer: updateStatuses,
  updateCertDrillAdminQuestionDeliveryPurposesServer: updatePurposes,
}));

import {
  publishSelectedCertDrillQuestionsAction,
  unpublishSelectedCertDrillQuestionsAction,
  setSelectedCertDrillQuestionsPracticeAction,
  setSelectedCertDrillQuestionsAssessmentAction,
} from "@/modules/certdrill/admin-actions";

function selectedQuestions() {
  const formData = new FormData();
  formData.append("questionIds", "11111111-1111-4111-8111-111111111111");
  formData.append("questionIds", "22222222-2222-4222-8222-222222222222");
  formData.append("questionIds", "11111111-1111-4111-8111-111111111111");
  return formData;
}

describe("bulk question actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("publishes each selected question once", async () => {
    await publishSelectedCertDrillQuestionsAction(selectedQuestions());

    expect(updateStatuses).toHaveBeenCalledWith({
      questionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      status: "published",
    });
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("unpublishes selected questions to draft and ignores empty submissions", async () => {
    await unpublishSelectedCertDrillQuestionsAction(selectedQuestions());
    expect(updateStatuses).toHaveBeenCalledWith({
      questionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      status: "draft",
    });

    vi.clearAllMocks();
    await unpublishSelectedCertDrillQuestionsAction(new FormData());
    expect(updateStatuses).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reassigns selected questions to practice or assessment", async () => {
    await setSelectedCertDrillQuestionsPracticeAction(selectedQuestions());
    expect(updatePurposes).toHaveBeenCalledWith({
      questionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      deliveryPurpose: "practice",
    });

    await setSelectedCertDrillQuestionsAssessmentAction(selectedQuestions());
    expect(updatePurposes).toHaveBeenLastCalledWith({
      questionIds: [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
      ],
      deliveryPurpose: "assessment",
    });
  });
});
