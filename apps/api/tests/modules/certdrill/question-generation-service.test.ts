import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import type { QuestionGenerator } from "../../../src/product/certdrill/question-generator";
import { createQuestionGenerationService } from "../../../src/product/certdrill/question-generation-service";

const ids = {
  certification: "22222222-2222-4222-8222-222222222222",
  category: "33333333-3333-4333-8333-333333333333",
  secondCategory: "44444444-4444-4444-8444-444444444444",
  resource: "66666666-6666-4666-8666-666666666666",
};
const fixedNow = new Date("2026-08-09T12:00:00.000Z");

function proposal() {
  return {
    questions: [{
      categoryId: ids.category,
      stem: "Which setting enforces least privilege?",
      difficulty: "medium" as const,
      questionType: "single_choice" as const,
      options: [
        { text: "Grant only required actions", isCorrect: true, explanation: "This limits permissions.", citationUrls: ["https://docs.example.com/guide"] },
        { text: "Grant all actions", isCorrect: false, explanation: "This is broader than required.", citationUrls: ["https://docs.example.com/guide"] },
        { text: "Disable authorization", isCorrect: false, explanation: "This removes access control.", citationUrls: ["https://docs.example.com/guide"] },
      ],
    }],
  };
}

function createGenerator(): QuestionGenerator & { generate: ReturnType<typeof vi.fn> } {
  return {
    provider: "test-provider",
    model: "test-model",
    generate: vi.fn().mockResolvedValue({ rawOutput: JSON.stringify(proposal()), proposal: proposal() }),
  };
}

function createDb() {
  const certification = { id: ids.certification, code: "AZ-104", name: "Azure Administrator", vendor: "Microsoft" };
  const category = { id: ids.category, certificationId: ids.certification, code: "IDENTITY", name: "Manage identities", parentCategoryId: null, weightPct: "60.00" };
  const secondCategory = { id: ids.secondCategory, certificationId: ids.certification, code: "GOVERNANCE", name: "Manage governance", parentCategoryId: null, weightPct: "40.00" };
  const resource = {
    id: ids.resource,
    certificationId: ids.certification,
    categoryId: ids.category,
    title: "Official guide",
    url: "https://docs.example.com/guide",
    sourceType: "doc",
    contentMode: "deep_content",
    rawContent: "Least privilege grants only the actions required.",
    ingestedAt: new Date("2026-08-09T11:00:00.000Z"),
    status: "ingested",
    ingestError: null,
    createdAt: fixedNow,
    updatedAt: fixedNow,
  };
  const state = {
    jobs: [] as Array<Record<string, unknown>>,
    questions: [] as Array<Record<string, unknown>>,
    options: [] as Array<Record<string, unknown>>,
    resource,
  };
  let sequence = 0;

  const db = {
    query: {
      certdrillCertifications: { findFirst: vi.fn().mockImplementation(() => Promise.resolve(certification)) },
      certdrillExamCategories: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(category)),
        findMany: vi.fn().mockImplementation(() => Promise.resolve([category, secondCategory])),
      },
      certdrillLearnResources: { findMany: vi.fn().mockImplementation(() => Promise.resolve([state.resource])) },
      certdrillQuestionGenerationJobs: {
        findFirst: vi.fn().mockImplementation(() => Promise.resolve(state.jobs[0] ?? null)),
        findMany: vi.fn().mockImplementation(() => Promise.resolve(state.jobs.filter((job) => job.status === "pending"))),
      },
      certdrillQuestions: { findMany: vi.fn().mockImplementation(() => Promise.resolve(state.questions)) },
    },
    insert: (table: Table) => ({
      values: (input: Record<string, unknown> | Array<Record<string, unknown>>) => ({
        returning: async () => {
          const tableName = getTableName(table);
          const rows = Array.isArray(input) ? input : [input];
          const inserted = rows.map((row) => ({ id: `${tableName}-${++sequence}`, createdAt: fixedNow, updatedAt: fixedNow, ...row }));
          if (tableName === "certdrill_question_generation_jobs") state.jobs.push(...inserted);
          if (tableName === "certdrill_questions") state.questions.push(...inserted);
          if (tableName === "certdrill_answer_options") state.options.push(...inserted);
          return inserted;
        },
      }),
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (getTableName(table) !== "certdrill_question_generation_jobs" || !state.jobs[0]) return [];
            Object.assign(state.jobs[0], values);
            return [state.jobs[0]];
          },
        }),
      }),
    }),
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db),
  };

  return { db, state };
}

const config = {
  focus: "Identity governance",
  systemInstructions: "Use detailed answer choices.",
  instructions: null,
  questionTypes: ["single_choice"] as const,
  difficultyMix: { easy: 20, medium: 60, hard: 20 },
  deliveryPurpose: "practice" as const,
};

describe("Question generation service", () => {
  it("queues an immutable source snapshot and persists grounded AI drafts atomically", async () => {
    const { db, state } = createDb();
    const generator = createGenerator();
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });

    const job = await service.start({
      certificationId: ids.certification,
      categoryId: ids.category,
      resourceIds: [ids.resource],
      requestedCount: 1,
      config,
    });
    expect(job).toMatchObject({ status: "pending", provider: "test-provider", modelUsed: "test-model", configurationJson: config });
    expect(job.resourceChecksumsJson).toEqual({ [ids.resource]: expect.stringMatching(/^[a-f0-9]{64}$/) });

    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 1, failed: 0 });

    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({
      certification: { id: ids.certification, code: "AZ-104", name: "Azure Administrator", vendor: "Microsoft" },
      categories: [expect.objectContaining({ id: ids.category, code: "IDENTITY" })],
      requestedCount: 1,
      config,
      resources: [expect.objectContaining({ id: ids.resource, rawContent: expect.stringContaining("Least privilege") })],
    }));
    expect(state.jobs[0]).toMatchObject({ status: "completed", generatedCount: 1, errorMessage: null });
    expect(state.questions).toEqual([
      expect.objectContaining({
        categoryId: ids.category,
        sourceResourceId: ids.resource,
        generationJobId: job.id,
        status: "draft",
        deliveryPurpose: "practice",
        createdBy: "ai",
      }),
    ]);
    expect(state.options).toHaveLength(3);
    expect(state.options.every((option) => option.citationUrls?.[0] === "https://docs.example.com/guide")).toBe(true);
  });

  it("splits a large generation job into bounded model requests", async () => {
    const { db, state } = createDb();
    const generator = createGenerator();
    let sequence = 0;
    generator.generate.mockImplementation(async (input) => {
      const questions = Array.from({ length: input.requestedCount }, () => {
        sequence += 1;
        return {
          ...proposal().questions[0]!,
          stem: `Generated question ${sequence}?`,
        };
      });
      return { rawOutput: JSON.stringify({ questions }), proposal: { questions } };
    });
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });

    await service.start({
      certificationId: ids.certification,
      categoryId: null,
      resourceIds: [ids.resource],
      requestedCount: 25,
      config,
    });
    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 1, failed: 0 });

    expect(generator.generate.mock.calls.map(([input]) => input.requestedCount)).toEqual([10, 10, 5]);
    expect(generator.generate.mock.calls[1]?.[0].existingQuestionStems).toEqual(expect.arrayContaining([
      "Generated question 1?",
      "Generated question 10?",
    ]));
    expect(generator.generate.mock.calls[2]?.[0].existingQuestionStems).toHaveLength(20);
    expect(state.questions).toHaveLength(25);
    expect(state.jobs[0]).toMatchObject({ status: "completed", generatedCount: 25 });
  });

  it("does not persist an earlier batch when a later model request fails", async () => {
    const { db, state } = createDb();
    const generator = createGenerator();
    generator.generate
      .mockResolvedValueOnce({
        rawOutput: "first batch",
        proposal: {
          questions: Array.from({ length: 10 }, (_, index) => ({
            ...proposal().questions[0]!,
            stem: `Generated question ${index + 1}?`,
          })),
        },
      })
      .mockRejectedValueOnce(new Error("Model request timed out"));
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });

    await service.start({
      certificationId: ids.certification,
      categoryId: null,
      resourceIds: [ids.resource],
      requestedCount: 15,
      config,
    });
    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 0, failed: 1 });

    expect(generator.generate).toHaveBeenCalledTimes(2);
    expect(state.questions).toEqual([]);
    expect(state.jobs[0]).toMatchObject({ status: "failed", generatedCount: 0, errorMessage: "Model request timed out" });
  });

  it("generates across all categories and persists each AI assignment and purpose", async () => {
    const { db, state } = createDb();
    const first = proposal().questions[0]!;
    const generatedProposal = {
      questions: [
        first,
        { ...first, categoryId: ids.secondCategory, stem: "Which governance setting applies the policy?" },
      ],
    };
    const generator = createGenerator();
    generator.generate.mockResolvedValue({ rawOutput: JSON.stringify(generatedProposal), proposal: generatedProposal });
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });
    const assessmentConfig = { ...config, deliveryPurpose: "assessment" as const };

    await service.start({
      certificationId: ids.certification,
      categoryId: null,
      resourceIds: [ids.resource],
      requestedCount: 2,
      config: assessmentConfig,
    });
    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 1, failed: 0 });

    expect(generator.generate).toHaveBeenCalledWith(expect.objectContaining({
      categories: expect.arrayContaining([
        expect.objectContaining({ id: ids.category }),
        expect.objectContaining({ id: ids.secondCategory }),
      ]),
      config: assessmentConfig,
    }));
    expect(state.questions.map((question) => ({ categoryId: question.categoryId, deliveryPurpose: question.deliveryPurpose }))).toEqual([
      { categoryId: ids.category, deliveryPurpose: "assessment" },
      { categoryId: ids.secondCategory, deliveryPurpose: "assessment" },
    ]);
  });
  it("persists fill-in and matching interaction data without answer-option rows", async () => {
    const { db, state } = createDb();
    const generator = createGenerator();
    generator.generate.mockResolvedValue({
      rawOutput: "mixed",
      proposal: {
        questions: [
          {
            categoryId: ids.category,
            stem: "Complete the acronym.",
            difficulty: "easy",
            questionType: "fill_blank",
            acceptedAnswers: ["RBAC", "role-based access control"],
            explanation: "RBAC is the standard acronym.",
            citationUrls: ["https://docs.example.com/guide"],
          },
          {
            categoryId: ids.category,
            stem: "Match each control.",
            difficulty: "medium",
            questionType: "matching",
            pairs: [
              { prompt: "RBAC", target: "Role assignments", explanation: "RBAC uses roles.", citationUrls: ["https://docs.example.com/guide"] },
              { prompt: "Policy", target: "Compliance evaluation", explanation: "Policy evaluates resources.", citationUrls: ["https://docs.example.com/guide"] },
            ],
          },
        ],
      },
    });
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });

    await service.start({ certificationId: ids.certification, categoryId: ids.category, resourceIds: [ids.resource], requestedCount: 2, config: { ...config, questionTypes: ["fill_blank", "matching"] } });
    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 1, failed: 0 });

    expect(state.options).toHaveLength(0);
    expect(state.questions[0]).toMatchObject({ questionType: "fill_blank", interactionJson: { type: "fill_blank", acceptedAnswers: ["RBAC", "role-based access control"] } });
    expect(state.questions[1]).toMatchObject({ questionType: "matching", interactionJson: { type: "matching", pairs: [
      expect.objectContaining({ prompt: "RBAC", promptId: expect.stringMatching(/^[0-9a-f-]{36}$/), targetId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
      expect.objectContaining({ prompt: "Policy", promptId: expect.stringMatching(/^[0-9a-f-]{36}$/), targetId: expect.stringMatching(/^[0-9a-f-]{36}$/) }),
    ] } });
  });

  it("fails without inserting questions when a queued source snapshot changes", async () => {
    const { db, state } = createDb();
    const generator = createGenerator();
    const service = createQuestionGenerationService({ db, generator, now: () => fixedNow });
    await service.start({
      certificationId: ids.certification,
      categoryId: ids.category,
      resourceIds: [ids.resource],
      requestedCount: 1,
      config,
    });
    state.resource.rawContent = "Changed after queueing.";

    await expect(service.processPending(1)).resolves.toEqual({ checked: 1, completed: 0, failed: 1 });

    expect(generator.generate).not.toHaveBeenCalled();
    expect(state.questions).toEqual([]);
    expect(state.jobs[0]).toMatchObject({
      status: "failed",
      generatedCount: 0,
      errorMessage: "A source snapshot changed after the generation job was queued.",
    });
  });
});
