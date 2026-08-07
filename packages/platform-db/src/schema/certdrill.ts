import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  decimal,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import { user } from "./auth";
import { createdAt, id, updatedAt } from "./helpers";

export type CertDrillFeedbackMode = "practice" | "exam";
export type CertDrillSelectionMode = "category_focus" | "weighted_random";
export type CertDrillTestMode = "practice" | "exam";
export type CertDrillTestVariant =
  | "quick_drill"
  | "category_drill"
  | "exam_simulation"
  | "exam_form"
  | "missed_review"
  | "weak_areas";
export type CertDrillConfidence = "guessed" | "somewhat_sure" | "confident";
export type CertDrillAttemptStatus = "in_progress" | "completed" | "abandoned";
export type CertDrillQuestionStatus = "draft" | "published" | "archived";
export type CertDrillDifficulty = "easy" | "medium" | "hard";
export type CertDrillResourceStatus = "pending" | "ingested" | "failed";
export type CertDrillContentMode = "deep_content" | "outline_blueprint";
export type CertDrillSourceType = "module" | "unit" | "study-guide" | "exam-blueprint" | "doc";
export type CertDrillBlueprintParseStatus = "pending" | "running" | "completed" | "failed";
export type CertDrillBlueprintConfidence = "high" | "medium" | "low";
export type CertDrillJobStatus = "pending" | "running" | "completed" | "failed" | "cancelled";
export type CertDrillReviewQueueReason = "incorrect" | "low_confidence" | "incorrect_low_confidence";
export type CertDrillReviewQueueStatus = "active" | "completed" | "dismissed";
export type CertDrillExamFormAllocation = {
  categoryId: string;
  categoryName: string;
  weightPct: string;
  allocatedCount: number;
  assignedCount: number;
};

export const certdrillVendors = pgTable(
  "certdrill_vendors",
  {
    id,
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    logoUrl: text("logo_url"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_vendors_is_active_idx").on(table.isActive),
    index("certdrill_vendors_sort_order_idx").on(table.sortOrder),
  ],
);
export type CertDrillQuestionFeedbackStatus = "open" | "reviewed" | "resolved";

export const certdrillCertifications = pgTable(
  "certdrill_certifications",
  {
    id,
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    vendor: text("vendor").notNull(),
    vendorId: uuid("vendor_id").references(() => certdrillVendors.id, { onDelete: "set null" }),
    logoUrl: text("logo_url"),
    blueprintSourceUrl: text("blueprint_source_url"),
    description: text("description"),
    questionCountDefault: integer("question_count_default").notNull(),
    quickDrillQuestionCount: integer("quick_drill_question_count").default(10).notNull(),
    categoryDrillQuestionCount: integer("category_drill_question_count").default(10).notNull(),
    examSimulationQuestionCount: integer("exam_simulation_question_count"),
    examSimulationDurationMinutes: integer("exam_simulation_duration_minutes").default(120).notNull(),
    passThresholdPct: integer("pass_threshold_pct").notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    enabledAt: timestamp("enabled_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_certifications_is_active_idx").on(table.isActive),
    index("certdrill_certifications_enabled_at_idx").on(table.enabledAt),
    index("certdrill_certifications_archived_at_idx").on(table.archivedAt),
    index("certdrill_certifications_vendor_id_idx").on(table.vendorId),
  ],
);

export const certdrillExamCategories = pgTable(
  "certdrill_exam_categories",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    parentCategoryId: uuid("parent_category_id").references(
      (): AnyPgColumn => certdrillExamCategories.id,
      { onDelete: "cascade" },
    ),
    code: text("code").notNull(),
    name: text("name").notNull(),
    weightPct: decimal("weight_pct", { precision: 5, scale: 2 }),
    drillQuestionCount: integer("drill_question_count"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_exam_categories_certification_id_idx").on(table.certificationId),
    index("certdrill_exam_categories_parent_category_id_idx").on(table.parentCategoryId),
    index("certdrill_exam_categories_archived_at_idx").on(table.archivedAt),
    uniqueIndex("certdrill_exam_categories_cert_code_idx").on(table.certificationId, table.code),
  ],
);

export const certdrillLearnResources = pgTable(
  "certdrill_learn_resources",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: uuid("category_id").references(() => certdrillExamCategories.id, { onDelete: "set null" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    sourceType: text("source_type").$type<CertDrillSourceType>().notNull(),
    contentMode: text("content_mode").$type<CertDrillContentMode>().notNull(),
    rawContent: text("raw_content"),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }),
    status: text("status").$type<CertDrillResourceStatus>().default("pending").notNull(),
    ingestError: text("ingest_error"),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_learn_resources_certification_id_idx").on(table.certificationId),
    index("certdrill_learn_resources_category_id_idx").on(table.categoryId),
    index("certdrill_learn_resources_status_idx").on(table.status),
  ],
);

export const certdrillBlueprintParseRuns = pgTable(
  "certdrill_blueprint_parse_runs",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    resourceId: uuid("resource_id")
      .references(() => certdrillLearnResources.id, { onDelete: "cascade" })
      .notNull(),
    status: text("status").$type<CertDrillBlueprintParseStatus>().default("pending").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    contentChecksum: text("content_checksum").notNull(),
    proposalJson: jsonb("proposal_json"),
    rawOutput: text("raw_output"),
    confidence: text("confidence").$type<CertDrillBlueprintConfidence>(),
    warningsJson: jsonb("warnings_json").default(sql`'[]'::jsonb`).notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_blueprint_parse_runs_certification_id_idx").on(table.certificationId),
    index("certdrill_blueprint_parse_runs_resource_id_idx").on(table.resourceId),
    index("certdrill_blueprint_parse_runs_status_idx").on(table.status),
  ],
);

export const certdrillHandoffRuns = pgTable(
  "certdrill_handoff_runs",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    blueprintUrl: text("blueprint_url").notNull(),
    requestedByUserId: uuid("requested_by_user_id")
      .references(() => user.id, { onDelete: "restrict" })
      .notNull(),
    status: text("status").$type<CertDrillJobStatus>().default("pending").notNull(),
    modelStrategy: text("model_strategy").notNull(),
    modelPrimary: text("model_primary").notNull(),
    modelSecondary: text("model_secondary"),
    targetQuestionsPerDomain: integer("target_questions_per_domain").notNull(),
    provider: text("provider").default("inngest").notNull(),
    providerRunId: text("provider_run_id"),
    providerRunUrl: text("provider_run_url"),
    progressJson: jsonb("progress_json"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_handoff_runs_certification_id_idx").on(table.certificationId),
    index("certdrill_handoff_runs_status_idx").on(table.status),
  ],
);

export const certdrillQuestionGenerationJobs = pgTable(
  "certdrill_question_generation_jobs",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    handoffRunId: uuid("handoff_run_id").references(() => certdrillHandoffRuns.id, { onDelete: "set null" }),
    categoryId: uuid("category_id").references(() => certdrillExamCategories.id, { onDelete: "set null" }),
    resourceIds: uuid("resource_ids").array().notNull(),
    requestedCount: integer("requested_count").notNull(),
    provider: text("provider").default("inngest").notNull(),
    providerRunId: text("provider_run_id"),
    providerRunUrl: text("provider_run_url"),
    status: text("status").$type<Exclude<CertDrillJobStatus, "cancelled">>().default("pending").notNull(),
    modelUsed: text("model_used"),
    generatedCount: integer("generated_count"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_question_generation_jobs_certification_id_idx").on(table.certificationId),
    index("certdrill_question_generation_jobs_status_idx").on(table.status),
    index("certdrill_question_generation_jobs_handoff_run_id_idx").on(table.handoffRunId),
  ],
);

export const certdrillQuestions = pgTable(
  "certdrill_questions",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    categoryId: uuid("category_id")
      .references(() => certdrillExamCategories.id, { onDelete: "restrict" })
      .notNull(),
    sourceResourceId: uuid("source_resource_id").references(() => certdrillLearnResources.id, { onDelete: "set null" }),
    generationJobId: uuid("generation_job_id").references(() => certdrillQuestionGenerationJobs.id, {
      onDelete: "set null",
    }),
    stem: text("stem").notNull(),
    mediaAssets: jsonb("media_assets").default(sql`'[]'::jsonb`).notNull(),
    difficulty: text("difficulty").$type<CertDrillDifficulty>().notNull(),
    status: text("status").$type<CertDrillQuestionStatus>().default("draft").notNull(),
    createdBy: text("created_by").$type<"ai" | "admin">().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_questions_certification_status_idx").on(table.certificationId, table.status),
    index("certdrill_questions_category_id_idx").on(table.categoryId),
    index("certdrill_questions_generation_job_id_idx").on(table.generationJobId),
  ],
);

export const certdrillAnswerOptions = pgTable(
  "certdrill_answer_options",
  {
    id,
    questionId: uuid("question_id")
      .references(() => certdrillQuestions.id, { onDelete: "cascade" })
      .notNull(),
    text: text("text").notNull(),
    mediaAssets: jsonb("media_assets").default(sql`'[]'::jsonb`).notNull(),
    isCorrect: boolean("is_correct").notNull(),
    explanation: text("explanation").notNull(),
    citationUrls: text("citation_urls").array().default(sql`ARRAY[]::text[]`).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [index("certdrill_answer_options_question_id_idx").on(table.questionId)],
);

export const certdrillExamForms = pgTable(
  "certdrill_exam_forms",
  {
    id,
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sortOrder: integer("sort_order").default(0).notNull(),
    isActive: boolean("is_active").default(true).notNull(),
    durationMinutes: integer("duration_minutes").default(120).notNull(),
    targetQuestionCount: integer("target_question_count").notNull(),
    questionIds: uuid("question_ids").array().notNull(),
    assignmentVersion: integer("assignment_version").default(1).notNull(),
    allocationSnapshot: jsonb("allocation_snapshot")
      .$type<CertDrillExamFormAllocation[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    generatedAt: timestamp("generated_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_exam_forms_certification_id_idx").on(table.certificationId),
    index("certdrill_exam_forms_active_idx").on(table.isActive),
    uniqueIndex("certdrill_exam_forms_cert_sort_idx").on(table.certificationId, table.sortOrder),
    check("certdrill_exam_forms_target_question_count_positive", sql`${table.targetQuestionCount} > 0`),
    check("certdrill_exam_forms_duration_minutes_positive", sql`${table.durationMinutes} > 0`),
    check("certdrill_exam_forms_assignment_version_positive", sql`${table.assignmentVersion} > 0`),
  ],
);

export const certdrillExamAttempts = pgTable(
  "certdrill_exam_attempts",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    feedbackMode: text("feedback_mode").$type<CertDrillFeedbackMode>().notNull(),
    selectionMode: text("selection_mode").$type<CertDrillSelectionMode>().notNull(),
    testMode: text("test_mode").$type<CertDrillTestMode>().default("practice").notNull(),
    testVariant: text("test_variant").$type<CertDrillTestVariant>().default("quick_drill").notNull(),
    examFormId: uuid("exam_form_id").references(() => certdrillExamForms.id, { onDelete: "set null" }),
    confidenceEnabled: boolean("confidence_enabled").default(false).notNull(),
    categoryIds: uuid("category_ids").array(),
    questionIds: uuid("question_ids").array().notNull(),
    snapshotVersion: integer("snapshot_version").default(1).notNull(),
    questionSnapshotJson: jsonb("question_snapshot_json").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    scorePct: decimal("score_pct", { precision: 5, scale: 2 }),
    status: text("status").$type<CertDrillAttemptStatus>().default("in_progress").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_exam_attempts_user_id_idx").on(table.userId),
    index("certdrill_exam_attempts_cert_completed_status_idx").on(
      table.certificationId,
      table.completedAt,
      table.status,
    ),
    index("certdrill_exam_attempts_status_idx").on(table.status),
    index("certdrill_exam_attempts_test_mode_variant_idx").on(table.testMode, table.testVariant),
    index("certdrill_exam_attempts_expires_at_idx").on(table.expiresAt),
  ],
);

export const certdrillExamAttemptAnswers = pgTable(
  "certdrill_exam_attempt_answers",
  {
    id,
    examAttemptId: uuid("exam_attempt_id")
      .references(() => certdrillExamAttempts.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id").notNull(),
    selectedOptionId: uuid("selected_option_id").notNull(),
    isCorrect: boolean("is_correct").notNull(),
    confidence: text("confidence").$type<CertDrillConfidence>(),
    answeredAt: timestamp("answered_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_exam_attempt_answers_attempt_id_idx").on(table.examAttemptId),
    uniqueIndex("certdrill_exam_attempt_answers_attempt_question_idx").on(table.examAttemptId, table.questionId),
  ],
);

export const certdrillQuestionFeedback = pgTable(
  "certdrill_question_feedback",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => certdrillQuestions.id, { onDelete: "cascade" })
      .notNull(),
    examAttemptId: uuid("exam_attempt_id").references(() => certdrillExamAttempts.id, { onDelete: "set null" }),
    rating: integer("rating").notNull(),
    disputeCorrectAnswer: boolean("dispute_correct_answer").default(false).notNull(),
    message: text("message"),
    status: text("status").$type<CertDrillQuestionFeedbackStatus>().default("open").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_question_feedback_user_id_idx").on(table.userId),
    index("certdrill_question_feedback_question_id_idx").on(table.questionId),
    index("certdrill_question_feedback_exam_attempt_id_idx").on(table.examAttemptId),
    index("certdrill_question_feedback_status_idx").on(table.status),
    index("certdrill_question_feedback_created_at_idx").on(table.createdAt),
    check("certdrill_question_feedback_rating_range", sql`${table.rating} >= 1 AND ${table.rating} <= 5`),
    check(
      "certdrill_question_feedback_status_check",
      sql`${table.status} IN ('open', 'reviewed', 'resolved')`,
    ),
  ],
);

export const certdrillReviewQueue = pgTable(
  "certdrill_review_queue",
  {
    id,
    userId: uuid("user_id")
      .references(() => user.id, { onDelete: "cascade" })
      .notNull(),
    certificationId: uuid("certification_id")
      .references(() => certdrillCertifications.id, { onDelete: "cascade" })
      .notNull(),
    questionId: uuid("question_id")
      .references(() => certdrillQuestions.id, { onDelete: "cascade" })
      .notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    reason: text("reason").$type<CertDrillReviewQueueReason>().notNull(),
    intervalDays: integer("interval_days").default(1).notNull(),
    ease: decimal("ease", { precision: 4, scale: 2 }).default("2.50").notNull(),
    status: text("status").$type<CertDrillReviewQueueStatus>().default("active").notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("certdrill_review_queue_user_due_idx").on(table.userId, table.status, table.dueAt),
    index("certdrill_review_queue_certification_id_idx").on(table.certificationId),
    index("certdrill_review_queue_question_id_idx").on(table.questionId),
    uniqueIndex("certdrill_review_queue_user_cert_question_idx").on(
      table.userId,
      table.certificationId,
      table.questionId,
    ),
    check(
      "certdrill_review_queue_reason_check",
      sql`${table.reason} IN ('incorrect', 'low_confidence', 'incorrect_low_confidence')`,
    ),
    check(
      "certdrill_review_queue_status_check",
      sql`${table.status} IN ('active', 'completed', 'dismissed')`,
    ),
    check("certdrill_review_queue_interval_days_positive", sql`${table.intervalDays} >= 1`),
    check("certdrill_review_queue_ease_positive", sql`${table.ease} > 0`),
  ],
);

export const certdrillCertificationsRelations = relations(certdrillCertifications, ({ one, many }) => ({
  vendorRef: one(certdrillVendors, {
    fields: [certdrillCertifications.vendorId],
    references: [certdrillVendors.id],
  }),
  categories: many(certdrillExamCategories),
  questions: many(certdrillQuestions),
  attempts: many(certdrillExamAttempts),
  examForms: many(certdrillExamForms),
  reviewQueue: many(certdrillReviewQueue),
}));

export const certdrillExamCategoriesRelations = relations(certdrillExamCategories, ({ one, many }) => ({
  certification: one(certdrillCertifications, {
    fields: [certdrillExamCategories.certificationId],
    references: [certdrillCertifications.id],
  }),
  parent: one(certdrillExamCategories, {
    fields: [certdrillExamCategories.parentCategoryId],
    references: [certdrillExamCategories.id],
    relationName: "certdrillExamCategoryChildren",
  }),
  children: many(certdrillExamCategories, { relationName: "certdrillExamCategoryChildren" }),
  questions: many(certdrillQuestions),
}));

export const certdrillQuestionsRelations = relations(certdrillQuestions, ({ one, many }) => ({
  certification: one(certdrillCertifications, {
    fields: [certdrillQuestions.certificationId],
    references: [certdrillCertifications.id],
  }),
  category: one(certdrillExamCategories, {
    fields: [certdrillQuestions.categoryId],
    references: [certdrillExamCategories.id],
  }),
  options: many(certdrillAnswerOptions),
  feedback: many(certdrillQuestionFeedback),
  reviewQueue: many(certdrillReviewQueue),
}));

export const certdrillAnswerOptionsRelations = relations(certdrillAnswerOptions, ({ one }) => ({
  question: one(certdrillQuestions, {
    fields: [certdrillAnswerOptions.questionId],
    references: [certdrillQuestions.id],
  }),
}));

export const certdrillExamFormsRelations = relations(certdrillExamForms, ({ one, many }) => ({
  certification: one(certdrillCertifications, {
    fields: [certdrillExamForms.certificationId],
    references: [certdrillCertifications.id],
  }),
  attempts: many(certdrillExamAttempts),
}));

export const certdrillExamAttemptsRelations = relations(certdrillExamAttempts, ({ one, many }) => ({
  user: one(user, { fields: [certdrillExamAttempts.userId], references: [user.id] }),
  certification: one(certdrillCertifications, {
    fields: [certdrillExamAttempts.certificationId],
    references: [certdrillCertifications.id],
  }),
  examForm: one(certdrillExamForms, {
    fields: [certdrillExamAttempts.examFormId],
    references: [certdrillExamForms.id],
  }),
  answers: many(certdrillExamAttemptAnswers),
  questionFeedback: many(certdrillQuestionFeedback),
}));

export const certdrillExamAttemptAnswersRelations = relations(certdrillExamAttemptAnswers, ({ one }) => ({
  attempt: one(certdrillExamAttempts, {
    fields: [certdrillExamAttemptAnswers.examAttemptId],
    references: [certdrillExamAttempts.id],
  }),
}));

export const certdrillQuestionFeedbackRelations = relations(certdrillQuestionFeedback, ({ one }) => ({
  user: one(user, { fields: [certdrillQuestionFeedback.userId], references: [user.id] }),
  question: one(certdrillQuestions, {
    fields: [certdrillQuestionFeedback.questionId],
    references: [certdrillQuestions.id],
  }),
  examAttempt: one(certdrillExamAttempts, {
    fields: [certdrillQuestionFeedback.examAttemptId],
    references: [certdrillExamAttempts.id],
  }),
}));

export const certdrillReviewQueueRelations = relations(certdrillReviewQueue, ({ one }) => ({
  user: one(user, { fields: [certdrillReviewQueue.userId], references: [user.id] }),
  certification: one(certdrillCertifications, {
    fields: [certdrillReviewQueue.certificationId],
    references: [certdrillCertifications.id],
  }),
  question: one(certdrillQuestions, {
    fields: [certdrillReviewQueue.questionId],
    references: [certdrillQuestions.id],
  }),
}));
