import { getTableName, type Table } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";

import { createCertDrillAdminService } from "../../../src/modules/certdrill/admin-service";

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

  it("delegates blueprint parse lifecycle calls to the focused parse service", async () => {
    const { db } = createAdminDb({});
    const start = vi.fn().mockResolvedValue({ id: "run-1", status: "pending" });
    const get = vi.fn().mockResolvedValue({ id: "run-1", status: "completed" });
    const list = vi.fn().mockResolvedValue([{ id: "run-1", status: "completed" }]);
    const processPending = vi.fn().mockResolvedValue({ checked: 2, completed: 1, failed: 1 });
    const service = createCertDrillAdminService({
      db,
      blueprintParse: { start, get, list, processPending },
    } as never);

    await expect(service.startBlueprintParseRun({ certificationId: ids.cert, resourceId: ids.resource })).resolves.toEqual({
      id: "run-1",
      status: "pending",
    });
    await expect(service.getBlueprintParseRun("run-1")).resolves.toEqual({
      id: "run-1",
      status: "completed",
    });
    await expect(service.listBlueprintParseRuns(ids.cert)).resolves.toEqual([
      { id: "run-1", status: "completed" },
    ]);
    await expect(service.processPendingBlueprintParseRuns(2)).resolves.toEqual({
      checked: 2,
      completed: 1,
      failed: 1,
    });

    expect(start).toHaveBeenCalledWith({ certificationId: ids.cert, resourceId: ids.resource });
    expect(get).toHaveBeenCalledWith("run-1");
    expect(list).toHaveBeenCalledWith(ids.cert);
    expect(processPending).toHaveBeenCalledWith(2);
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

    expect(inserts.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({ code: "D2", weightPct: "40.00" });
    expect(updates.find((entry) => entry.table === "certdrill_exam_categories")?.values).toMatchObject({ name: "Domain 2 updated", weightPct: "40.00" });
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

  it("creates, lists, and updates exam forms", async () => {
    const { db, inserts, updates } = createAdminDb({
      questions: [{ id: ids.question, certificationId: ids.cert }],
      examForms: [{ id: ids.examForm, certificationId: ids.cert, name: "Form A", questionIds: [ids.question], durationMinutes: 120, isActive: true, sortOrder: 1 }],
      returningByTable: { certdrill_exam_forms: [{ id: ids.examForm, name: "Form A" }] },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createExamForm({ certificationId: ids.cert, name: "Form A", description: null, sortOrder: 1, isActive: true, durationMinutes: 120, questionIds: [ids.question] })).resolves.toEqual({ id: ids.examForm, name: "Form A" });
    await expect(service.listExamForms(ids.cert)).resolves.toEqual([{ id: ids.examForm, certificationId: ids.cert, name: "Form A", questionIds: [ids.question], durationMinutes: 120, isActive: true, sortOrder: 1 }]);
    await expect(service.updateExamForm(ids.examForm, { isActive: false })).resolves.toEqual({ id: ids.examForm, name: "Form A" });

    expect(inserts.find((entry) => entry.table === "certdrill_exam_forms")?.values).toMatchObject({ name: "Form A", questionIds: [ids.question] });
    expect(updates.find((entry) => entry.table === "certdrill_exam_forms")?.values).toMatchObject({ isActive: false });
  });

  it("rejects exam forms with question ids outside the certification", async () => {
    const { db, inserts } = createAdminDb({
      questions: [{ id: ids.question, certificationId: ids.cert }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createExamForm({ certificationId: ids.cert, name: "Form A", questionIds: [ids.question, ids.otherQuestion] })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Exam form question IDs must belong to the certification",
    });

    expect(inserts).toEqual([]);
  });

  it("rejects exam form certification changes when existing question ids belong to another certification", async () => {
    const { db, updates } = createAdminDb({
      questions: [{ id: ids.question, certificationId: ids.cert }],
      examForms: [{ id: ids.examForm, certificationId: ids.cert, name: "Form A", questionIds: [ids.question], durationMinutes: 120, isActive: true, sortOrder: 1 }],
      queryRowsByTable: {
        certdrill_questions: [],
      },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.updateExamForm(ids.examForm, { certificationId: ids.otherCert })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Exam form question IDs must belong to the certification",
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

  it("creates a mock generation job and deterministic draft questions", async () => {
    const { db, inserts, transactions } = createAdminDb({
      categories: [{ id: ids.category, certificationId: ids.cert }],
      categoryById: { id: ids.category, certificationId: ids.cert },
      resources: [{ id: ids.resource, certificationId: ids.cert }],
      returningByTable: {
        certdrill_question_generation_jobs: [{ id: ids.generationJob, status: "completed" }],
        certdrill_questions: [{ id: ids.question, status: "draft" }],
      },
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createMockGenerationJob({
      certificationId: ids.cert,
      categoryId: ids.category,
      prompt: "Cover IAM least privilege",
      topic: "IAM",
      requestedCount: 2,
      resourceIds: [ids.resource],
    })).resolves.toEqual({ job: { id: ids.generationJob, status: "completed" }, generatedQuestions: [{ id: ids.question, status: "draft" }, { id: ids.question, status: "draft" }] });

    expect(inserts.find((entry) => entry.table === "certdrill_question_generation_jobs")?.values).toMatchObject({
      certificationId: ids.cert,
      categoryId: ids.category,
      requestedCount: 2,
      provider: "mock",
      status: "completed",
      generatedCount: 2,
    });
    expect(inserts.filter((entry) => entry.table === "certdrill_questions")).toEqual([
      expect.objectContaining({ values: expect.objectContaining({ stem: "Mock IAM question 1: Cover IAM least privilege", status: "draft", createdBy: "ai", generationJobId: ids.generationJob }) }),
      expect.objectContaining({ values: expect.objectContaining({ stem: "Mock IAM question 2: Cover IAM least privilege", status: "draft", createdBy: "ai", generationJobId: ids.generationJob }) }),
    ]);
    expect(inserts.filter((entry) => entry.table === "certdrill_answer_options")).toHaveLength(8);
    expect(transactions).toHaveLength(1);
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

  it("rejects mock generation resource ids outside the certification", async () => {
    const { db, inserts } = createAdminDb({
      categoryById: { id: ids.category, certificationId: ids.cert },
      resources: [{ id: ids.resource, certificationId: ids.cert }],
    });
    const service = createCertDrillAdminService({ db });

    await expect(service.createMockGenerationJob({
      certificationId: ids.cert,
      categoryId: ids.category,
      prompt: "Cover IAM least privilege",
      topic: "IAM",
      requestedCount: 1,
      resourceIds: [ids.resource, ids.otherResource],
    })).rejects.toMatchObject({
      code: "CERTDRILL_ADMIN_CROSS_CERT_REFERENCE",
      message: "Generation resource IDs must belong to the certification",
    });

    expect(inserts).toEqual([]);
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
  queryRowsByTable?: Record<string, unknown[]>;
  returningByTable?: Record<string, unknown[]>;
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
      certdrillExamForms: { findMany: findMany("certdrill_exam_forms", input.examForms), findFirst: vi.fn().mockResolvedValue(input.examForms?.[0] ?? null) },
      certdrillLearnResources: { findMany: findMany("certdrill_learn_resources", input.resources), findFirst: vi.fn().mockResolvedValue(input.resources?.[0] ?? null) },
      certdrillQuestionGenerationJobs: { findMany: findMany("certdrill_question_generation_jobs", input.generationJobs), findFirst: vi.fn().mockResolvedValue(input.generationJobs?.[0] ?? null) },
      certdrillQuestionFeedback: { findMany: findMany("certdrill_question_feedback", input.questionFeedback), findFirst: vi.fn().mockResolvedValue(input.questionFeedback?.[0] ?? null) },
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
      deletes.push(getTableName(table));
      return { where: vi.fn().mockResolvedValue(undefined) };
    },
    transaction: vi.fn(async (callback: (tx: unknown) => unknown) => {
      transactions.push(true);
      return callback(db);
    }),
  };

  return { db, inserts, updates, deletes, transactions };
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
