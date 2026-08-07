import { afterEach, describe, expect, it, vi } from "vitest";

import { createStaticCertificationAccessProvider } from "../../../src/modules/certdrill/access";
import { buildAttemptSnapshot } from "../../../src/modules/certdrill/snapshot";
import { createCertDrillService } from "../../../src/modules/certdrill/service";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  otherUser: "12121212-1212-4121-8121-121212121212",
  cert: "22222222-2222-4222-8222-222222222222",
  attempt: "33333333-3333-4333-8333-333333333333",
  secondAttempt: "34343434-3434-4343-8343-343434343434",
  parentCategory: "44444444-4444-4444-8444-444444444444",
  childCategory: "45454545-4545-4545-8545-454545454545",
  otherCert: "46464646-4646-4646-8646-464646464646",
  question1: "55555555-5555-4555-8555-555555555555",
  question2: "66666666-6666-4666-8666-666666666666",
  examForm: "67676767-6767-4676-8676-676767676767",
  option1Correct: "77777777-7777-4777-8777-777777777777",
  option1Wrong: "88888888-8888-4888-8888-888888888888",
  option2Correct: "99999999-9999-4999-8999-999999999999",
  option2Wrong: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
};

const snapshot = buildAttemptSnapshot([
  {
    id: ids.question1,
    stem: "Question 1",
    mediaAssets: [],
    category: { id: ids.parentCategory, code: "D1", name: "Domain 1" },
    difficulty: "medium",
    options: [
      {
        id: ids.option1Correct,
        text: "Correct 1",
        mediaAssets: [],
        isCorrect: true,
        explanation: "Because 1",
        citationUrls: ["https://docs.example.com/1"],
        sortOrder: 0,
      },
      {
        id: ids.option1Wrong,
        text: "Wrong 1",
        mediaAssets: [],
        isCorrect: false,
        explanation: "Not 1",
        citationUrls: ["https://docs.example.com/1-wrong"],
        sortOrder: 1,
      },
    ],
  },
  {
    id: ids.question2,
    stem: "Question 2",
    mediaAssets: [],
    category: { id: ids.parentCategory, code: "D1", name: "Domain 1" },
    difficulty: "easy",
    options: [
      {
        id: ids.option2Correct,
        text: "Correct 2",
        mediaAssets: [],
        isCorrect: true,
        explanation: "Because 2",
        citationUrls: ["https://docs.example.com/2"],
        sortOrder: 0,
      },
      {
        id: ids.option2Wrong,
        text: "Wrong 2",
        mediaAssets: [],
        isCorrect: false,
        explanation: "Not 2",
        citationUrls: ["https://docs.example.com/2-wrong"],
        sortOrder: 1,
      },
    ],
  },
], { shuffleOptions: false });

describe("CertDrill service", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("blocks attempt creation when access provider denies access", async () => {
    const service = createCertDrillService({
      db: {},
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "not_purchased" }),
    });

    await expect(service.createAttempt(ids.user, {
      certificationId: ids.cert,
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      questionCount: 10,
    })).rejects.toThrow("Certification has not been purchased");
  });

  it("adds access status to active certification catalog and filters purchased certifications", async () => {
    const chains: QueryChain[] = [];
    const db = {
      query: {
        certdrillExamForms: {
          findMany: vi.fn().mockResolvedValue([
            {
              id: ids.examForm,
              certificationId: ids.cert,
              name: "Exam Form A",
              description: null,
              sortOrder: 1,
              isActive: true,
              durationMinutes: 120,
              targetQuestionCount: 2,
              questionIds: [ids.question1, ids.question2],
            },
          ]),
        },
      },
      select: selectRows([
      {
        id: ids.cert,
        code: "AWS-SAA-C03",
        name: "AWS Architect",
        vendor: "AWS",
        logoUrl: null,
        description: null,
        enabledAt: null,
        archivedAt: null,
        questionCountDefault: 55,
        passThresholdPct: 72,
        publishedQuestionCount: "4",
        quickDrillQuestionCount: 10,
        categoryDrillQuestionCount: 12,
        examSimulationQuestionCount: 65,
        examSimulationDurationMinutes: 130,
        examForms: [
          {
            id: ids.examForm,
            name: "Exam Form A",
            description: null,
            sortOrder: 1,
            isActive: true,
            durationMinutes: 120,
            targetQuestionCount: 2,
            questionIds: [ids.question1, ids.question2],
          },
          {
            id: ids.secondAttempt,
            name: "Inactive Form",
            description: "Hidden",
            sortOrder: 2,
            isActive: false,
            durationMinutes: 120,
            targetQuestionCount: 1,
            questionIds: [ids.question1],
          },
        ],
      },
      {
        id: ids.otherCert,
        code: "AZ-104",
        name: "Azure Admin",
        vendor: "Microsoft",
        logoUrl: null,
        description: "Azure certification",
        enabledAt: null,
        archivedAt: null,
        questionCountDefault: 40,
        passThresholdPct: 70,
        publishedQuestionCount: 2,
        quickDrillQuestionCount: 8,
        categoryDrillQuestionCount: 9,
        examSimulationQuestionCount: null,
        examSimulationDurationMinutes: 100,
        examForms: [],
      },
    ], chains),
    };

    const service = createCertDrillService({
      db,
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    await expect(service.listCertifications(ids.user)).resolves.toEqual([
      {
        id: ids.cert,
        code: "AWS-SAA-C03",
        name: "AWS Architect",
        vendor: "AWS",
        logoUrl: null,
        description: null,
        enabledAt: null,
        archivedAt: null,
        questionCountDefault: 55,
        quickDrillQuestionCount: 10,
        categoryDrillQuestionCount: 12,
        examSimulationQuestionCount: 65,
        examSimulationDurationMinutes: 130,
        examForms: [
          {
            id: ids.examForm,
            name: "Exam Form A",
            description: null,
            sortOrder: 1,
            isActive: true,
            durationMinutes: 120,
            questionCount: 2,
          },
        ],
        passThresholdPct: 72,
        publishedQuestionCount: 4,
        accessStatus: "purchased",
      },
      {
        id: ids.otherCert,
        code: "AZ-104",
        name: "Azure Admin",
        vendor: "Microsoft",
        logoUrl: null,
        description: "Azure certification",
        enabledAt: null,
        archivedAt: null,
        questionCountDefault: 40,
        quickDrillQuestionCount: 8,
        categoryDrillQuestionCount: 9,
        examSimulationQuestionCount: null,
        examSimulationDurationMinutes: 100,
        examForms: [],
        passThresholdPct: 70,
        publishedQuestionCount: 2,
        accessStatus: "not_purchased",
      },
    ]);
    await expect(service.listMyCertifications(ids.user)).resolves.toHaveLength(1);
    expect(chains[0]?.leftJoin).toHaveBeenCalledTimes(2);
    expect(chains[0]?.where).toHaveBeenCalledTimes(2);
    expect(sqlDebug(chains[0]?.leftJoin.mock.calls[0]?.[1])).toContain("status");
    expect(sqlDebug(chains[0]?.leftJoin.mock.calls[0]?.[1])).toContain("published");
    expect(sqlDebug(chains[0]?.where.mock.calls[0]?.[0])).toContain("is_active");
    expect(sqlDebug(chains[0]?.where.mock.calls[0]?.[0])).toContain("enabled_at");
    expect(sqlDebug(chains[0]?.where.mock.calls[0]?.[0])).toContain("archived_at");
  });

  it("limits active exam forms in certification catalog to the first three by sort order", async () => {
    const db = {
      query: {
        certdrillExamForms: {
          findMany: vi.fn().mockResolvedValue([
            { id: ids.examForm, certificationId: ids.cert, name: "Exam Form C", description: null, sortOrder: 30, isActive: true, durationMinutes: 120, targetQuestionCount: 1, questionIds: [ids.question1] },
            { id: ids.secondAttempt, certificationId: ids.cert, name: "Exam Form A", description: null, sortOrder: 10, isActive: true, durationMinutes: 120, targetQuestionCount: 1, questionIds: [ids.question1] },
            { id: ids.question1, certificationId: ids.cert, name: "Exam Form D", description: null, sortOrder: 40, isActive: true, durationMinutes: 120, targetQuestionCount: 1, questionIds: [ids.question1] },
            { id: ids.question2, certificationId: ids.cert, name: "Exam Form B", description: null, sortOrder: 20, isActive: true, durationMinutes: 120, targetQuestionCount: 1, questionIds: [ids.question1] },
          ]),
        },
      },
      select: selectRows([{ id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect", vendor: "AWS", description: null, questionCountDefault: 55, passThresholdPct: 72, publishedQuestionCount: "4", quickDrillQuestionCount: 10, categoryDrillQuestionCount: 12, examSimulationQuestionCount: 65, examSimulationDurationMinutes: 130 }]),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    const [certification] = await service.listCertifications(ids.user);

    expect(certification?.examForms.map((form) => form.name)).toEqual(["Exam Form A", "Exam Form B", "Exam Form C"]);
  });

  it("returns category trees with published direct question counts", async () => {
    const db = {
      query: {
        certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert }) },
      },
      select: selectMany([
        [
          { id: ids.childCategory, parentCategoryId: ids.parentCategory, code: "D1.1", name: "Task 1", weightPct: null, sortOrder: 2 },
          { id: ids.parentCategory, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "100.00", sortOrder: 1 },
        ],
        [
          { categoryId: ids.parentCategory, publishedQuestionCount: "2" },
          { categoryId: ids.childCategory, publishedQuestionCount: 1 },
        ],
      ]),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await expect(service.listCategories(ids.cert)).resolves.toEqual([
      {
        id: ids.parentCategory,
        parentCategoryId: null,
        code: "D1",
        name: "Domain 1",
        weightPct: "100.00",
        sortOrder: 1,
        publishedQuestionCount: 2,
        children: [
          {
            id: ids.childCategory,
            parentCategoryId: ids.parentCategory,
            code: "D1.1",
            name: "Task 1",
            weightPct: null,
            sortOrder: 2,
            publishedQuestionCount: 1,
            children: [],
          },
        ],
      },
    ]);
  });

  it("rejects category listing for inactive or missing certifications", async () => {
    const db = {
      query: {
        certdrillCertifications: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: selectMany([
        [{ id: ids.parentCategory, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "100.00", sortOrder: 1 }],
        [{ categoryId: ids.parentCategory, publishedQuestionCount: 2 }],
      ]),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await expect(service.listCategories(ids.cert)).rejects.toMatchObject({
      code: "CERTDRILL_CERTIFICATION_NOT_FOUND",
      message: "Certification not found",
    });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects category listing for future-enabled or archived certifications by id", async () => {
    const db = {
      query: {
        certdrillCertifications: { findFirst: vi.fn().mockResolvedValue(null) },
      },
      select: selectMany([
        [{ id: ids.parentCategory, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "100.00", sortOrder: 1 }],
        [{ categoryId: ids.parentCategory, publishedQuestionCount: 2 }],
      ]),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await expect(service.listCategories(ids.cert)).rejects.toMatchObject({
      code: "CERTDRILL_CERTIFICATION_NOT_FOUND",
      message: "Certification not found",
    });
    expect(sqlDebug(db.query.certdrillCertifications.findFirst.mock.calls[0]?.[0])).toContain("enabled_at");
    expect(sqlDebug(db.query.certdrillCertifications.findFirst.mock.calls[0]?.[0])).toContain("archived_at");
    expect(db.select).not.toHaveBeenCalled();
  });

  it("rejects attempt creation for future-enabled or archived certifications by id", async () => {
    const db = createAttemptDb({ certification: null });
    const service = createCertDrillService({
      db,
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    await expect(service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "quick_drill",
      confidenceEnabled: false,
    })).rejects.toMatchObject({
      code: "CERTDRILL_CERTIFICATION_NOT_FOUND",
      message: "Certification not found",
    });
    expect(sqlDebug(db.query.certdrillCertifications.findFirst.mock.calls[0]?.[0])).toContain("enabled_at");
    expect(sqlDebug(db.query.certdrillCertifications.findFirst.mock.calls[0]?.[0])).toContain("archived_at");
    expect(db.query.certdrillQuestions.findMany).not.toHaveBeenCalled();
  });

  it("creates an attempt from selected questions and hides correctness in the response", async () => {
    const insertedValues: unknown[] = [];
    const rng = sequenceRng([0.99, 0]);
    const service = createCertDrillService({
      db: {
        query: {
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, questionCountDefault: 2 }) },
          certdrillExamCategories: { findMany: vi.fn().mockResolvedValue([{ id: ids.parentCategory, parentCategoryId: null, weightPct: "100.00" }]) },
          certdrillQuestions: { findMany: vi.fn().mockResolvedValue(createQuestions()) },
        },
        insert: vi.fn(() => ({
          values: vi.fn((value: unknown) => {
            insertedValues.push(value);
            return { returning: vi.fn().mockResolvedValue([{ id: ids.attempt }]) };
          }),
        })),
      },
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
      rng,
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      questionCount: 1,
    });

    expect(result.attemptId).toBe(ids.attempt);
    expect(result.questions).toHaveLength(1);
    expect(result.questions[0]?.options[0]).toEqual({ id: ids.option1Wrong, text: "Wrong 1", mediaAssets: [] });
    expect(result.questions[0]?.options[0]).not.toHaveProperty("isCorrect");
    expect(result.questions[0]?.options[0]).not.toHaveProperty("explanation");
    expect((insertedValues[0] as { questionSnapshotJson: typeof snapshot }).questionSnapshotJson.questions[0]?.options.map((option) => option.id)).toEqual([
      ids.option1Wrong,
      ids.option1Correct,
    ]);
    expect(insertedValues[0]).toMatchObject({
      userId: ids.user,
      certificationId: ids.cert,
      questionIds: [ids.question1],
      questionSnapshotJson: expect.objectContaining({ version: 1 }),
    });
  });

  it("creates quick drill attempts with immediate-feedback legacy modes", async () => {
    const insertedValues: unknown[] = [];
    const service = createCertDrillService({
      db: createAttemptDb({ quickDrillQuestionCount: 1, insertedValues }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "quick_drill",
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      confidenceEnabled: true,
    });

    expect(result).toMatchObject({
      attemptId: ids.attempt,
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      testMode: "practice",
      testVariant: "quick_drill",
      confidenceEnabled: true,
      expiresAt: null,
    });
    expect(result.questions).toHaveLength(1);
    expect(insertedValues[0]).toMatchObject({
      feedbackMode: "practice",
      selectionMode: "weighted_random",
      testMode: "practice",
      testVariant: "quick_drill",
      confidenceEnabled: true,
      expiresAt: null,
    });
    expect((insertedValues[0] as { questionIds: string[] }).questionIds).toHaveLength(1);
  });

  it("creates exam simulation attempts with expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T10:00:00.000Z"));
    const insertedValues: unknown[] = [];
    const service = createCertDrillService({
      db: createAttemptDb({ examSimulationQuestionCount: 2, examSimulationDurationMinutes: 120, insertedValues }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "exam",
      testVariant: "exam_simulation",
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      confidenceEnabled: false,
    });

    expect(result).toMatchObject({
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
      confidenceEnabled: false,
      expiresAt: "2026-02-01T12:00:00.000Z",
    });
    expect(insertedValues[0]).toMatchObject({
      feedbackMode: "exam",
      testMode: "exam",
      testVariant: "exam_simulation",
      confidenceEnabled: false,
      expiresAt: new Date("2026-02-01T12:00:00.000Z"),
    });
    vi.useRealTimers();
  });

  it("creates exam form attempts from active form question order with expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T09:00:00.000Z"));
    const insertedValues: unknown[] = [];
    const service = createCertDrillService({
      db: createAttemptDb({
        examForms: [{ id: ids.examForm, certificationId: ids.cert, isActive: true, durationMinutes: 45, questionIds: [ids.question2, ids.question1] }],
        insertedValues,
      }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "exam",
      testVariant: "exam_form",
      examFormId: ids.examForm,
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      confidenceEnabled: true,
    });

    expect(result.questions.map((question) => question.id)).toEqual([ids.question2, ids.question1]);
    expect(result).toMatchObject({ testMode: "exam", testVariant: "exam_form", expiresAt: "2026-03-01T09:45:00.000Z" });
    expect(insertedValues[0]).toMatchObject({
      examFormId: ids.examForm,
      questionIds: [ids.question2, ids.question1],
      expiresAt: new Date("2026-03-01T09:45:00.000Z"),
    });
    vi.useRealTimers();
  });

  it("derives persisted legacy mode fields from test variant before insert", async () => {
    const insertedValues: unknown[] = [];
    const service = createCertDrillService({
      db: createAttemptDb({ examSimulationQuestionCount: 2, insertedValues }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "exam",
      testVariant: "exam_simulation",
      feedbackMode: "exam",
      selectionMode: "category_focus",
      confidenceEnabled: false,
    });

    expect(result).toMatchObject({
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
    });
    expect(insertedValues[0]).toMatchObject({
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
    });
  });

  it("starts missed question reviews from missed history", async () => {
    const service = createCertDrillService({
      db: createAttemptDb({
        attempts: [{ id: ids.attempt, certificationId: ids.cert, status: "completed", completedAt: new Date("2026-01-01T00:00:00.000Z"), questionSnapshotJson: snapshot }],
        answersByAttempt: new Map([[ids.attempt, [{ questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: false }]]]),
      }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "missed_review",
      confidenceEnabled: false,
    });

    expect(result.questions.map((question) => question.id)).toEqual([ids.question2]);
  });

  it("starts missed question reviews from snapshot correctness when persisted correctness is stale", async () => {
    const service = createCertDrillService({
      db: createAttemptDb({
        attempts: [{ id: ids.attempt, certificationId: ids.cert, status: "completed", completedAt: new Date("2026-01-01T00:00:00.000Z"), questionSnapshotJson: snapshot }],
        answersByAttempt: new Map([[ids.attempt, [
          { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false },
          { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: true },
        ]]]),
      }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "missed_review",
      confidenceEnabled: false,
    });

    expect(result.questions.map((question) => question.id)).toEqual([ids.question2]);
  });

  it("returns a specific error when missed question review has no missed history", async () => {
    const service = createCertDrillService({
      db: createAttemptDb({ attempts: [], answersByAttempt: new Map() }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    await expect(service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "missed_review",
      confidenceEnabled: false,
    })).rejects.toMatchObject({
      code: "CERTDRILL_NO_MISSED_QUESTIONS",
      message: "No missed questions are available yet. Answer questions incorrectly first, then try this review.",
    });
  });

  it("returns a specific error when weak areas drill has no answered category history", async () => {
    const service = createCertDrillService({
      db: createAttemptDb({ attempts: [], answersByAttempt: new Map() }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    await expect(service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "weak_areas",
      confidenceEnabled: false,
    })).rejects.toMatchObject({
      code: "CERTDRILL_NO_WEAK_AREAS",
      message: "No weak areas are available yet. Complete at least one attempt with answered questions first.",
    });
  });

  it("starts weak areas drills from only the lowest three answered category scores", async () => {
    const weakCategory = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const secondWeakCategory = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const thirdWeakCategory = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const strongCategory = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const questions = [
      createQuestion({ id: "10000000-0000-4000-8000-000000000001", categoryId: weakCategory, categoryCode: "D1", categoryName: "Weakest" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000002", categoryId: secondWeakCategory, categoryCode: "D2", categoryName: "Second" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000003", categoryId: thirdWeakCategory, categoryCode: "D3", categoryName: "Third" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000004", categoryId: strongCategory, categoryCode: "D4", categoryName: "Strong" }),
    ];
    const historySnapshot = buildAttemptSnapshot(questions.map((question) => ({
      id: question.id,
      stem: question.stem,
      mediaAssets: question.mediaAssets,
      category: question.category,
      difficulty: question.difficulty,
      options: question.options,
    })));
    const service = createCertDrillService({
      db: createAttemptDb({
        questions,
        categories: [
          { id: weakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: secondWeakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: thirdWeakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: strongCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
        ],
        attempts: [{ id: ids.attempt, certificationId: ids.cert, status: "completed", completedAt: new Date("2026-01-01T00:00:00.000Z"), questionSnapshotJson: historySnapshot }],
        answersByAttempt: new Map([[ids.attempt, [
          { questionId: "10000000-0000-4000-8000-000000000001", selectedOptionId: ids.option1Wrong, isCorrect: false },
          { questionId: "10000000-0000-4000-8000-000000000002", selectedOptionId: ids.option1Wrong, isCorrect: false },
          { questionId: "10000000-0000-4000-8000-000000000002", selectedOptionId: ids.option1Correct, isCorrect: true },
          { questionId: "10000000-0000-4000-8000-000000000003", selectedOptionId: ids.option1Correct, isCorrect: true },
          { questionId: "10000000-0000-4000-8000-000000000003", selectedOptionId: ids.option1Wrong, isCorrect: false },
          { questionId: "10000000-0000-4000-8000-000000000004", selectedOptionId: ids.option1Correct, isCorrect: true },
        ]]]),
      }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "weak_areas",
      confidenceEnabled: false,
      questionCount: 10,
    });

    expect(result.questions.map((question) => question.id).sort()).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
    ]);
  });

  it("starts weak areas drills from snapshot correctness when persisted correctness is stale", async () => {
    const weakCategory = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const secondWeakCategory = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const thirdWeakCategory = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const strongCategory = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    const questions = [
      createQuestion({ id: "10000000-0000-4000-8000-000000000001", categoryId: weakCategory, categoryCode: "D1", categoryName: "Weakest" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000002", categoryId: secondWeakCategory, categoryCode: "D2", categoryName: "Second" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000003", categoryId: thirdWeakCategory, categoryCode: "D3", categoryName: "Third" }),
      createQuestion({ id: "10000000-0000-4000-8000-000000000004", categoryId: strongCategory, categoryCode: "D4", categoryName: "Strong" }),
    ];
    const historySnapshot = buildAttemptSnapshot(questions.map((question) => ({
      id: question.id,
      stem: question.stem,
      mediaAssets: question.mediaAssets,
      category: question.category,
      difficulty: question.difficulty,
      options: question.options,
    })), { shuffleOptions: false });
    const service = createCertDrillService({
      db: createAttemptDb({
        questions,
        categories: [
          { id: weakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: secondWeakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: thirdWeakCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
          { id: strongCategory, parentCategoryId: null, weightPct: "25.00", drillQuestionCount: null },
        ],
        attempts: [{ id: ids.attempt, certificationId: ids.cert, status: "completed", completedAt: new Date("2026-01-01T00:00:00.000Z"), questionSnapshotJson: historySnapshot }],
        answersByAttempt: new Map([[ids.attempt, [
          { questionId: "10000000-0000-4000-8000-000000000001", selectedOptionId: ids.option1Wrong, isCorrect: true },
          { questionId: "10000000-0000-4000-8000-000000000002", selectedOptionId: ids.option1Wrong, isCorrect: false },
          { questionId: "10000000-0000-4000-8000-000000000003", selectedOptionId: ids.option1Wrong, isCorrect: false },
          { questionId: "10000000-0000-4000-8000-000000000004", selectedOptionId: ids.option1Correct, isCorrect: false },
        ]]]),
      }),
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    const result = await service.createAttempt(ids.user, {
      certificationId: ids.cert,
      testMode: "practice",
      testVariant: "weak_areas",
      confidenceEnabled: false,
      questionCount: 10,
    });

    expect(result.questions.map((question) => question.id).sort()).toEqual([
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
      "10000000-0000-4000-8000-000000000003",
    ]);
  });

  it("answers from the snapshot and stores snapshot-derived correctness", async () => {
    const writes: unknown[] = [];
    const guardedUpdates: unknown[] = [];
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              feedbackMode: "practice",
              status: "in_progress",
              questionSnapshotJson: snapshot,
            }),
          },
        },
        insert: vi.fn(() => ({
          values: vi.fn((value: unknown) => {
            writes.push(value);
            return { onConflictDoUpdate: vi.fn().mockResolvedValue(undefined) };
          }),
        })),
        update: updateReturningRows(guardedUpdates, [{ id: ids.attempt }]),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const result = await service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    });

    expect(result).toMatchObject({ isCorrect: true, correctOption: { explanation: "Because 1" } });
    expect(writes[0]).toMatchObject({
      examAttemptId: ids.attempt,
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
      isCorrect: true,
    });
    expect(guardedUpdates[0]).toMatchObject({ updatedAt: expect.any(Date) });
  });

  it("stores answer confidence when enabled", async () => {
    const writes: unknown[] = [];
    const db = createAnswerDb({ feedbackMode: "practice", status: "in_progress", confidenceEnabled: true, guardedRows: [{ id: ids.attempt }], writes });
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
      confidence: "guessed",
    });

    expect(writes[0]).toMatchObject({ confidence: "guessed" });
  });

  it("preserves existing confidence when answer update omits confidence", async () => {
    const conflicts: unknown[] = [];
    const db = createAnswerDb({
      feedbackMode: "practice",
      status: "in_progress",
      confidenceEnabled: true,
      guardedRows: [{ id: ids.attempt }],
      conflicts,
    });
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    });

    expect((conflicts[0] as { set: Record<string, unknown> }).set).not.toHaveProperty("confidence");
  });

  it("rejects answer updates after expiry while still in progress", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T10:01:00.000Z"));
    const db = createAnswerDb({
      feedbackMode: "exam",
      status: "in_progress",
      expiresAt: new Date("2026-04-01T10:00:00.000Z"),
      guardedRows: [{ id: ids.attempt }],
    });
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_EXPIRED" });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("guards answer writes against attempts expiring after load", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T09:59:59.000Z"));
    const guardedWhere: unknown[] = [];
    const db = createAnswerDb({
      feedbackMode: "exam",
      status: "in_progress",
      expiresAt: new Date("2026-04-01T10:00:00.000Z"),
      guardedRows: [{ id: ids.attempt }],
      guardedWhere,
      beforeGuard: () => vi.setSystemTime(new Date("2026-04-01T10:00:01.000Z")),
    });
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    });

    expect(sqlColumnNames(guardedWhere[0])).toContain("expires_at");
  });

  it("returns receipt-only responses for exam mode answers", async () => {
    const service = createCertDrillService({
      db: createAnswerDb({ feedbackMode: "exam", status: "in_progress", guardedRows: [{ id: ids.attempt }] }),
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Wrong,
    })).resolves.toEqual({ received: true });
  });

  it("wraps invalid answer question and option input as service errors", async () => {
    const service = createCertDrillService({
      db: createAnswerDb({ feedbackMode: "practice", status: "in_progress", guardedRows: [{ id: ids.attempt }] }),
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.otherCert,
      selectedOptionId: ids.option1Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_QUESTION_NOT_IN_ATTEMPT" });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option2Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_OPTION_NOT_IN_QUESTION" });
  });

  it("rejects answers for missing or non-owned attempts", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        query: { certdrillExamAttempts: { findFirst: vi.fn().mockResolvedValue(null) } },
        insert,
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.answerQuestion(ids.otherUser, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects answers for non-in-progress attempts without writing", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, status: "completed", questionSnapshotJson: snapshot }),
          },
        },
        insert,
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_IN_PROGRESS" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("does not write answers when the status guard finds a completed attempt", async () => {
    const db = createAnswerDb({ feedbackMode: "practice", status: "in_progress", guardedRows: [] });
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await expect(service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    })).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_IN_PROGRESS" });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("guards and writes answers in a transaction when available", async () => {
    const tx = createAnswerDb({ feedbackMode: "practice", status: "in_progress", guardedRows: [{ id: ids.attempt }] });
    const db = {
      query: tx.query,
      transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
      update: vi.fn(),
      insert: vi.fn(),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    await service.answerQuestion(ids.user, ids.attempt, {
      questionId: ids.question1,
      selectedOptionId: ids.option1Correct,
    });

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(tx.update).toHaveBeenCalledOnce();
    expect(tx.insert).toHaveBeenCalledOnce();
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("returns in-progress attempts for resume without correctness and with recorded answers", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              feedbackMode: "exam",
              selectionMode: "weighted_random",
              testMode: "exam",
              testVariant: "exam_simulation",
              expiresAt: new Date("2026-06-01T10:00:00.000Z"),
              confidenceEnabled: true,
              status: "in_progress",
              questionSnapshotJson: snapshot,
              examForm: { name: "Form A" },
            }),
          },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Wrong, isCorrect: false, confidence: "guessed" },
            ]),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const resume = await service.getAttemptForResume(ids.user, ids.attempt);

    expect(resume).toEqual({
      attemptId: ids.attempt,
      feedbackMode: "exam",
      selectionMode: "weighted_random",
      testMode: "exam",
      testVariant: "exam_simulation",
      examFormName: "Form A",
      confidenceEnabled: true,
      expiresAt: "2026-06-01T10:00:00.000Z",
      questions: [
        {
          id: ids.question1,
          stem: "Question 1",
          mediaAssets: [],
          category: { id: ids.parentCategory, code: "D1", name: "Domain 1" },
          options: [
            { id: ids.option1Correct, text: "Correct 1", mediaAssets: [] },
            { id: ids.option1Wrong, text: "Wrong 1", mediaAssets: [] },
          ],
        },
        {
          id: ids.question2,
          stem: "Question 2",
          mediaAssets: [],
          category: { id: ids.parentCategory, code: "D1", name: "Domain 1" },
          options: [
            { id: ids.option2Correct, text: "Correct 2", mediaAssets: [] },
            { id: ids.option2Wrong, text: "Wrong 2", mediaAssets: [] },
          ],
        },
      ],
      recordedAnswers: [
        { questionId: ids.question1, selectedOptionId: ids.option1Wrong, confidence: "guessed" },
      ],
    });
    expect(JSON.stringify(resume)).not.toContain("isCorrect");
    expect(JSON.stringify(resume)).not.toContain("explanation");
  });

  it("rejects resume for attempts that are no longer in progress", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, status: "completed", questionSnapshotJson: snapshot }),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.getAttemptForResume(ids.user, ids.attempt)).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_IN_PROGRESS" });
  });

  it("submits using snapshot correctness instead of persisted answer correctness", async () => {
    const updates: unknown[] = [];
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              certificationId: ids.cert,
              status: "in_progress",
              questionSnapshotJson: JSON.stringify(snapshot),
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false },
              { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: true },
            ]),
          },
        },
        update: updateReturningRows(updates, [{ id: ids.attempt }]),
        insert: reviewQueueInsert([], []),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const result = await service.submitAttempt(ids.user, ids.attempt);

    expect(result.scorePct).toBe(50);
    expect(result.passed).toBe(false);
    expect(result.questions.map((question) => question.isCorrect)).toEqual([true, false]);
    expect(updates[0]).toMatchObject({ status: "completed", scorePct: "50.00" });
  });

  it("allows submit after expiry using recorded answers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:05:00.000Z"));
    const updates: unknown[] = [];
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              certificationId: ids.cert,
              status: "in_progress",
              expiresAt: new Date("2026-05-01T10:00:00.000Z"),
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true, confidence: "confident" },
              { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: false, confidence: "guessed" },
            ]),
          },
        },
        update: updateReturningRows(updates, [{ id: ids.attempt }]),
        insert: reviewQueueInsert([], []),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const result = await service.submitAttempt(ids.user, ids.attempt);

    expect(result.scorePct).toBe(50);
    expect(result.questions.map((question) => question.confidence)).toEqual(["confident", "guessed"]);
    expect(updates[0]).toMatchObject({ status: "completed" });
    vi.useRealTimers();
  });

  it("allows expired timed attempts to submit partial answers and scores unanswered questions incorrect", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:05:00.000Z"));
    const updates: unknown[] = [];
    const updateWheres: unknown[] = [];
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              certificationId: ids.cert,
              status: "in_progress",
              expiresAt: new Date("2026-05-01T10:00:00.000Z"),
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true, confidence: "confident" },
            ]),
          },
        },
        update: updateReturningRowsWithWhere(updates, updateWheres, [{ id: ids.attempt }]),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const result = await service.submitAttempt(ids.user, ids.attempt);

    expect(result.scorePct).toBe(50);
    expect(result.questions.map((question) => question.isCorrect)).toEqual([true, false]);
    expect(result.questions.map((question) => question.yourOption?.id ?? null)).toEqual([ids.option1Correct, null]);
    expect(sqlColumnNames(updateWheres[0])).not.toContain("expires_at");
    vi.useRealTimers();
  });

  it("claims submit attempts in a transaction before reading answers", async () => {
    const operations: string[] = [];
    const txUpdates: unknown[] = [];
    const tx = {
      query: {
        certdrillExamAttemptAnswers: {
          findMany: vi.fn().mockImplementation(() => {
            operations.push("read-answers");
            return Promise.resolve([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false },
              { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: true },
            ]);
          }),
        },
        certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
      },
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => {
          txUpdates.push(value);
          operations.push((value as { scorePct?: string }).scorePct ? "final-complete" : "claim-submit");
          return {
            where: vi.fn(() => ({
              returning: vi.fn().mockResolvedValue(
                (value as { scorePct?: string }).scorePct
                  ? [{ id: ids.attempt }]
                  : [{ id: ids.attempt, certificationId: ids.cert, questionSnapshotJson: snapshot }],
              ),
            })),
          };
        }),
      })),
      insert: reviewQueueInsert([], []),
    };
    const db = {
      query: {
        certdrillExamAttempts: {
          findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, certificationId: ids.cert, status: "in_progress", questionSnapshotJson: snapshot }),
        },
      },
      transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
      update: vi.fn(),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    const result = await service.submitAttempt(ids.user, ids.attempt);

    expect(db.transaction).toHaveBeenCalledOnce();
    expect(operations).toEqual(["claim-submit", "read-answers", "final-complete"]);
    expect(txUpdates[0]).toMatchObject({ status: "completed", scorePct: null });
    expect(result.scorePct).toBe(50);
    expect(db.update).not.toHaveBeenCalled();
  });

  it("allows expired timed attempts with partial answers in transaction", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:05:00.000Z"));
    const returningSelections: unknown[] = [];
    const tx = {
      query: {
        certdrillExamAttemptAnswers: {
          findMany: vi.fn().mockResolvedValue([
            { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true },
          ]),
        },
        certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
      },
      update: vi.fn(() => ({
        set: vi.fn((value: unknown) => ({
          where: vi.fn(() => ({
            returning: vi.fn((selection: unknown) => {
              returningSelections.push(selection);
              return Promise.resolve(
                (value as { scorePct?: string }).scorePct
                  ? [{ id: ids.attempt }]
                  : [{
                    id: ids.attempt,
                    certificationId: ids.cert,
                    status: "completed",
                    expiresAt: new Date("2026-05-01T10:00:00.000Z"),
                    questionSnapshotJson: snapshot,
                  }],
              );
            }),
          })),
        })),
      })),
    };
    const db = {
      query: {
        certdrillExamAttempts: {
          findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, certificationId: ids.cert, status: "in_progress", questionSnapshotJson: snapshot }),
        },
      },
      transaction: vi.fn(async (callback: (trx: typeof tx) => Promise<unknown>) => callback(tx)),
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    const result = await service.submitAttempt(ids.user, ids.attempt);

    expect(result.scorePct).toBe(50);
    expect(result.questions.map((question) => question.isCorrect)).toEqual([true, false]);
    expect(returningSelections[0]).toHaveProperty("status");
    vi.useRealTimers();
  });

  it("upserts review queue rows for incorrect and low-confidence submit answers", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:05:00.000Z"));
    const reviewQueueWrites: unknown[] = [];
    const reviewQueueConflicts: unknown[] = [];
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              certificationId: ids.cert,
              status: "in_progress",
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true, confidence: "guessed" },
              { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: false, confidence: "somewhat_sure" },
            ]),
          },
        },
        update: updateReturningRows([], [{ id: ids.attempt }]),
        insert: reviewQueueInsert(reviewQueueWrites, reviewQueueConflicts),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await service.submitAttempt(ids.user, ids.attempt);

    expect(reviewQueueWrites).toEqual([
      {
        userId: ids.user,
        certificationId: ids.cert,
        questionId: ids.question1,
        dueAt: new Date("2026-05-01T10:05:00.000Z"),
        reason: "low_confidence",
        intervalDays: 1,
        ease: "2.50",
        status: "active",
      },
      {
        userId: ids.user,
        certificationId: ids.cert,
        questionId: ids.question2,
        dueAt: new Date("2026-05-01T10:05:00.000Z"),
        reason: "incorrect_low_confidence",
        intervalDays: 1,
        ease: "2.50",
        status: "active",
      },
    ]);
    expect(reviewQueueConflicts).toHaveLength(2);
    const conflictDebug = sqlDebug(reviewQueueConflicts[0]);
    expect(conflictDebug).toContain("user_id");
    expect(conflictDebug).toContain("certification_id");
    expect(conflictDebug).toContain("question_id");
    expect(conflictDebug).toContain("due_at");
    expect(conflictDebug).toContain("reason");
    expect(conflictDebug).toContain("interval_days");
    expect(conflictDebug).toContain("ease");
    expect(conflictDebug).toContain("status");
    expect(conflictDebug).toContain("updated_at");
    vi.useRealTimers();
  });

  it("lists active due review queue rows for a user", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T10:05:00.000Z"));
    const dueAt = new Date("2026-05-01T09:00:00.000Z");
    const chains: QueryChain[] = [];
    const service = createCertDrillService({
      db: {
        select: selectRows([
          {
            id: "abababab-abab-4aba-8aba-abababababab",
            certificationId: ids.cert,
            certificationCode: "AWS-SAA-C03",
            certificationName: "AWS Architect",
            questionId: ids.question1,
            stem: "Question 1",
            dueAt,
            reason: "incorrect",
            intervalDays: 1,
            ease: "2.50",
            status: "active",
            createdAt: new Date("2026-05-01T08:00:00.000Z"),
            updatedAt: new Date("2026-05-01T08:30:00.000Z"),
          },
        ], chains),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.listDueReviewQueue(ids.user)).resolves.toEqual([
      {
        id: "abababab-abab-4aba-8aba-abababababab",
        certification: { id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect" },
        question: { id: ids.question1, stem: "Question 1" },
        dueAt: "2026-05-01T09:00:00.000Z",
        reason: "incorrect",
        intervalDays: 1,
        ease: 2.5,
        status: "active",
        createdAt: "2026-05-01T08:00:00.000Z",
        updatedAt: "2026-05-01T08:30:00.000Z",
      },
    ]);
    expect(chains[0]?.innerJoin).toHaveBeenCalledTimes(2);
    expect(sqlColumnNames(chains[0]?.where.mock.calls[0]?.[0])).toEqual(expect.arrayContaining(["user_id", "due_at", "status"]));
    expect(sqlColumnNames(chains[0]?.orderBy.mock.calls[0]?.[0])).toContain("due_at");
    vi.useRealTimers();
  });

  it("wraps invalid persisted submit answers as service errors", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              certificationId: ids.cert,
              status: "in_progress",
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false },
              { questionId: ids.question2, selectedOptionId: ids.option1Correct, isCorrect: true },
            ]),
          },
        },
        update: updateReturningRows([], [{ id: ids.attempt }]),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.submitAttempt(ids.user, ids.attempt)).rejects.toMatchObject({ code: "CERTDRILL_OPTION_NOT_IN_QUESTION" });
  });

  it("rejects submit when not all questions have answers", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              certificationId: ids.cert,
              status: "in_progress",
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([{ questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true }]),
          },
        },
        update: vi.fn(),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.submitAttempt(ids.user, ids.attempt)).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_INCOMPLETE" });
  });

  it("rejects submit when the completion update loses the in-progress race", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              certificationId: ids.cert,
              status: "in_progress",
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillCertifications: { findFirst: vi.fn().mockResolvedValue({ id: ids.cert, passThresholdPct: 70 }) },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([
              { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false },
              { questionId: ids.question2, selectedOptionId: ids.option2Wrong, isCorrect: true },
            ]),
          },
        },
        update: updateReturningRows([], []),
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.submitAttempt(ids.user, ids.attempt)).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_IN_PROGRESS" });
  });

  it("reviews only completed attempts", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, status: "completed", questionSnapshotJson: snapshot }),
          },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([{ questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false }]),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const review = await service.reviewAttempt(ids.user, ids.attempt);
    expect(review.questions[0]).toMatchObject({ id: ids.question1, isCorrect: true });
  });

  it("includes confidence and attempt metadata in review output when available", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              status: "completed",
              testMode: "exam",
              testVariant: "exam_simulation",
              expiresAt: new Date("2026-06-01T10:00:00.000Z"),
              confidenceEnabled: true,
              questionSnapshotJson: snapshot,
            }),
          },
          certdrillExamAttemptAnswers: {
            findMany: vi.fn().mockResolvedValue([{ questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: false, confidence: "somewhat_sure" }]),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    const review = await service.reviewAttempt(ids.user, ids.attempt);

    expect(review).toMatchObject({
      testMode: "exam",
      testVariant: "exam_simulation",
      expiresAt: "2026-06-01T10:00:00.000Z",
      confidenceEnabled: true,
    });
    expect(review.questions[0]).toMatchObject({ confidence: "somewhat_sure" });
  });

  it("rejects reviews for in-progress attempts", async () => {
    const service = createCertDrillService({
      db: {
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({ id: ids.attempt, status: "in_progress", questionSnapshotJson: snapshot }),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.reviewAttempt(ids.user, ids.attempt)).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_COMPLETED" });
  });

  it("lists attempt history with numeric scorePct values", async () => {
    const startedAt = new Date("2026-01-01T00:00:00.000Z");
    const completedAt = new Date("2026-01-01T01:00:00.000Z");
    const service = createCertDrillService({
      db: { select: selectRows([
        {
          id: ids.attempt,
          certificationId: ids.cert,
          certificationCode: "AWS-SAA-C03",
          certificationName: "AWS Architect",
          feedbackMode: "exam",
          selectionMode: "weighted_random",
          testMode: "exam",
          testVariant: "exam_simulation",
          expiresAt: new Date("2026-01-01T02:00:00.000Z"),
          startedAt,
          completedAt,
          scorePct: "75.50",
          status: "completed",
        },
        {
          id: ids.secondAttempt,
          certificationId: ids.cert,
          certificationCode: "AWS-SAA-C03",
          certificationName: "AWS Architect",
          feedbackMode: "practice",
          selectionMode: "category_focus",
          testMode: "practice",
          testVariant: "category_drill",
          expiresAt: null,
          startedAt,
          completedAt: null,
          scorePct: null,
          status: "in_progress",
        },
      ]) },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.listAttempts(ids.user)).resolves.toEqual([
      {
        id: ids.attempt,
        certification: { id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect" },
        feedbackMode: "exam",
        selectionMode: "weighted_random",
        testMode: "exam",
        testVariant: "exam_simulation",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T01:00:00.000Z",
        expiresAt: "2026-01-01T02:00:00.000Z",
        scorePct: 75.5,
        status: "completed",
      },
      {
        id: ids.secondAttempt,
        certification: { id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect" },
        feedbackMode: "practice",
        selectionMode: "category_focus",
        testMode: "practice",
        testVariant: "category_drill",
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: null,
        expiresAt: null,
        scorePct: null,
        status: "in_progress",
      },
    ]);
  });

  it("summarizes readiness from completed attempts, scores, misses, and weak categories", async () => {
    const weakCategory = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const strongCategory = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const readinessSnapshot = buildAttemptSnapshot([
      {
        ...snapshot.questions[0]!,
        category: { id: weakCategory, code: "D1", name: "Weak Domain" },
      },
      {
        ...snapshot.questions[1]!,
        category: { id: strongCategory, code: "D2", name: "Strong Domain" },
      },
    ], { shuffleOptions: false });
    const service = createCertDrillService({
      db: createAttemptDb({
        attempts: [
          { id: ids.attempt, status: "completed", completedAt: new Date("2026-01-02T00:00:00.000Z"), scorePct: "50.00", questionSnapshotJson: readinessSnapshot },
          { id: ids.secondAttempt, status: "completed", completedAt: new Date("2026-01-03T00:00:00.000Z"), scorePct: "100.00", questionSnapshotJson: readinessSnapshot },
          { id: "abababab-abab-4aba-8aba-abababababab", status: "in_progress", completedAt: null, scorePct: null, questionSnapshotJson: readinessSnapshot },
        ],
        answersByAttempt: new Map([
          [ids.attempt, [
            { questionId: ids.question1, selectedOptionId: ids.option1Wrong, isCorrect: true },
            { questionId: ids.question2, selectedOptionId: ids.option2Correct, isCorrect: true },
          ]],
          [ids.secondAttempt, [
            { questionId: ids.question1, selectedOptionId: ids.option1Correct, isCorrect: true },
            { questionId: ids.question2, selectedOptionId: ids.option2Correct, isCorrect: true },
          ]],
        ]),
      }),
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.getReadinessSummary(ids.user)).resolves.toEqual({
      completedAttempts: 2,
      averageScorePct: 75,
      missedQuestionCount: 1,
      weakCategoryCount: 1,
    });
  });

  it("creates question feedback and lists feedback for admin review", async () => {
    const createdAt = new Date("2026-07-29T10:00:00.000Z");
    const insertedValues: unknown[] = [];
    const feedbackRows = [
      {
        id: "abababab-abab-4aba-8aba-abababababab",
        userId: ids.user,
        questionId: ids.question1,
        examAttemptId: ids.attempt,
        rating: 2,
        disputeCorrectAnswer: true,
        message: "The explanation cites the wrong service.",
        status: "open",
        createdAt,
        updatedAt: createdAt,
      },
    ];
    const db = {
      insert: vi.fn(() => ({
        values: vi.fn((value: unknown) => {
          insertedValues.push(value);
          return { returning: vi.fn().mockResolvedValue(feedbackRows) };
        }),
      })),
      query: {
        certdrillExamAttempts: {
          findFirst: vi.fn().mockResolvedValue({
            id: ids.attempt,
            userId: ids.user,
            questionIds: [ids.question1],
            questionSnapshotJson: snapshot,
          }),
        },
        certdrillQuestionFeedback: {
          findMany: vi.fn().mockResolvedValue(feedbackRows),
        },
      },
    };
    const service = createCertDrillService({ db, accessProvider: createStaticCertificationAccessProvider({}) });

    const created = await service.createQuestionFeedback(ids.user, {
      questionId: ids.question1,
      attemptId: ids.attempt,
      rating: 2,
      disputeCorrectAnswer: true,
      message: "The explanation cites the wrong service.",
    });
    const listed = await service.listQuestionFeedbackForAdmin();

    expect(insertedValues[0]).toEqual({
      userId: ids.user,
      questionId: ids.question1,
      examAttemptId: ids.attempt,
      rating: 2,
      disputeCorrectAnswer: true,
      message: "The explanation cites the wrong service.",
    });
    expect(created).toEqual({
      id: "abababab-abab-4aba-8aba-abababababab",
      userId: ids.user,
      questionId: ids.question1,
      examAttemptId: ids.attempt,
      rating: 2,
      disputeCorrectAnswer: true,
      message: "The explanation cites the wrong service.",
      status: "open",
      createdAt: "2026-07-29T10:00:00.000Z",
      updatedAt: "2026-07-29T10:00:00.000Z",
    });
    expect(listed).toEqual([created]);
  });

  it("rejects question feedback for another user's attempt", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        insert,
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.createQuestionFeedback(ids.user, {
      questionId: ids.question1,
      attemptId: ids.attempt,
      rating: 2,
    })).rejects.toMatchObject({ code: "CERTDRILL_ATTEMPT_NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects question feedback when the question is not in the attempt", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        insert,
        query: {
          certdrillExamAttempts: {
            findFirst: vi.fn().mockResolvedValue({
              id: ids.attempt,
              userId: ids.user,
              questionIds: [ids.question2],
              questionSnapshotJson: snapshot,
            }),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({}),
    });

    await expect(service.createQuestionFeedback(ids.user, {
      questionId: ids.otherCert,
      attemptId: ids.attempt,
      rating: 2,
    })).rejects.toMatchObject({ code: "CERTDRILL_QUESTION_NOT_IN_ATTEMPT" });
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects question feedback for inaccessible questions without an attempt", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        insert,
        query: {
          certdrillQuestions: {
            findFirst: vi.fn().mockResolvedValue({ id: ids.question1, certificationId: ids.cert }),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "not_purchased" }),
    });

    await expect(service.createQuestionFeedback(ids.user, {
      questionId: ids.question1,
      rating: 2,
    })).rejects.toThrow("Certification has not been purchased");
    expect(insert).not.toHaveBeenCalled();
  });

  it("rejects question feedback for nonexistent questions without an attempt", async () => {
    const insert = vi.fn();
    const service = createCertDrillService({
      db: {
        insert,
        query: {
          certdrillQuestions: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      },
      accessProvider: createStaticCertificationAccessProvider({ [ids.cert]: "purchased" }),
    });

    await expect(service.createQuestionFeedback(ids.user, {
      questionId: ids.question1,
      rating: 2,
    })).rejects.toMatchObject({ code: "CERTDRILL_QUESTION_NOT_FOUND" });
    expect(insert).not.toHaveBeenCalled();
  });
});

type QueryChain = {
  from: ReturnType<typeof vi.fn>;
  leftJoin: ReturnType<typeof vi.fn>;
  innerJoin: ReturnType<typeof vi.fn>;
  where: ReturnType<typeof vi.fn>;
  groupBy: ReturnType<typeof vi.fn>;
  orderBy: ReturnType<typeof vi.fn>;
  then: Promise<unknown[]>["then"];
};

function selectRows(rows: unknown[], chains: QueryChain[] = []) {
  const chain = {} as QueryChain;
  const resolve = () => Promise.resolve(rows);
  chain.from = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.innerJoin = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.groupBy = vi.fn(() => chain);
  chain.orderBy = vi.fn(resolve);
  chain.then = resolve().then.bind(resolve());
  chains.push(chain);
  return vi.fn(() => chain);
}

function selectMany(results: unknown[][]) {
  let index = 0;
  return vi.fn(() => {
    const rows = results[index] ?? [];
    index += 1;
    return selectRows(rows)();
  });
}

function updateReturningRows(updates: unknown[], rows: unknown[]) {
  return vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      updates.push(value);
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(rows),
        })),
      };
    }),
  }));
}

function updateReturningRowsWithWhere(updates: unknown[], wheres: unknown[], rows: unknown[]) {
  return vi.fn(() => ({
    set: vi.fn((value: unknown) => {
      updates.push(value);
      return {
        where: vi.fn((where: unknown) => {
          wheres.push(where);
          return { returning: vi.fn().mockResolvedValue(rows) };
        }),
      };
    }),
  }));
}

function reviewQueueInsert(writes: unknown[], conflicts: unknown[]) {
  return vi.fn(() => ({
    values: vi.fn((value: unknown) => {
      writes.push(value);
      return {
        onConflictDoUpdate: vi.fn((conflict: unknown) => {
          conflicts.push(conflict);
          return Promise.resolve(undefined);
        }),
      };
    }),
  }));
}

function createAttemptDb(input: {
  questionCountDefault?: number;
  quickDrillQuestionCount?: number;
  categoryDrillQuestionCount?: number;
  examSimulationQuestionCount?: number | null;
  examSimulationDurationMinutes?: number;
  certification?: Record<string, unknown> | null;
  examForms?: unknown[];
  insertedValues?: unknown[];
  categories?: unknown[];
  questions?: ReturnType<typeof createQuestion>[];
  attempts?: Array<{ id: string }>;
  answersByAttempt?: Map<string, unknown[]>;
} = {}) {
  const insertedValues = input.insertedValues ?? [];
  const answerFallbacks = [...(input.answersByAttempt?.values() ?? [])];
  let answerFallbackIndex = 0;
  return {
    query: {
      certdrillCertifications: {
        findFirst: vi.fn().mockResolvedValue(input.certification === undefined
          ? {
              id: ids.cert,
              questionCountDefault: input.questionCountDefault ?? 2,
              quickDrillQuestionCount: input.quickDrillQuestionCount ?? 2,
              categoryDrillQuestionCount: input.categoryDrillQuestionCount ?? 2,
              examSimulationQuestionCount: input.examSimulationQuestionCount ?? null,
              examSimulationDurationMinutes: input.examSimulationDurationMinutes ?? 120,
              passThresholdPct: 70,
            }
          : input.certification),
      },
      certdrillExamCategories: { findMany: vi.fn().mockResolvedValue(input.categories ?? [{ id: ids.parentCategory, parentCategoryId: null, weightPct: "100.00", drillQuestionCount: null }]) },
      certdrillQuestions: { findMany: vi.fn().mockResolvedValue(input.questions ?? createQuestions()) },
      certdrillExamForms: { findMany: vi.fn().mockResolvedValue(input.examForms ?? []) },
      certdrillExamAttempts: { findMany: vi.fn().mockResolvedValue(input.attempts ?? []) },
      certdrillExamAttemptAnswers: {
        findMany: vi.fn((query: unknown) => {
          const answers = findAnswersForAttemptQuery(input.answersByAttempt, query);
          if (answers !== undefined) {
            return Promise.resolve(answers);
          }

          const fallback = answerFallbacks[answerFallbackIndex] ?? [];
          answerFallbackIndex += 1;
          return Promise.resolve(fallback);
        }),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn((value: unknown) => {
        insertedValues.push(value);
        return { returning: vi.fn().mockResolvedValue([{ id: ids.attempt }]) };
      }),
    })),
  };
}

function createAnswerDb(input: {
  feedbackMode: "practice" | "exam";
  status: string;
  guardedRows: unknown[];
  confidenceEnabled?: boolean;
  expiresAt?: Date | null;
  writes?: unknown[];
  conflicts?: unknown[];
  guardedWhere?: unknown[];
  beforeGuard?: () => void;
}) {
  const writes = input.writes ?? [];
  const conflicts = input.conflicts ?? [];
  const guardedWhere = input.guardedWhere ?? [];
  const db = {
    query: {
      certdrillExamAttempts: {
        findFirst: vi.fn().mockResolvedValue({
          id: ids.attempt,
          userId: ids.user,
          feedbackMode: input.feedbackMode,
          confidenceEnabled: input.confidenceEnabled ?? false,
          expiresAt: input.expiresAt ?? null,
          status: input.status,
          questionSnapshotJson: snapshot,
        }),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn((value: unknown) => {
          input.beforeGuard?.();
          guardedWhere.push(value);
          return { returning: vi.fn().mockResolvedValue(input.guardedRows) };
        }),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: unknown) => {
        writes.push(value);
        return {
          onConflictDoUpdate: vi.fn((conflict: unknown) => {
            conflicts.push(conflict);
            return Promise.resolve(undefined);
          }),
        };
      }),
    })),
  };
  return db;
}

function sqlDebug(value: unknown) {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, item) => {
    if (typeof item === "function") return undefined;
    if (typeof item === "symbol") return String(item);
    if (typeof item === "object" && item !== null) {
      if (seen.has(item)) return "[Circular]";
      seen.add(item);
    }
    return item;
  });
}

function sqlColumnNames(value: unknown) {
  const names: string[] = [];
  const seen = new WeakSet<object>();

  function visit(item: unknown) {
    if (typeof item !== "object" || item === null || seen.has(item)) {
      return;
    }
    seen.add(item);

    if ("queryChunks" in item && Array.isArray((item as { queryChunks: unknown[] }).queryChunks)) {
      for (const chunk of (item as { queryChunks: unknown[] }).queryChunks) {
        visit(chunk);
      }
      return;
    }

    if ("name" in item && typeof (item as { name: unknown }).name === "string" && "columnType" in item) {
      names.push((item as { name: string }).name);
    }
  }

  visit(value);
  return names;
}

function createQuestions() {
  return snapshot.questions.map((question) => ({
    id: question.id,
    stem: question.stem,
    mediaAssets: question.mediaAssets,
    difficulty: question.difficulty,
    categoryId: question.category.id,
    category: question.category,
    options: question.options,
  }));
}

function createQuestion({
  id,
  categoryId,
  categoryCode,
  categoryName,
}: {
  id: string;
  categoryId: string;
  categoryCode: string;
  categoryName: string;
}) {
  return {
    ...createQuestions()[0]!,
    id,
    categoryId,
    category: { id: categoryId, code: categoryCode, name: categoryName },
  };
}

function sequenceRng(values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

function findAnswersForAttemptQuery(answersByAttempt: Map<string, unknown[]> | undefined, query: unknown) {
  if (!answersByAttempt) {
    return undefined;
  }

  const debug = sqlDebug(query);
  for (const [attemptId, answers] of answersByAttempt.entries()) {
    if (debug.includes(attemptId)) {
      return answers;
    }
  }

  return undefined;
}
