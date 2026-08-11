import { getTableName, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

import { createCertDrillAdminService } from "../../../src/product/certdrill/admin-service";

const ids = {
  cert: "22222222-2222-4222-8222-222222222222",
  category: "33333333-3333-4333-8333-333333333333",
  siblingCategory: "34343434-3434-4343-8343-343434343434",
  targetParentCategory: "35353535-3535-4353-8353-353535353535",
  descendantCategory: "36363636-3636-4363-8363-363636363636",
  question: "44444444-4444-4444-8444-444444444444",
  optionA: "55555555-5555-4555-8555-555555555555",
  optionB: "66666666-6666-4666-8666-666666666666",
  examForm: "77777777-7777-4777-8777-777777777777",
  resource: "88888888-8888-4888-8888-888888888888",
  generationJob: "99999999-9999-4999-8999-999999999999",
  feedback: "abababab-abab-4aba-8aba-abababababab",
  otherCert: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  otherQuestion: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  otherResource: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  otherGenerationJob: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  replacementQuestion: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  otherExamForm: "ffffffff-ffff-4fff-8fff-ffffffffffff",
  scenario: "12121212-1212-4212-8212-121212121212",
  user: "13131313-1313-4313-8313-131313131313",
};

describe("CertDrill admin service", () => {
  it("delegates question index queries to the shared admin question index", async () => {
    const { db } = createAdminDb({});
    const questionIndexResult = {
      query: {
        search: "zero trust",
        certificationId: undefined,
        categoryId: ids.category,
        status: undefined,
        difficulty: undefined,
        sort: "stem-asc" as const,
        page: 1,
      },
      items: [],
      filterOptions: {
        certifications: [],
        categories: [],
      },
      pagination: {
        page: 1,
        pageSize: 50,
        pageCount: 1,
        totalItems: 0,
      },
    };
    const query = vi.fn().mockResolvedValue(questionIndexResult);
    const service = createCertDrillAdminService({ db, questionIndex: { query } });
    const input = {
      search: "  zero trust  ",
      certificationId: "invalid",
      categoryId: ids.category,
      status: "review",
      difficulty: "expert",
      sort: "newest",
      page: "0",
    };

    await expect(service.listQuestionIndex(input)).resolves.toEqual(questionIndexResult);

    expect(query).toHaveBeenCalledWith(input);
  });

  it("delegates question import preview and confirm to the focused import service", async () => {
    const { db } = createAdminDb({});
    const previewResult = {
      documentVersion: 1 as const,
      documentHash: "a".repeat(64),
      totals: {
        submitted: 0,
        valid: 0,
        invalid: 0,
        duplicateExisting: 0,
        duplicateBatch: 0,
        selectedByDefault: 0,
      },
      rows: [],
    };
    const confirmResult = { importedCount: 0, questionIds: [] };
    const preview = vi.fn().mockResolvedValue(previewResult);
    const confirm = vi.fn().mockResolvedValue(confirmResult);
    const service = createCertDrillAdminService({ db, questionImport: { preview, confirm } });
    const previewInput = { certificationId: ids.cert, document: { version: 1, questions: [] } };
    const confirmInput = {
      ...previewInput,
      previewDocumentHash: previewResult.documentHash,
      selectedSourceIndexes: [],
      duplicateOverrideSourceIndexes: [],
    };

    await expect(service.previewQuestionImport(previewInput)).resolves.toEqual(previewResult);
    await expect(service.importQuestions(confirmInput)).resolves.toEqual(confirmResult);

    expect(preview).toHaveBeenCalledWith(previewInput);
    expect(confirm).toHaveBeenCalledWith(confirmInput);
  });

  it("delegates blueprint parse status calls to the focused parse service", async () => {
    const { db } = createAdminDb({});
    const start = vi.fn();
    const get = vi.fn().mockResolvedValue({ id: "run-1", status: "completed" });
    const list = vi.fn().mockResolvedValue([{ id: "run-1", status: "completed" }]);
    const processPending = vi.fn().mockResolvedValue({ checked: 2, completed: 1, failed: 1 });
    const service = createCertDrillAdminService({ db, blueprintParse: { start, get, list, processPending } } as never);

    await expect(service.getBlueprintParseRun("run-1")).resolves.toEqual({ id: "run-1", status: "completed" });
    await expect(service.listBlueprintParseRuns(ids.cert)).resolves.toEqual([{ id: "run-1", status: "completed" }]);
    await expect(service.processPendingBlueprintParseRuns(2)).resolves.toEqual({ checked: 2, completed: 1, failed: 1 });

    expect(start).not.toHaveBeenCalled();
    expect(get).toHaveBeenCalledWith("run-1");
    expect(list).toHaveBeenCalledWith(ids.cert);
    expect(processPending).toHaveBeenCalledWith(2);
  });

  it("reuses and refreshes an existing study-guide resource before starting category discovery", async () => {
    const url = "https://learn.example/aws-study-guide";
    const resource = { id: ids.resource, certificationId: ids.cert, url, title: "AWS study guide", sourceType: "study-guide", contentMode: "outline_blueprint", status: "ingested" };
    const { db, inserts, updates } = createAdminDb({
      certifications: [{ id: ids.cert, code: "AWS-SAA-C03" }],
      resources: [resource],
      returningByTable: { certdrill_learn_resources: [resource] },
    });
    const ingest = vi.fn().mockResolvedValue({
      finalUrl: url,
      title: "AWS certification study guide",
      rawContent: "Domain 1 (50%)",
      contentType: "text/html",
      ingestedAt: new Date("2026-08-09T10:00:00.000Z"),
    });
    const start = vi.fn().mockResolvedValue({ id: "run-1", status: "pending" });
    const service = createCertDrillAdminService({
      db,
      resourceIngestor: { ingest },
      blueprintParse: { start, get: vi.fn(), list: vi.fn(), processPending: vi.fn() },
    } as never);

    await expect(service.startCategoryDiscovery({ certificationId: ids.cert, url })).resolves.toEqual({ id: "run-1", status: "pending" });

    expect(inserts.some((entry) => entry.table === "certdrill_learn_resources")).toBe(false);
    expect(ingest).toHaveBeenCalledWith(url);
    expect(updates.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({
      title: "AWS certification study guide",
      rawContent: "Domain 1 (50%)",
      status: "ingested",
    });
    expect(start).toHaveBeenCalledWith({ certificationId: ids.cert, resourceId: ids.resource });
  });

  it("creates the hidden study-guide resource when the URL is not already registered", async () => {
    const url = "https://learn.example/new-study-guide";
    const resource = { id: ids.resource, certificationId: ids.cert, url, title: "AWS-SAA-C03 study guide", sourceType: "study-guide", contentMode: "outline_blueprint", status: "pending" };
    const { db, inserts } = createAdminDb({
      certifications: [{ id: ids.cert, code: "AWS-SAA-C03" }],
      resources: [resource],
      returningByTable: { certdrill_learn_resources: [resource] },
    });
    db.query.certdrillLearnResources.findFirst.mockResolvedValueOnce(null).mockResolvedValue(resource);
    const start = vi.fn().mockResolvedValue({ id: "run-1", status: "pending" });
    const service = createCertDrillAdminService({
      db,
      resourceIngestor: { ingest: vi.fn().mockResolvedValue({ finalUrl: url, title: null, rawContent: "Domain 1 (100%)", contentType: "text/html", ingestedAt: new Date() }) },
      blueprintParse: { start, get: vi.fn(), list: vi.fn(), processPending: vi.fn() },
    } as never);

    await service.startCategoryDiscovery({ certificationId: ids.cert, url });

    expect(inserts.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({
      certificationId: ids.cert,
      url,
      title: "AWS-SAA-C03 study guide",
      sourceType: "study-guide",
      contentMode: "outline_blueprint",
      status: "pending",
    });
    expect(start).toHaveBeenCalledWith({ certificationId: ids.cert, resourceId: ids.resource });
  });

  it("creates, lists, and updates certifications", async () => {
    const { db, inserts, updates } = createAdminDb({
      certifications: [{ id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect", vendor: "AWS", isActive: true }],
      returningByTable: { certdrill_certifications: [{ id: ids.cert, code: "AWS-SAA-C03" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createCertification({
      code: "AWS-SAA-C03",
      name: "AWS Architect",
      vendor: "AWS",
      logoUrl: "https://example.com/aws.png",
      description: null,
      blueprintSourceUrl: null,
      questionCountDefault: 65,
      quickDrillQuestionCount: 10,
      categoryDrillQuestionCount: 12,
      examSimulationQuestionCount: 65,
      examSimulationDurationMinutes: 130,
      passThresholdPct: 72,
      isActive: true,
    })).resolves.toEqual({ id: ids.cert, code: "AWS-SAA-C03" });
    await expect(service.listCertifications()).resolves.toEqual([
      { id: ids.cert, code: "AWS-SAA-C03", name: "AWS Architect", vendor: "AWS", isActive: true },
    ]);
    await expect(service.updateCertification(ids.cert, { name: "AWS Solutions Architect", isActive: false })).resolves.toEqual({ id: ids.cert, code: "AWS-SAA-C03" });

    expect(inserts.find((entry) => entry.table === "certdrill_certifications")?.values).toMatchObject({
      code: "AWS-SAA-C03",
      logoUrl: "https://example.com/aws.png",
      questionCountDefault: 65,
      passThresholdPct: 72,
      isActive: true,
    });
    expect(updates.find((entry) => entry.table === "certdrill_certifications")?.values).toMatchObject({
      name: "AWS Solutions Architect",
      isActive: false,
    });
  });

  it("archives certifications with archivedAt timestamp", async () => {
    const { db, updates } = createAdminDb({
      returningByTable: { certdrill_certifications: [{ id: ids.cert, archivedAt: new Date("2026-07-28T12:00:00.000Z") }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.archiveCertification(ids.cert)).resolves.toMatchObject({ id: ids.cert });

    expect(updates.find((entry) => entry.table === "certdrill_certifications")?.values).toMatchObject({
      isActive: false,
      archivedAt: expect.any(Date),
    });
  });

  it("creates, lists, and updates categories when sibling weights sum to 100", async () => {
    const { db, inserts, updates } = createAdminDb({
      categories: [
        { id: ids.siblingCategory, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", drillQuestionCount: 10, sortOrder: 1 },
      ],
      categoryById: { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D2", name: "Domain 2", weightPct: "40.00", drillQuestionCount: 10, sortOrder: 2 },
      returningByTable: { certdrill_exam_categories: [{ id: ids.category, code: "D2" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createCategory({
      certificationId: ids.cert,
      parentCategoryId: null,
      code: "D2",
      name: "Domain 2",
      weightPct: "40.00",
      drillQuestionCount: 10,
      sortOrder: 2,
    })).resolves.toEqual({ id: ids.category, code: "D2" });
    await expect(service.listCategories(ids.cert)).resolves.toEqual([
      { id: ids.siblingCategory, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", drillQuestionCount: 10, sortOrder: 1 },
    ]);
    await expect(service.updateCategory(ids.category, { weightPct: "40.00", name: "Domain 2 updated" })).resolves.toEqual({ id: ids.category, code: "D2" });

    expect(inserts.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({
      code: "D2",
      weightPct: "40.00",
      weightMinPct: "40.00",
      weightMaxPct: "40.00",
    });
    expect(updates.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({
      name: "Domain 2 updated",
      weightPct: "40.00",
      weightMinPct: "40.00",
      weightMaxPct: "40.00",
    });
  });

  it("allows incremental category weights below 100 and rejects totals above 100", async () => {
    const { db } = createAdminDb({
      categories: [
        { id: ids.siblingCategory, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", sortOrder: 1 },
      ],
      returningByTable: { certdrill_exam_categories: [{ id: ids.category, code: "D2" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createCategory({
      certificationId: ids.cert,
      parentCategoryId: null,
      code: "D2",
      name: "Domain 2",
      weightPct: "20.00",
      sortOrder: 2,
    })).resolves.toEqual({ id: ids.category, code: "D2" });

    await expect(service.createCategory({
      certificationId: ids.cert,
      parentCategoryId: null,
      code: "D3",
      name: "Domain 3",
      weightPct: "45.00",
      sortOrder: 3,
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_INVALID_CATEGORY_WEIGHTS",
      message: "Sibling category weights must not exceed 100. Current total: 105.",
    });
  });

  it("rejects category self-parenting and descendant parent cycles", async () => {
    const { db, updates } = createAdminDb({
      categoryFindManyResults: [
        [
          { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", sortOrder: 1 },
          { id: ids.descendantCategory, certificationId: ids.cert, parentCategoryId: ids.category, code: "D1-A", name: "Domain 1A", weightPct: "40.00", sortOrder: 2 },
        ],
      ],
      categoryById: { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", sortOrder: 1 },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateCategory(ids.category, { parentCategoryId: ids.category })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE",
      message: "Category cannot be its own parent",
    });
    await expect(service.updateCategory(ids.category, { parentCategoryId: ids.descendantCategory })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CATEGORY_PARENT_CYCLE",
      message: "Category parent cannot be one of its descendants",
    });

    expect(updates).toEqual([]);
  });

  it("wraps category validation and writes in a transaction when available", async () => {
    const { db, transactions } = createAdminDb({
      categoryById: { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "40.00", sortOrder: 1 },
      returningByTable: { certdrill_exam_categories: [{ id: ids.category, name: "Domain 1 updated" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createCategory({
      certificationId: ids.cert,
      parentCategoryId: null,
      code: "D2",
      name: "Domain 2",
      weightPct: "40.00",
    })).resolves.toEqual({ id: ids.category, name: "Domain 1 updated" });
    await expect(service.updateCategory(ids.category, { name: "Domain 1 updated" })).resolves.toEqual({ id: ids.category, name: "Domain 1 updated" });

    expect(transactions).toHaveLength(2);
  });

  it("creates, updates, and publishes questions only when publish validation passes", async () => {
    const question = createQuestion({ status: "draft" });
    const { db, inserts, updates, deletes, transactions } = createAdminDb({
      categories: [{ id: ids.category, certificationId: ids.cert }],
      categoryById: { id: ids.category, certificationId: ids.cert },
      questionById: question,
      questions: [{ id: ids.question, certificationId: ids.cert }],
      returningByTable: { certdrill_questions: [{ id: ids.question, status: "draft" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createQuestion(questionInput())).resolves.toEqual({ id: ids.question, status: "draft" });
    await expect(service.updateQuestion(ids.question, { stem: "Updated stem", options: questionInput().options })).resolves.toEqual({ id: ids.question, status: "draft" });
    await expect(service.publishQuestion(ids.question)).resolves.toEqual({ id: ids.question, status: "draft" });

    expect(inserts.filter((entry) => entry.table === "certdrill_questions")).toHaveLength(1);
    expect(inserts.filter((entry) => entry.table === "certdrill_answer_options")).toHaveLength(4);
    expect(deletes).toContain("certdrill_answer_options");
    expect(transactions).toHaveLength(2);
    expect(updates.find((entry) => entry.table === "certdrill_questions" && entry.values.status === "published")?.values).toMatchObject({ status: "published" });
  });

  it("rejects direct published question writes when publish validation fails", async () => {
    const invalidOptions = [
      { text: "A", mediaAssets: [], isCorrect: true, explanation: "", citationUrls: [], sortOrder: 0 },
      { text: "B", mediaAssets: [], isCorrect: true, explanation: "", citationUrls: [], sortOrder: 1 },
    ];
    const { db, inserts, updates } = createAdminDb({
      categories: [{ id: ids.category, certificationId: ids.cert }],
      categoryById: { id: ids.category, certificationId: ids.cert },
      questionById: createQuestion({ status: "draft", options: invalidOptions.map((option, index) => ({ id: index === 0 ? ids.optionA : ids.optionB, ...option })) }),
      questions: [{ id: ids.question, certificationId: ids.cert }],
      returningByTable: { certdrill_questions: [{ id: ids.question, status: "published" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createQuestion({ ...questionInput(), status: "published", options: invalidOptions })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      details: expect.arrayContaining(["Exactly one answer option must be correct."]),
    });
    await expect(service.updateQuestion(ids.question, { status: "published" })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      details: expect.arrayContaining(["Exactly one answer option must be correct."]),
    });

    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });

  it("validates option updates on already published questions", async () => {
    const invalidOptions = [
      { text: "A", mediaAssets: [], isCorrect: true, explanation: "", citationUrls: [], sortOrder: 0 },
      { text: "B", mediaAssets: [], isCorrect: true, explanation: "", citationUrls: [], sortOrder: 1 },
    ];
    const { db, deletes } = createAdminDb({
      categoryById: { id: ids.category, certificationId: ids.cert },
      questionById: createQuestion({ status: "published" }),
      questions: [{ id: ids.question, certificationId: ids.cert }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateQuestion(ids.question, { options: invalidOptions })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      details: expect.arrayContaining(["Exactly one answer option must be correct."]),
    });

    expect(deletes).toEqual([]);
  });

  it("returns publish validation errors for incomplete questions", async () => {
    const { db } = createAdminDb({
      questionById: createQuestion({
        status: "draft",
        options: [
          { id: ids.optionA, isCorrect: true, explanation: "", citationUrls: [], mediaAssets: [], text: "A", sortOrder: 0 },
          { id: ids.optionB, isCorrect: true, explanation: "", citationUrls: [], mediaAssets: [], text: "B", sortOrder: 1 },
        ],
      }),
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.publishQuestion(ids.question)).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_QUESTION_NOT_PUBLISHABLE",
      details: expect.arrayContaining([
        "Exactly one answer option must be correct.",
        "Option 1 must have a non-empty explanation.",
      ]),
    });
  });

  it("preserves the current category weight when moving to a new sibling group without weightPct", async () => {
    const { db, updates } = createAdminDb({
      categoryFindManyResults: [
        [{ id: ids.siblingCategory, certificationId: ids.cert, parentCategoryId: ids.targetParentCategory, code: "D1", name: "Domain 1", weightPct: "60.00", sortOrder: 1 }],
        [{ id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D2", name: "Domain 2", weightPct: "40.00", sortOrder: 2 }],
      ],
      categoryById: { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D2", name: "Domain 2", weightPct: "40.00", sortOrder: 2 },
      returningByTable: { certdrill_exam_categories: [{ id: ids.category, parentCategoryId: ids.targetParentCategory }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateCategory(ids.category, { parentCategoryId: ids.targetParentCategory })).resolves.toEqual({ id: ids.category, parentCategoryId: ids.targetParentCategory });

    expect(updates.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({ parentCategoryId: ids.targetParentCategory });
  });

  it("allows weighted category moves that leave source siblings below 100", async () => {
    const { db, updates } = createAdminDb({
      categories: [
        { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D2", name: "Domain 2", weightPct: "40.00", sortOrder: 2 },
        { id: ids.siblingCategory, certificationId: ids.cert, parentCategoryId: null, code: "D1", name: "Domain 1", weightPct: "60.00", sortOrder: 1 },
      ],
      categoryById: { id: ids.category, certificationId: ids.cert, parentCategoryId: null, code: "D2", name: "Domain 2", weightPct: "40.00", sortOrder: 2 },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateCategory(ids.category, { parentCategoryId: ids.targetParentCategory })).resolves.toMatchObject({ id: expect.any(String) });

    expect(updates.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({ parentCategoryId: ids.targetParentCategory });
  });

  it("creates an inactive generated form at the next sort order", async () => {
    const { db, inserts, updates } = createAdminDb({
      categories: weightedCategories,
      questions: publishedQuestions,
      examForms: [{ id: ids.otherExamForm, certificationId: ids.cert, sortOrder: 2 }],
      returningByTable: { certdrill_exam_forms: [{ id: ids.examForm, name: "Form A" }] },
    });
    const service = createCertDrillAdminService({ db, rng: () => 0.5 });

    await service.createExamForm({ certificationId: ids.cert, name: "Form A", durationMinutes: 120, targetQuestionCount: 2 });

    expect(inserts.find((entry) => entry.table === "certdrill_exam_forms")?.values).toMatchObject({ name: "Form A", isActive: false, sortOrder: 3, targetQuestionCount: 2, assignmentVersion: 1, questionIds: expect.any(Array), allocationSnapshot: expect.any(Array) });
    expect(updates).toEqual([]);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(new PgDialect().sqlToQuery(db.execute.mock.calls[0]![0]).sql).toContain("913846227");
    expect(db.execute.mock.invocationCallOrder[0]).toBeLessThan(db.query.certdrillExamForms.findMany.mock.invocationCallOrder[0]!);
  });

  it("keeps generated exam forms disjoint from existing form assignments", async () => {
    const existingForm = generatedExamForm();
    const questions = [
      ...publishedQuestions,
      { id: ids.replacementQuestion, certificationId: ids.cert, categoryId: ids.category, status: "published" as const },
      { id: ids.otherResource, certificationId: ids.cert, categoryId: ids.siblingCategory, status: "published" as const },
    ];
    const { db, inserts } = createAdminDb({ categories: weightedCategories, questions, examForms: [existingForm] });

    await createCertDrillAdminService({ db, rng: () => 0.5 }).createExamForm({
      certificationId: ids.cert,
      name: "Form B",
      durationMinutes: 120,
      targetQuestionCount: 2,
    });

    expect(inserts.find((entry) => entry.table === "certdrill_exam_forms")?.values).toMatchObject({
      questionIds: expect.arrayContaining([ids.replacementQuestion, ids.otherResource]),
    });
  });

  it("does not insert a form when capacity is insufficient", async () => {
    const { db, inserts } = createAdminDb({ categories: weightedCategories, questions: publishedQuestions.slice(0, 1) });
    const service = createCertDrillAdminService({ db, rng: () => 0.5 });

    await expect(service.createExamForm({ certificationId: ids.cert, name: "Form A", durationMinutes: 120, targetQuestionCount: 2 })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_CAPACITY" });

    expect(inserts).toEqual([]);
  });

  it("updates metadata without mutating assignment fields", async () => {
    const form = generatedExamForm();
    const { db, updates } = createAdminDb({
      examForms: [form],
      returningByTable: { certdrill_exam_forms: [{ ...form, name: "Form B", durationMinutes: 90 }] },
    });
    const service = createCertDrillAdminService({ db });

    await service.updateExamFormMetadata(ids.examForm, { name: " Form B ", durationMinutes: 90 });

    expect(updates.at(-1)?.values).toMatchObject({ name: "Form B", durationMinutes: 90 });
    expect(updates.at(-1)?.values).not.toHaveProperty("questionIds");
    expect(updates.at(-1)?.values).not.toHaveProperty("assignmentVersion");
  });

  it("regenerates atomically and rejects stale assignment versions", async () => {
    const form = generatedExamForm({ assignmentVersion: 2 });
    const successful = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [form] });
    const service = createCertDrillAdminService({ db: successful.db, rng: () => 0.5 });

    await service.regenerateExamForm(ids.examForm, { targetQuestionCount: 2, expectedAssignmentVersion: 2 });

    expect(successful.transactions).toHaveLength(1);
    expect(successful.db.execute).toHaveBeenCalledTimes(1);
    expect(successful.updates.at(-1)?.values).toMatchObject({ targetQuestionCount: 2, assignmentVersion: 3, questionIds: expect.any(Array), allocationSnapshot: expect.any(Array), generatedAt: expect.any(Date) });

    const stale = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [form], returningByTable: { certdrill_exam_forms: [] } });
    await expect(createCertDrillAdminService({ db: stale.db }).regenerateExamForm(ids.examForm, { targetQuestionCount: 2, expectedAssignmentVersion: 1 })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT" });
  });

  it("replaces one question in place within the same top-level category", async () => {
    const form = generatedExamForm({ questionIds: [ids.question, ids.otherQuestion], assignmentVersion: 4 });
    const questions = [...publishedQuestions, { id: ids.replacementQuestion, certificationId: ids.cert, categoryId: ids.category, status: "published" }];
    const { db, updates } = createAdminDb({ categories: weightedCategories, questions, examForms: [form] });

    await createCertDrillAdminService({ db }).replaceExamFormQuestion(ids.examForm, { currentQuestionId: ids.question, replacementQuestionId: ids.replacementQuestion, expectedAssignmentVersion: 4 });

    expect(updates.at(-1)?.values).toMatchObject({ questionIds: [ids.replacementQuestion, ids.otherQuestion], assignmentVersion: 5 });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-category and already-assigned replacements", async () => {
    const form = generatedExamForm();
    const { db, updates } = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [form] });
    const service = createCertDrillAdminService({ db });

    await expect(service.replaceExamFormQuestion(ids.examForm, { currentQuestionId: ids.question, replacementQuestionId: ids.otherQuestion, expectedAssignmentVersion: 1 })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_INVALID" });
    expect(updates).toEqual([]);
  });

  it("rejects replacements when both questions have unresolved category ancestry", async () => {
    const unknownCategory = "12121212-1212-4212-8212-121212121212";
    const form = generatedExamForm({ questionIds: [ids.question, ids.otherQuestion] });
    const questions = [
      { id: ids.question, certificationId: ids.cert, categoryId: unknownCategory, status: "published" },
      { id: ids.replacementQuestion, certificationId: ids.cert, categoryId: unknownCategory, status: "published" },
    ];
    const { db, updates } = createAdminDb({ categories: weightedCategories, questions, examForms: [form] });

    await expect(createCertDrillAdminService({ db }).replaceExamFormQuestion(ids.examForm, {
      currentQuestionId: ids.question,
      replacementQuestionId: ids.replacementQuestion,
      expectedAssignmentVersion: 1,
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_INVALID" });
    expect(updates).toEqual([]);
  });

  it("activates only a complete current assignment and always permits deactivation", async () => {
    const stale = generatedExamForm({ allocationSnapshot: [] });
    const staleDb = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [stale] });
    await expect(createCertDrillAdminService({ db: staleDb.db }).setExamFormActive(ids.examForm, true)).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_INVALID" });

    const valid = createAdminDb({ categories: weightedCategories, questions: publishedQuestions, examForms: [generatedExamForm()] });
    await createCertDrillAdminService({ db: valid.db }).setExamFormActive(ids.examForm, true);
    expect(valid.updates.at(-1)?.values).toMatchObject({ isActive: true });
    expect(valid.db.transaction).toHaveBeenCalledTimes(1);
    expect(valid.db.execute).toHaveBeenCalledTimes(1);

    const invalid = createAdminDb({ examForms: [stale] });
    await createCertDrillAdminService({ db: invalid.db }).setExamFormActive(ids.examForm, false);
    expect(invalid.updates.at(-1)?.values).toMatchObject({ isActive: false });
  });

  it.each(["draft", "archived"] as const)("blocks changing an active-form question to %s", async (status) => {
    const { db, updates } = createAdminDb({ questionById: createQuestion({ status: "published" }), activeExamFormsContainingQuestion: [{ id: ids.examForm, name: "Form A" }] });
    await expect(createCertDrillAdminService({ db }).updateQuestion(ids.question, { status })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE", details: [{ id: ids.examForm, name: "Form A" }] });
    expect(updates).toEqual([]);
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it("blocks moving an active-form question to practice-only delivery", async () => {
    const { db, updates } = createAdminDb({ questionById: createQuestion({ status: "published" }), activeExamFormsContainingQuestion: [{ id: ids.examForm, name: "Form A" }] });

    await expect(createCertDrillAdminService({ db }).updateQuestion(ids.question, { deliveryPurpose: "practice" })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE",
    });
    expect(updates).toEqual([]);
  });

  it("creates, lists, and updates resource placeholders", async () => {
    const { db, inserts, updates } = createAdminDb({
      categories: [{ id: ids.category, certificationId: ids.cert }],
      categoryById: { id: ids.category, certificationId: ids.cert },
      resources: [{ id: ids.resource, certificationId: ids.cert, categoryId: ids.category, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content", status: "pending" }],
      returningByTable: { certdrill_learn_resources: [{ id: ids.resource, title: "Docs" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createResource({ certificationId: ids.cert, categoryId: ids.category, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content", rawContent: null, status: "pending" })).resolves.toEqual({ id: ids.resource, title: "Docs" });
    await expect(service.listResources(ids.cert)).resolves.toEqual([{ id: ids.resource, certificationId: ids.cert, categoryId: ids.category, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content", status: "pending" }]);
    await expect(service.updateResource(ids.resource, { title: "Updated Docs" })).resolves.toEqual({ id: ids.resource, title: "Docs" });

    expect(inserts.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({ title: "Docs", status: "pending" });
    expect(updates.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({ title: "Updated Docs" });
  });

  it("rejects resource certification changes when the existing category belongs to another certification", async () => {
    const { db, updates } = createAdminDb({
      categoryById: null,
      resources: [{ id: ids.resource, certificationId: ids.cert, categoryId: ids.category, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content", status: "pending" }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateResource(ids.resource, { certificationId: ids.otherCert })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Category must belong to the certification",
    });

    expect(updates).toEqual([]);
  });

  it("persists successful resource ingestion", async () => {
    const resource = {
      id: ids.resource,
      certificationId: ids.cert,
      categoryId: ids.category,
      url: "https://learn.example/old",
      title: "Old title",
      sourceType: "doc",
      contentMode: "deep_content",
      rawContent: null,
      ingestedAt: null,
      status: "pending",
      ingestError: null,
    };
    const ingestedAt = new Date("2026-08-06T12:00:00.000Z");
    const { db, updates } = createAdminDb({
      resources: [resource],
      returningByTable: {
        certdrill_learn_resources: [{
          ...resource,
          url: "https://learn.example/guide",
          title: "Study guide",
          rawContent: "Skills measured",
          ingestedAt,
          status: "ingested",
          ingestError: null,
        }],
      },
    });
    const resourceIngestor = {
      ingest: vi.fn().mockResolvedValue({
        finalUrl: "https://learn.example/guide",
        title: "Study guide",
        rawContent: "Skills measured",
        contentType: "text/html",
        ingestedAt,
      }),
    };
    const service = createCertDrillAdminService({ db, resourceIngestor });

    await expect(service.ingestResource(ids.resource)).resolves.toMatchObject({
      id: ids.resource,
      status: "ingested",
      title: "Study guide",
    });

    expect(resourceIngestor.ingest).toHaveBeenCalledWith("https://learn.example/old");
    expect(updates.at(-1)?.values).toMatchObject({
      url: "https://learn.example/guide",
      title: "Study guide",
      rawContent: "Skills measured",
      ingestedAt,
      status: "ingested",
      ingestError: null,
    });
  });

  it("returns not found when the resource update affects no rows after ingestion", async () => {
    const resource = {
      id: ids.resource,
      certificationId: ids.cert,
      categoryId: ids.category,
      url: "https://learn.example/old",
      title: "Old title",
      sourceType: "doc",
      contentMode: "deep_content",
      rawContent: null,
      ingestedAt: null,
      status: "pending",
      ingestError: null,
    };
    const { db } = createAdminDb({
      resources: [resource],
      returningByTable: {
        certdrill_learn_resources: [],
      },
    });
    const resourceIngestor = {
      ingest: vi.fn().mockResolvedValue({
        finalUrl: "https://learn.example/guide",
        title: "Study guide",
        rawContent: "Skills measured",
        contentType: "text/html",
        ingestedAt: new Date("2026-08-06T12:00:00.000Z"),
      }),
    };
    const service = createCertDrillAdminService({ db, resourceIngestor });
    const ingestion = service.ingestResource(ids.resource);

    await expect(ingestion).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND",
      message: "Resource not found.",
    });
    await ingestion.catch((error) => {
      expect(error).not.toBeUndefined();
    });
    expect(resourceIngestor.ingest).toHaveBeenCalledWith("https://learn.example/old");
  });

  it("retains the existing title when ingestion does not extract one", async () => {
    const resource = {
      id: ids.resource,
      certificationId: ids.cert,
      categoryId: ids.category,
      url: "https://learn.example/old",
      title: "Old title",
      sourceType: "doc",
      contentMode: "deep_content",
      rawContent: null,
      ingestedAt: null,
      status: "pending",
      ingestError: null,
    };
    const ingestedAt = new Date("2026-08-06T12:00:00.000Z");
    const { db, updates } = createAdminDb({
      resources: [resource],
      returningByTable: {
        certdrill_learn_resources: [{
          ...resource,
          url: "https://learn.example/guide",
          rawContent: "Skills measured",
          ingestedAt,
          status: "ingested",
          ingestError: null,
        }],
      },
    });
    const service = createCertDrillAdminService({
      db,
      resourceIngestor: {
        ingest: vi.fn().mockResolvedValue({
          finalUrl: "https://learn.example/guide",
          title: "   ",
          rawContent: "Skills measured",
          contentType: "text/html",
          ingestedAt,
        }),
      },
    });

    await expect(service.ingestResource(ids.resource)).resolves.toMatchObject({
      id: ids.resource,
      status: "ingested",
      title: "Old title",
    });

    expect(updates.at(-1)?.values).toMatchObject({
      title: "Old title",
    });
  });

  it("preserves the previous snapshot when a resource refresh fails", async () => {
    const previousIngestedAt = new Date("2026-08-05T12:00:00.000Z");
    const { db, updates } = createAdminDb({
      resources: [{
        id: ids.resource,
        certificationId: ids.cert,
        categoryId: ids.category,
        url: "https://learn.example/guide",
        title: "Study guide",
        sourceType: "doc",
        contentMode: "deep_content",
        rawContent: "Previous snapshot",
        ingestedAt: previousIngestedAt,
        status: "ingested",
        ingestError: null,
      }],
    });
    const service = createCertDrillAdminService({
      db,
      resourceIngestor: {
        ingest: vi.fn().mockRejectedValue(new Error("Resource returned HTTP 503.")),
      },
    });

    await expect(service.ingestResource(ids.resource)).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_RESOURCE_INGESTION_FAILED",
      message: "Resource returned HTTP 503.",
    });

    expect(updates.at(-1)?.values).toMatchObject({
      status: "failed",
      ingestError: "Resource returned HTTP 503.",
    });
    expect(updates.at(-1)?.values).not.toHaveProperty("rawContent");
    expect(updates.at(-1)?.values).not.toHaveProperty("ingestedAt");
  });

  it("rejects ingestion for an unknown resource", async () => {
    const resourceIngestor = { ingest: vi.fn() };
    const { db } = createAdminDb({ resources: [] });
    const service = createCertDrillAdminService({ db, resourceIngestor });

    await expect(service.ingestResource(ids.resource)).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_RESOURCE_NOT_FOUND",
    });

    expect(resourceIngestor.ingest).not.toHaveBeenCalled();
  });

  it("allows nullable question and resource references to be explicitly cleared", async () => {
    const { db, updates } = createAdminDb({
      categoryById: { id: ids.category, certificationId: ids.cert },
      questionById: createQuestion({ sourceResourceId: ids.resource }),
      resources: [{ id: ids.resource, certificationId: ids.cert, categoryId: ids.category, url: "https://docs.example.com", title: "Docs", sourceType: "doc", contentMode: "deep_content", status: "pending" }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateQuestion(ids.question, { sourceResourceId: null })).resolves.toMatchObject({ id: expect.any(String) });
    await expect(service.updateResource(ids.resource, { categoryId: null })).resolves.toMatchObject({ id: expect.any(String) });

    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: "certdrill_questions", values: expect.objectContaining({ sourceResourceId: null }) }),
      expect.objectContaining({ table: "certdrill_learn_resources", values: expect.objectContaining({ categoryId: null }) }),
    ]));
  });

  it("rejects question source resource and generation job references outside the certification", async () => {
    const { db, inserts, updates } = createAdminDb({
      categoryById: { id: ids.category, certificationId: ids.cert },
      queryRowsByTable: {
        certdrill_learn_resources: [],
        certdrill_question_generation_jobs: [],
      },
      questionById: createQuestion({ status: "draft", sourceResourceId: null, generationJobId: null }),
      questions: [{ id: ids.question, certificationId: ids.cert }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createQuestion({
      ...questionInput(),
      sourceResourceId: ids.otherResource,
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Question source resource must belong to the certification",
    });
    await expect(service.updateQuestion(ids.question, { generationJobId: ids.otherGenerationJob })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Question generation job must belong to the certification",
    });

    expect(inserts).toEqual([]);
    expect(updates).toEqual([]);
  });


  it("publishes selected questions in one transaction after validating every question", async () => {
    const firstQuestion = createQuestion({ id: ids.question, status: "draft" });
    const secondQuestion = createQuestion({ id: ids.otherQuestion, status: "draft" });
    const { db, updates, transactions } = createAdminDb({
      questions: [firstQuestion, secondQuestion],
      returningByTable: {
        certdrill_questions: [
          { ...firstQuestion, status: "published" },
          { ...secondQuestion, status: "published" },
        ],
      },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateQuestionStatuses({
      questionIds: [ids.question, ids.otherQuestion],
      status: "published",
    })).resolves.toEqual([
      expect.objectContaining({ id: ids.question, status: "published" }),
      expect.objectContaining({ id: ids.otherQuestion, status: "published" }),
    ]);

    expect(updates).toEqual([
      expect.objectContaining({
        table: "certdrill_questions",
        values: expect.objectContaining({ status: "published", updatedAt: expect.any(Date) }),
      }),
    ]);
    expect(transactions).toHaveLength(1);
  });

  it("rejects bulk unpublish atomically when a selected question is in an active exam form", async () => {
    const { db, updates } = createAdminDb({
      questions: [
        createQuestion({ id: ids.question, status: "published" }),
        createQuestion({ id: ids.otherQuestion, status: "published" }),
      ],
      activeExamFormsContainingQuestion: [{ id: ids.examForm, name: "Active Form" }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateQuestionStatuses({
      questionIds: [ids.question, ids.otherQuestion],
      status: "draft",
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE",
      message: "Question is assigned to active exam form: Active Form. Deactivate or regenerate them first.",
    });

    expect(updates).toEqual([]);
  });

  it("reassigns selected questions to assessment in one transaction", async () => {
    const questions = [createQuestion({ id: ids.question }), createQuestion({ id: ids.otherQuestion })];
    const { db, updates, transactions } = createAdminDb({
      questions,
      returningByTable: { certdrill_questions: questions.map((question) => ({ ...question, deliveryPurpose: "assessment" })) },
    });

    await expect(createCertDrillAdminService({ db }).updateQuestionDeliveryPurposes({
      questionIds: [ids.question, ids.otherQuestion],
      deliveryPurpose: "assessment",
    })).resolves.toEqual([
      expect.objectContaining({ id: ids.question, deliveryPurpose: "assessment" }),
      expect.objectContaining({ id: ids.otherQuestion, deliveryPurpose: "assessment" }),
    ]);
    expect(updates.at(-1)?.values).toMatchObject({ deliveryPurpose: "assessment", updatedAt: expect.any(Date) });
    expect(transactions).toHaveLength(1);
  });

  it("rejects bulk practice reassignment when a selected question is reserved", async () => {
    const { db, updates } = createAdminDb({
      questions: [createQuestion({ id: ids.question }), createQuestion({ id: ids.otherQuestion })],
      activeExamFormsContainingQuestion: [{ id: ids.examForm, name: "Active Form" }],
    });

    await expect(createCertDrillAdminService({ db }).updateQuestionDeliveryPurposes({
      questionIds: [ids.question, ids.otherQuestion],
      deliveryPurpose: "practice",
    })).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE" });
    expect(updates).toEqual([]);
  });

  it("updates question feedback status to reviewed and resolved", async () => {
    const reviewedDb = createAdminDb({
      returningByTable: {
        certdrill_question_feedback: [questionFeedback({ status: "reviewed" })],
      },
    });
    const resolvedDb = createAdminDb({
      returningByTable: {
        certdrill_question_feedback: [questionFeedback({ status: "resolved" })],
      },
    });
    const reviewedService = createCertDrillAdminService({ db: reviewedDb.db });
    const resolvedService = createCertDrillAdminService({ db: resolvedDb.db });

    await expect(reviewedService.updateQuestionFeedback(ids.feedback, { status: "reviewed" })).resolves.toMatchObject({
      id: ids.feedback,
      status: "reviewed",
      createdAt: "2026-07-28T10:00:00.000Z",
      updatedAt: "2026-07-28T12:00:00.000Z",
    });
    await expect(resolvedService.updateQuestionFeedback(ids.feedback, { status: "resolved" })).resolves.toMatchObject({
      id: ids.feedback,
      status: "resolved",
    });

    expect(reviewedDb.updates.find((entry) => entry.table === "certdrill_question_feedback")?.values).toMatchObject({ status: "reviewed", updatedAt: expect.any(Date) });
    expect(resolvedDb.updates.find((entry) => entry.table === "certdrill_question_feedback")?.values).toMatchObject({ status: "resolved", updatedAt: expect.any(Date) });
  });

  it("creates and ingests new source URLs before queueing grounded generation", async () => {
    const createdResource = {
      id: ids.resource,
      certificationId: ids.cert,
      categoryId: ids.category,
      url: "https://docs.example.com/identity",
      title: "AZ-104 source (docs.example.com)",
      sourceType: "doc" as const,
      contentMode: "deep_content" as const,
      rawContent: null,
      ingestedAt: null,
      status: "pending" as const,
      ingestError: null,
    };
    const { db, inserts, updates } = createAdminDb({
      certifications: [{ id: ids.cert, code: "AZ-104" }],
      categoryById: { id: ids.category, certificationId: ids.cert },
      returningByTable: { certdrill_learn_resources: [createdResource] },
    });
    db.query.certdrillLearnResources.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createdResource);
    const resourceIngestor = {
      ingest: vi.fn().mockResolvedValue({
        finalUrl: createdResource.url,
        title: "Identity documentation",
        rawContent: "Grounded identity content",
        contentType: "text/html" as const,
        ingestedAt: new Date("2026-08-09T12:00:00.000Z"),
      }),
    };
    const questionGeneration = {
      start: vi.fn().mockResolvedValue({ id: ids.generationJob, status: "pending" }),
      get: vi.fn(),
      list: vi.fn(),
      processPending: vi.fn(),
    };
    const service = createCertDrillAdminService({ db, resourceIngestor, questionGeneration });
    const config = { focus: "Identity", systemInstructions: "Use detailed answer choices.", instructions: null, questionTypes: ["single_choice"] as const, difficultyMix: { easy: 20, medium: 60, hard: 20 }, deliveryPurpose: "practice" as const };

    await expect(service.startQuestionGeneration({
      certificationId: ids.cert,
      categoryId: null,
      resourceIds: [],
      sourceUrls: [createdResource.url],
      requestedCount: 5,
      config,
    })).resolves.toEqual({ id: ids.generationJob, status: "pending" });

    expect(inserts.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({
      certificationId: ids.cert,
      categoryId: null,
      url: createdResource.url,
      sourceType: "doc",
      contentMode: "deep_content",
      status: "pending",
    });
    expect(resourceIngestor.ingest).toHaveBeenCalledWith(createdResource.url);
    expect(updates.find((entry) => entry.table === "certdrill_learn_resources")?.values).toMatchObject({
      rawContent: "Grounded identity content",
      status: "ingested",
      ingestError: null,
    });
    expect(questionGeneration.start).toHaveBeenCalledWith({
      certificationId: ids.cert,
      categoryId: null,
      resourceIds: [ids.resource],
      requestedCount: 5,
      config,
    });
  });

  it("creates, lists, updates, validates, publishes, and archives scenario definitions", async () => {
    const contentJson = {
      initialNodeKey: "start",
      nodes: [{
        key: "start",
        title: "Start",
        situation: "Choose a response.",
        evidence: ["Signal"],
        options: [
          { key: "a", title: "A", description: "Action A", consequence: "Outcome A", nextNodeKey: null },
          { key: "b", title: "B", description: "Action B", consequence: "Outcome B", nextNodeKey: null },
        ],
      }],
    };
    const scenario = { id: ids.scenario, certificationId: ids.cert, title: "Incident", description: null, difficulty: "medium", estimatedMinutes: 15, status: "draft" as const, contentJson };
    const validated = { ...scenario, status: "validated" as const, validatedAt: new Date() };
    const { db, inserts, updates, deletes } = createAdminDb({
      certifications: [{ id: ids.cert }],
      scenarios: [scenario],
      scenarioAssignments: [],
      returningByTable: { certdrill_scenarios: [scenario] },
    });
    const service = createCertDrillAdminService({ db });
    const input = { certificationId: ids.cert, title: scenario.title, description: null, difficulty: "medium" as const, estimatedMinutes: 15, contentJson };

    await expect(service.createScenario(input)).resolves.toMatchObject({ id: ids.scenario, status: "draft", examFormIds: [] });
    await expect(service.listScenarios(ids.cert)).resolves.toEqual([{ ...scenario, examFormIds: [] }]);
    const { certificationId: _certificationId, ...updateInput } = input;
    await expect(service.updateScenario(ids.scenario, updateInput)).resolves.toMatchObject({ id: ids.scenario });
    db.update = (table: Table) => ({ set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...validated, ...values }] }) }) });
    await expect(service.validateScenario(ids.scenario)).resolves.toMatchObject({ id: ids.scenario, status: "validated" });
    await expect(service.publishScenario(ids.scenario)).resolves.toMatchObject({ id: ids.scenario, status: "published" });
    await expect(service.updateScenarioStatuses({ scenarioIds: [ids.scenario], status: "draft" })).resolves.toEqual([
      expect.objectContaining({ id: ids.scenario, status: "draft" }),
    ]);

    await expect(service.archiveScenario(ids.scenario)).resolves.toMatchObject({ id: ids.scenario, status: "archived" });
    expect(inserts.some((entry) => entry.table === "certdrill_scenarios")).toBe(true);
    expect(updates.some((entry) => entry.table === "certdrill_scenarios" && entry.values.status === "draft")).toBe(true);
    expect(deletes).toContain("certdrill_exam_form_scenarios");
  });

  it("assigns only published same-certification scenarios to an inactive exam form", async () => {
    const scenario = { id: ids.scenario, certificationId: ids.cert, status: "published", contentJson: { initialNodeKey: "start", nodes: [] } };
    const form = generatedExamForm({ isActive: false });
    const { db, inserts, deletes, transactions } = createAdminDb({ examForms: [form], scenarios: [scenario], scenarioAssignments: [] });
    const service = createCertDrillAdminService({ db });

    await expect(service.setExamFormScenarios(ids.examForm, [ids.scenario])).resolves.toMatchObject({ id: ids.examForm, scenarioIds: [ids.scenario] });
    expect(deletes).toContain("certdrill_exam_form_scenarios");
    expect(inserts.find((entry) => entry.table === "certdrill_exam_form_scenarios")?.values).toMatchObject({ examFormId: ids.examForm, scenarioId: ids.scenario, sortOrder: 0 });
    expect(transactions).toHaveLength(1);
  });

  it("blocks unpublishing scenarios assigned to active exam forms", async () => {
    const scenario = { id: ids.scenario, certificationId: ids.cert, status: "published", contentJson: { initialNodeKey: "start", nodes: [] } };
    const form = generatedExamForm({ isActive: true, name: "Live assessment" });
    const { db, updates, deletes } = createAdminDb({
      examForms: [form],
      scenarios: [scenario],
      scenarioAssignments: [{ scenarioId: ids.scenario, examFormId: ids.examForm }],
    });
    const service = createCertDrillAdminService({ db });
    await expect(service.archiveScenario(ids.scenario)).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_SCENARIO_IN_ACTIVE_FORM",
      message: expect.stringContaining("Deactivate assigned exam forms"),
    });

    await expect(service.updateScenarioStatuses({ scenarioIds: [ids.scenario], status: "draft" })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_SCENARIO_IN_ACTIVE_FORM",
      message: expect.stringContaining("Deactivate assigned exam forms"),
    });
    expect(updates).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("rejects invalid scenario graphs during validation", async () => {
    const scenario = {
      id: ids.scenario,
      certificationId: ids.cert,
      status: "draft" as const,
      contentJson: {
        initialNodeKey: "missing",
        nodes: [{ key: "start", title: "Start", situation: "Choose.", evidence: [], options: [
          { key: "a", title: "A", description: "A", consequence: "A", nextNodeKey: null },
          { key: "b", title: "B", description: "B", consequence: "B", nextNodeKey: null },
        ] }],
      },
    };
    const { db, updates } = createAdminDb({ scenarios: [scenario] });
    const service = createCertDrillAdminService({ db });

    await expect(service.validateScenario(ids.scenario)).rejects.toMatchObject({ code: "CERTDRILL_ADMIN_SCENARIO_INVALID", details: [expect.stringContaining("does not exist")] });
    expect(updates).toEqual([]);
  });

  it("transactionally resets attempts and missed-question review state for a user", async () => {
    const { db, deletes, transactions } = createAdminDb({
      returningByTable: {
        certdrill_exam_attempts: [{ id: "attempt-1" }, { id: "attempt-2" }],
        certdrill_review_queue: [{ id: "review-1" }],
      },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.resetUserProgress(ids.user)).resolves.toEqual({
      deletedAttemptCount: 2,
      deletedReviewItemCount: 1,
    });
    expect(deletes).toEqual(expect.arrayContaining(["certdrill_exam_attempts", "certdrill_review_queue"]));
    expect(transactions).toHaveLength(1);
  });

});

type InsertEntry = { table: string; values: Record<string, unknown> };
type UpdateEntry = { table: string; values: Record<string, unknown> };

function createAdminDb(input: {
  certifications?: unknown[];
  categories?: unknown[];
  categoryFindManyResults?: unknown[][];
  categoryById?: unknown;
  questionById?: unknown;
  questions?: unknown[];
  examForms?: unknown[];
  resources?: unknown[];
  generationJobs?: unknown[];
  questionFeedback?: unknown[];
  scenarios?: unknown[];
  scenarioAssignments?: unknown[];
  queryRowsByTable?: Record<string, unknown[]>;
  returningByTable?: Record<string, unknown[]>;
  activeExamFormsContainingQuestion?: unknown[];
}) {
  const inserts: InsertEntry[] = [];
  const updates: UpdateEntry[] = [];
  const deletes: string[] = [];
  const transactions: boolean[] = [];

  const findMany = (tableName: string, rows: unknown[] = []) => vi.fn().mockResolvedValue(input.queryRowsByTable?.[tableName] ?? rows);
  const categoryFindMany = input.categoryFindManyResults
    ? vi.fn().mockImplementation(() => Promise.resolve(input.categoryFindManyResults?.shift() ?? []))
    : findMany("certdrill_exam_categories", input.categories);
  const db = {
    query: {
      certdrillCertifications: { findMany: findMany("certdrill_certifications", input.certifications), findFirst: vi.fn().mockResolvedValue(input.certifications?.[0] ?? null) },
      certdrillExamCategories: { findMany: categoryFindMany, findFirst: vi.fn().mockResolvedValue(input.categoryById ?? null) },
      certdrillQuestions: { findMany: findMany("certdrill_questions", input.questions ?? (input.questionById ? [input.questionById] : [])), findFirst: vi.fn().mockResolvedValue(input.questionById ?? null) },
      certdrillExamForms: { findMany: input.activeExamFormsContainingQuestion ? vi.fn().mockResolvedValue(input.activeExamFormsContainingQuestion) : findMany("certdrill_exam_forms", input.examForms), findFirst: vi.fn().mockResolvedValue(input.examForms?.[0] ?? null) },
      certdrillLearnResources: { findMany: findMany("certdrill_learn_resources", input.resources), findFirst: vi.fn().mockResolvedValue(input.resources?.[0] ?? null) },
      certdrillQuestionGenerationJobs: { findMany: findMany("certdrill_question_generation_jobs", input.generationJobs), findFirst: vi.fn().mockResolvedValue(input.generationJobs?.[0] ?? null) },
      certdrillQuestionFeedback: { findMany: findMany("certdrill_question_feedback", input.questionFeedback), findFirst: vi.fn().mockResolvedValue(input.questionFeedback?.[0] ?? null) },
      certdrillScenarios: { findMany: findMany("certdrill_scenarios", input.scenarios), findFirst: vi.fn().mockResolvedValue(input.scenarios?.[0] ?? null) },
      certdrillExamFormScenarios: { findMany: findMany("certdrill_exam_form_scenarios", input.scenarioAssignments), findFirst: vi.fn().mockResolvedValue(input.scenarioAssignments?.[0] ?? null) },
    },
    insert: (table: Table) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        const tableName = getTableName(table);
        const rows = Array.isArray(values) ? values : [values];
        for (const row of rows) inserts.push({ table: tableName, values: row });
        return {
          returning: vi.fn().mockResolvedValue(
            input.returningByTable && tableName in input.returningByTable
              ? input.returningByTable[tableName]
              : rows.map((row) => ({ id: `${tableName}-${inserts.length}`, ...row })),
          ),
        };
      },
    }),
    update: (table: Table) => ({
      set: (values: Record<string, unknown>) => {
        const tableName = getTableName(table);
        updates.push({ table: tableName, values });
        return {
          where: vi.fn(() => ({
            returning: vi.fn().mockResolvedValue(
              input.returningByTable && tableName in input.returningByTable
                ? input.returningByTable[tableName]
                : [{ id: `${tableName}-updated`, ...values }],
            ),
          })),
        };
      },
    }),
    delete: (table: Table) => {
      const tableName = getTableName(table);
      deletes.push(tableName);
      return {
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue(input.returningByTable?.[tableName] ?? []),
        })),
      };
    },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      transactions.push(true);
      return callback(db);
    }),
    execute: vi.fn().mockResolvedValue([]),
  };

  return { db, inserts, updates, deletes, transactions };
}

const weightedCategories = [
  { id: ids.category, certificationId: ids.cert, name: "Domain A", parentCategoryId: null, weightPct: "50.00", sortOrder: 1, archivedAt: null },
  { id: ids.siblingCategory, certificationId: ids.cert, name: "Domain B", parentCategoryId: null, weightPct: "50.00", sortOrder: 2, archivedAt: null },
];

const publishedQuestions = [
  { id: ids.question, certificationId: ids.cert, categoryId: ids.category, status: "published" as const },
  { id: ids.otherQuestion, certificationId: ids.cert, categoryId: ids.siblingCategory, status: "published" as const },
];

function generatedExamForm(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.examForm,
    certificationId: ids.cert,
    name: "Form A",
    description: null,
    sortOrder: 1,
    isActive: false,
    durationMinutes: 120,
    targetQuestionCount: 2,
    questionIds: [ids.question, ids.otherQuestion],
    assignmentVersion: 1,
    allocationSnapshot: [
      { categoryId: ids.category, categoryName: "Domain A", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
      { categoryId: ids.siblingCategory, categoryName: "Domain B", weightPct: "50.00", allocatedCount: 1, assignedCount: 1 },
    ],
    generatedAt: new Date(),
    ...overrides,
  };
}

function questionInput() {
  return {
    certificationId: ids.cert,
    categoryId: ids.category,
    stem: "Which AWS IAM design follows least privilege?",
    mediaAssets: [],
    difficulty: "medium" as const,
    status: "draft" as const,
    createdBy: "admin" as const,
    options: [
      { text: "Grant only required actions", mediaAssets: [], isCorrect: true, explanation: "Least privilege grants only required actions.", citationUrls: ["https://docs.example.com/iam"], sortOrder: 0 },
      { text: "Grant administrator access", mediaAssets: [], isCorrect: false, explanation: "Administrator access is broader than needed.", citationUrls: ["https://docs.example.com/iam"], sortOrder: 1 },
    ],
  };
}

function createQuestion(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.question,
    ...questionInput(),
    options: [
      { id: ids.optionA, ...questionInput().options[0] },
      { id: ids.optionB, ...questionInput().options[1] },
    ],
    ...overrides,
  };
}

function questionFeedback(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.feedback,
    userId: "user-1",
    questionId: ids.question,
    examAttemptId: null,
    rating: 2,
    disputeCorrectAnswer: true,
    message: "This answer looked wrong.",
    status: "open",
    createdAt: new Date("2026-07-28T10:00:00.000Z"),
    updatedAt: new Date("2026-07-28T12:00:00.000Z"),
    ...overrides,
  };
}
