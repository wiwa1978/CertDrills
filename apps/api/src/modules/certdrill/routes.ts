import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import {
  answerCertDrillQuestionRequestSchema,
  answerCertDrillScenarioRequestSchema,
  createCertDrillExamAttemptRequestSchema,
  createCertDrillQuestionFeedbackRequestSchema,
} from "@platform/contracts";
import { errorCode } from "@platform/contracts/wire";

import type { AppEnv } from "../../context";
import { badRequest, boundedValidationDetails, fail, forbidden, notFound, ok, parseJsonBody, unauthorized, validationError } from "../../lib/http";
import { CertDrillAccessDeniedError } from "./access";
import type { AdminQuestionIndexQueryInput } from "./admin-question-index";
import { CertDrillAdminServiceError, type createCertDrillAdminService } from "./admin-service";
import { BlueprintParseServiceError } from "./blueprint-parse-service";
import { measureQuestionImportDocumentBytes, QUESTION_IMPORT_MAX_DOCUMENT_BYTES, QUESTION_IMPORT_MAX_RAW_BODY_BYTES, QUESTION_IMPORT_MAX_ROWS } from "./question-import";
import { QuestionImportServiceError } from "./question-import-service";
import { QuestionGenerationServiceError } from "./question-generation-service";
import { ScenarioGenerationServiceError } from "./scenario-generation-service";
import { questionDifficultyMixSchema } from "./question-generation-proposal";
import { questionCreateSchema, questionUpdateSchema } from "./question-schemas";
import { scenarioInputSchema } from "./scenario-validation";
import { CertDrillServiceError, type createCertDrillService } from "./service";

type CertDrillRoutesDeps = {
  service: ReturnType<typeof createCertDrillService>;
};

type CertDrillAdminRoutesDeps = {
  service: ReturnType<typeof createCertDrillAdminService>;
};

const certificationCreateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  vendor: z.string().min(1),
  vendorId: z.string().uuid().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  blueprintSourceUrl: z.string().url().nullable().optional(),
  description: z.string().nullable().optional(),
  questionCountDefault: z.number().int().positive().optional(),
  quickDrillQuestionCount: z.number().int().positive().optional(),
  categoryDrillQuestionCount: z.number().int().positive().optional(),
  examSimulationQuestionCount: z.number().int().positive().nullable().optional(),
  examSimulationScenarioCount: z.number().int().nonnegative().optional(),
  examSimulationDurationMinutes: z.number().int().positive().optional(),
  passThresholdPct: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
  enabledAt: z.string().datetime().nullable().optional(),
  archivedAt: z.string().datetime().nullable().optional(),
});
const certificationUpdateSchema = certificationCreateSchema.partial();

const categoryCreateSchema = z.object({
  certificationId: z.string().uuid(),
  parentCategoryId: z.string().uuid().nullable().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  weightPct: z.union([z.string(), z.number()]).nullable().optional(),
  drillQuestionCount: z.number().int().positive().nullable().optional(),
  sortOrder: z.number().int().optional(),
});
const categoryUpdateSchema = categoryCreateSchema.partial();

const examFormCreateSchema = z.object({
  certificationId: z.string().uuid(),
  name: z.string().trim().min(1),
  durationMinutes: z.number().int().positive(),
  targetQuestionCount: z.number().int().positive(),
});
const examFormMetadataSchema = z.object({ name: z.string().trim().min(1).optional(), durationMinutes: z.number().int().positive().optional() }).refine((value) => Object.keys(value).length > 0, "At least one field is required.");
const examFormRegenerateSchema = z.object({ targetQuestionCount: z.number().int().positive(), expectedAssignmentVersion: z.number().int().positive() });
const examFormReplaceSchema = z.object({ currentQuestionId: z.string().uuid(), replacementQuestionId: z.string().uuid(), expectedAssignmentVersion: z.number().int().positive() });
const examFormActivationSchema = z.object({ isActive: z.boolean() });
const scenarioUpdateSchema = scenarioInputSchema.omit({ certificationId: true });
const examFormScenariosSchema = z.object({
  scenarioIds: z.array(z.string().uuid()).max(20).refine((ids) => new Set(ids).size === ids.length, "Scenario IDs must be unique."),
}).strict();
const scenarioBulkStatusSchema = z.object({
  scenarioIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Scenario IDs must be unique."),
  status: z.enum(["draft", "published"]),
}).strict();

const questionFeedbackUpdateSchema = z.object({
  status: z.enum(["reviewed", "resolved"]),
});
const questionBulkStatusSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Question IDs must be unique."),
  status: z.enum(["draft", "published"]),
}).strict();
const questionBulkDeliveryPurposeSchema = z.object({
  questionIds: z.array(z.string().uuid()).min(1).max(100)
    .refine((ids) => new Set(ids).size === ids.length, "Question IDs must be unique."),
  deliveryPurpose: z.enum(["practice", "assessment"]),
}).strict();


const resourceCreateSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid().nullable().optional(),
  url: z.string().url(),
  title: z.string().min(1),
  sourceType: z.enum(["module", "unit", "study-guide", "exam-blueprint", "doc"]),
  contentMode: z.enum(["deep_content", "outline_blueprint"]),
  rawContent: z.string().nullable().optional(),
  status: z.enum(["pending", "ingested", "failed"]).optional(),
});
const resourceUpdateSchema = resourceCreateSchema.partial();

const categoryDiscoveryCreateSchema = z.object({
  url: z.string().url(),
}).strict();
const questionGenerationCreateSchema = z.object({
  categoryId: z.string().uuid().nullable(),
  resourceIds: z.array(z.string().uuid()).max(10),
  sourceUrls: z.array(z.string().url()).max(10),
  requestedCount: z.number().int().min(1).max(25),
  focus: z.string().trim().max(500).nullable(),
  systemInstructions: z.string().trim().max(4_000).nullable().default(null),
  instructions: z.string().trim().max(2_000).nullable(),
  questionTypes: z.array(z.enum(["single_choice", "fill_blank", "matching"])).min(1).max(3).default(["single_choice"]),
  difficultyMix: questionDifficultyMixSchema,
  deliveryPurpose: z.enum(["practice", "assessment"]),
}).strict().superRefine((value, ctx) => {
  if (value.resourceIds.length + value.sourceUrls.length === 0) {
    ctx.addIssue({ code: "custom", message: "At least one source is required.", path: ["sourceUrls"] });
  }
  if (value.resourceIds.length + value.sourceUrls.length > 10) {
    ctx.addIssue({ code: "custom", message: "At most 10 sources are allowed.", path: ["sourceUrls"] });
  }
});
const scenarioGenerationCreateSchema = z.object({
  resourceIds: z.array(z.string().uuid()).max(10),
  sourceUrls: z.array(z.string().url()).max(10),
  requestedCount: z.number().int().min(1).max(10),
  difficulty: z.enum(["easy", "medium", "hard"]),
  focus: z.string().trim().max(500).nullable(),
  instructions: z.string().trim().max(2_000).nullable(),
}).strict().superRefine((value, ctx) => {
  if (value.resourceIds.length + value.sourceUrls.length === 0) {
    ctx.addIssue({ code: "custom", message: "At least one source is required.", path: ["sourceUrls"] });
  }
  if (value.resourceIds.length + value.sourceUrls.length > 10) {
    ctx.addIssue({ code: "custom", message: "At most 10 sources are allowed.", path: ["sourceUrls"] });
  }
});
const uuidParamSchema = z.object({ id: z.string().uuid() });
const certificationIdParamSchema = z.object({ certificationId: z.string().uuid() });
const requiredDocumentSchema = z.custom<unknown>((value) => value !== undefined, {
  message: "Document is required.",
});

const questionImportPreviewRequestSchema = z.object({
  certificationId: z.string().uuid(),
  document: requiredDocumentSchema,
}).strict();

const questionImportSourceIndexSchema = z.number().int().min(0).max(QUESTION_IMPORT_MAX_ROWS - 1);

const questionImportConfirmRequestSchema = questionImportPreviewRequestSchema.extend({
  previewDocumentHash: z.string().regex(/^[a-f0-9]{64}$/, "Preview document hash must be a 64-character lowercase hex string."),
  selectedSourceIndexes: z.array(questionImportSourceIndexSchema)
    .min(1, "At least one question must be selected.")
    .max(QUESTION_IMPORT_MAX_ROWS, `Must select at most ${QUESTION_IMPORT_MAX_ROWS} questions.`),
  duplicateOverrideSourceIndexes: z.array(questionImportSourceIndexSchema)
    .max(QUESTION_IMPORT_MAX_ROWS, `Must override at most ${QUESTION_IMPORT_MAX_ROWS} duplicate rows.`),
}).strict();

const validationMessages: Record<string, { required?: string; uuid?: string; url?: string; min?: string }> = {
  certificationId: { required: "Certification ID is required.", uuid: "Certification ID must be a valid UUID." },
  categoryId: { required: "Category ID is required.", uuid: "Category ID must be a valid UUID." },
  parentCategoryId: { uuid: "Parent category ID must be a valid UUID." },
  questionId: { required: "Question ID is required.", uuid: "Question ID must be a valid UUID." },
  selectedOptionId: { required: "Selected option ID is required.", uuid: "Selected option ID must be a valid UUID." },
  examFormId: { uuid: "Exam form ID must be a valid UUID." },
  sourceResourceId: { uuid: "Source resource ID must be a valid UUID." },
  generationJobId: { uuid: "Generation job ID must be a valid UUID." },
  resourceId: { required: "Resource ID is required.", uuid: "Resource ID must be a valid UUID." },
  resourceIds: { uuid: "Resource IDs must be valid UUIDs." },
  id: { uuid: "ID must be a valid UUID." },
  code: { required: "Code is required." },
  name: { required: "Name is required." },
  vendor: { required: "Vendor is required." },
  stem: { required: "Question stem is required." },
  prompt: { required: "Prompt is required." },
  title: { required: "Title is required." },
  url: { required: "Resource URL is required.", url: "Resource URL must be a valid URL." },
  logoUrl: { url: "Logo URL must be a valid URL." },
  blueprintSourceUrl: { url: "Blueprint URL must be a valid URL." },
};

function getAuthUserId(c: Context<AppEnv>) {
  const authUser = c.get("authUser");
  if (!authUser) {
    return null;
  }

  return authUser.id;
}

function certDrillDomainError(c: Context<AppEnv>, error: CertDrillServiceError, status: 400 | 404) {
  const requestId = c.get("requestId");
  const response = c.json({
    success: false,
    error: {
      code: error.code,
      message: error.message,
    },
    ...(requestId ? { requestId } : {}),
  }, status);

  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }

  return response;
}

function certDrillErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof CertDrillAccessDeniedError) {
    return forbidden(c, error.message);
  }

  if (error instanceof CertDrillServiceError) {
    if (error.code === "CERTDRILL_ATTEMPT_NOT_FOUND" || error.code === "CERTDRILL_CERTIFICATION_NOT_FOUND" || error.code === "CERTDRILL_QUESTION_NOT_FOUND") {
      return certDrillDomainError(c, error, 404);
    }

    return certDrillDomainError(c, error, 400);
  }

  if (error instanceof Error) {
    if (error.message === "Certification not found") {
      return notFound(c, error.message);
    }

    if (error.message === "No published questions available for this attempt") {
      return badRequest(c, error.message);
    }
  }

  throw error;
}

function certDrillAdminErrorJson(
  c: Context<AppEnv>,
  code: string,
  message: string,
  details: unknown,
  status: 400 | 404 | 409,
) {
  const requestId = c.get("requestId");
  const response = c.json({
    success: false,
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
    ...(requestId ? { requestId } : {}),
  }, status);

  if (requestId) {
    response.headers.set("x-request-id", requestId);
  }

  return response;
}

function certDrillAdminErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof BlueprintParseServiceError) {
    if (error.code === "CERTDRILL_BLUEPRINT_PARSE_CERTIFICATION_NOT_FOUND" || error.code === "CERTDRILL_BLUEPRINT_PARSE_RESOURCE_NOT_FOUND") {
      return notFound(c, error.message);
    }

    return badRequest(c, error.message);
  }
  if (error instanceof QuestionGenerationServiceError) {
    if (error.code === "QUESTION_GENERATION_CERTIFICATION_NOT_FOUND" || error.code === "QUESTION_GENERATION_CATEGORY_NOT_FOUND" || error.code === "QUESTION_GENERATION_RESOURCE_NOT_FOUND") {
      return notFound(c, error.message);
    }
    return badRequest(c, error.message);
  }
  if (error instanceof ScenarioGenerationServiceError) {
    if (error.code === "SCENARIO_GENERATION_CERTIFICATION_NOT_FOUND" || error.code === "SCENARIO_GENERATION_RESOURCE_NOT_FOUND") {
      return notFound(c, error.message);
    }
    return badRequest(c, error.message);
  }


  if (error instanceof QuestionImportServiceError) {
    const status = error.code === "CERTDRILL_ADMIN_QUESTION_IMPORT_CONFLICT" ? 409 : 400;
    return certDrillAdminErrorJson(c, error.code, error.message, error.details, status);
  }

  if (error instanceof CertDrillAdminServiceError) {
    const status = error.code === "CERTDRILL_ADMIN_CERTIFICATION_NOT_FOUND" || error.code === "CERTDRILL_ADMIN_EXAM_FORM_NOT_FOUND" || error.code === "CERTDRILL_ADMIN_SCENARIO_NOT_FOUND"
      ? 404
      : error.code === "CERTDRILL_ADMIN_EXAM_FORM_CONFLICT" || error.code === "CERTDRILL_ADMIN_EXAM_FORM_QUESTION_IN_USE" || error.code === "CERTDRILL_ADMIN_SCENARIO_IN_ACTIVE_FORM"
        ? 409
        : 400;
    return certDrillAdminErrorJson(c, error.code, error.message, error.details, status);
  }

  throw error;
}

async function adminJson<T>(c: Context<AppEnv>, schema: z.ZodSchema<T>) {
  const body = await c.req.json().catch(() => null);
  return parseJsonBody(schema, body);
}

function questionImportPayloadTooLarge(c: Context<AppEnv>) {
  return fail(c, "Question import payload is too large.", 413, { errorCode: errorCode.payloadTooLarge });
}

// Reads the request body up to `maxBytes` without buffering an unbounded amount of data, so a
// hostile or oversized transport payload cannot be fully parsed just to measure its size.
async function readBoundedRequestText(request: Request, maxBytes: number): Promise<{ tooLarge: true } | { tooLarge: false; text: string }> {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      return { tooLarge: true };
    }
  }

  if (!request.body) {
    return { tooLarge: false, text: await request.text() };
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        return { tooLarge: true };
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(bytesRead);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return { tooLarge: false, text: new TextDecoder().decode(bytes) };
}

type QuestionImportBodyResult<T> =
  | { kind: "ok"; data: T }
  | { kind: "tooLarge" }
  | { kind: "invalidDocumentShape" }
  | { kind: "invalid"; error: z.ZodError };

// Zod validates (and copies) every element of an array before the array-length rule reports the
// problem, so the confirm index arrays are capped just past the row limit before parsing. One
// element beyond the limit is kept so `.max()` still rejects the request on its length, and arrays
// within the limit are passed through untouched so a valid request parses exactly as submitted.
const QUESTION_IMPORT_INDEX_FIELDS = ["selectedSourceIndexes", "duplicateOverrideSourceIndexes"] as const;

function capQuestionImportIndexArrays(body: unknown): unknown {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return body;
  }

  let capped = body as Record<string, unknown>;
  for (const field of QUESTION_IMPORT_INDEX_FIELDS) {
    const value = capped[field];
    if (Array.isArray(value) && value.length > QUESTION_IMPORT_MAX_ROWS + 1) {
      capped = { ...capped, [field]: value.slice(0, QUESTION_IMPORT_MAX_ROWS + 1) };
    }
  }

  return capped;
}

async function parseQuestionImportBody<T extends { document: unknown }>(
  c: Context<AppEnv>,
  schema: z.ZodSchema<T>,
  prepareBody: (body: unknown) => unknown = (body) => body,
): Promise<QuestionImportBodyResult<T>> {
  const bounded = await readBoundedRequestText(c.req.raw, QUESTION_IMPORT_MAX_RAW_BODY_BYTES);
  if (bounded.tooLarge) {
    return { kind: "tooLarge" };
  }

  let parsedJson: unknown = null;
  try {
    parsedJson = bounded.text ? JSON.parse(bounded.text) : null;
  } catch {
    parsedJson = null;
  }

  const parsedBody = parseJsonBody(schema, prepareBody(parsedJson));
  if (!parsedBody.success) {
    return { kind: "invalid", error: parsedBody.error };
  }

  const documentMeasurement = measureQuestionImportDocumentBytes(parsedBody.data.document);
  if (documentMeasurement.kind === "invalid") {
    return { kind: "invalidDocumentShape" };
  }

  if (documentMeasurement.bytes > QUESTION_IMPORT_MAX_DOCUMENT_BYTES) {
    return { kind: "tooLarge" };
  }

  return { kind: "ok", data: parsedBody.data };
}

function questionImportInvalidDocumentShape(c: Context<AppEnv>, message: string) {
  return validationError(c, message, [{ path: "document", message: "Document nesting/shape is invalid.", code: "custom" }]);
}

function validationIssueMessage(issue: z.core.$ZodIssue, path: string) {
  const field = path.split(".").at(-1) ?? path;
  const messages = validationMessages[field] ?? validationMessages[path];
  const issueCode = issue.code;

  if (issueCode === "invalid_type") return messages?.required ?? `${field} is required.`;
  if (issueCode === "too_small") return messages?.min ?? issue.message;
  if (issueCode === "invalid_format") {
    const format = "format" in issue ? issue.format : undefined;
    if (format === "uuid") return messages?.uuid ?? `${field} must be a valid UUID.`;
    if (format === "url") return messages?.url ?? `${field} must be a valid URL.`;
  }

  return issue.message;
}

function zodValidationDetails(error: z.ZodError) {
  return boundedValidationDetails(error, { formatMessage: validationIssueMessage });
}

function parsedValidationError(c: Context<AppEnv>, message: string, error: z.ZodError) {
  return validationError(c, message, zodValidationDetails(error));
}

function adminUuidParam(c: Context<AppEnv>) {
  const parsedParams = parseJsonBody(uuidParamSchema, { id: c.req.param("id") });
  if (!parsedParams.success) {
    return null;
  }

  return parsedParams.data.id;
}

function adminCertificationIdParam(c: Context<AppEnv>) {
  const parsedParams = parseJsonBody(certificationIdParamSchema, { certificationId: c.req.param("certificationId") });
  if (!parsedParams.success) {
    return null;
  }

  return parsedParams.data.certificationId;
}

function adminQuestionIndexQuery(c: Context<AppEnv>): AdminQuestionIndexQueryInput {
  return {
    search: c.req.query("search"),
    certificationId: c.req.query("certificationId"),
    categoryId: c.req.query("categoryId"),
    status: c.req.query("status"),
    difficulty: c.req.query("difficulty"),
    sort: c.req.query("sort"),
    page: c.req.query("page"),
  };
}

async function withAdminAction<T>(c: Context<AppEnv>, action: () => Promise<T>, status = 200) {
  try {
    return ok(c, await action(), status);
  } catch (error) {
    return certDrillAdminErrorResponse(c, error);
  }
}

async function withAuthUser<T>(c: Context<AppEnv>, callback: (userId: string) => Promise<T>) {
  const userId = getAuthUserId(c);
  if (!userId) {
    return unauthorized(c, "Unauthenticated");
  }

  try {
    return ok(c, await callback(userId));
  } catch (error) {
    return certDrillErrorResponse(c, error);
  }
}

export function createCertDrillUserRouter(deps: CertDrillRoutesDeps) {
  const router = new Hono<AppEnv>();

  router.get("/certifications", (c) => withAuthUser(c, (userId) => deps.service.listCertifications(userId)));

  router.get("/my-certifications", (c) => withAuthUser(c, (userId) => deps.service.listMyCertifications(userId)));

  router.get("/readiness", (c) => withAuthUser(c, (userId) => deps.service.getReadinessSummary(userId)));

  router.get("/review-queue/due", (c) => withAuthUser(c, (userId) => deps.service.listDueReviewQueue(userId)));

  router.get("/certifications/:id/categories", async (c) => {
    try {
      return ok(c, await deps.service.listCategories(c.req.param("id")));
    } catch (error) {
      return certDrillErrorResponse(c, error);
    }
  });

  router.post("/exams", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createCertDrillExamAttemptRequestSchema, body);

    if (!parsedBody.success) {
      return parsedValidationError(c, "Invalid create attempt payload", parsedBody.error);
    }

    return withAuthUser(c, (userId) => deps.service.createAttempt(userId, parsedBody.data));
  });

  router.get("/exams/:id", (c) => withAuthUser(c, (userId) => deps.service.getAttemptForResume(userId, c.req.param("id"))));

  router.post("/exams/:id/answers", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(answerCertDrillQuestionRequestSchema, body);

    if (!parsedBody.success) {
      return parsedValidationError(c, "Invalid answer payload", parsedBody.error);
    }

    return withAuthUser(c, (userId) => deps.service.answerQuestion(userId, c.req.param("id"), parsedBody.data));
  });

  router.post("/exams/:id/scenarios", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(answerCertDrillScenarioRequestSchema, body);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid scenario response payload", parsedBody.error);
    return withAuthUser(c, (userId) => deps.service.answerScenario(userId, c.req.param("id"), parsedBody.data));
  });

  router.post("/questions/:id/feedback", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsedBody = parseJsonBody(createCertDrillQuestionFeedbackRequestSchema, body);

    if (!parsedBody.success) {
      return parsedValidationError(c, "Invalid feedback payload", parsedBody.error);
    }

    if (parsedBody.data.questionId !== c.req.param("id")) {
      return validationError(c, "Invalid feedback payload", [{ path: "questionId", message: "Question ID must match the feedback route.", code: "custom" }]);
    }

    return withAuthUser(c, (userId) => deps.service.createQuestionFeedback(userId, parsedBody.data));
  });

  router.post("/exams/:id/submit", (c) => withAuthUser(c, (userId) => deps.service.submitAttempt(userId, c.req.param("id"))));

  router.get("/exams/:id/review", (c) => withAuthUser(c, (userId) => deps.service.reviewAttempt(userId, c.req.param("id"))));

  router.get("/users/me/attempts", (c) => withAuthUser(c, (userId) => deps.service.listAttempts(userId)));

  return router;
}

export function createCertDrillAdminRouter(deps: CertDrillAdminRoutesDeps) {
  const router = new Hono<AppEnv>();
  router.get("/health", (c) => ok(c, { module: "certdrill", status: "ok" }));
  router.delete("/users/:id/progress", (c) => {
    const userId = adminUuidParam(c);
    if (!userId) return validationError(c, "Invalid user id");
    return withAdminAction(c, () => deps.service.resetUserProgress(userId));
  });

  router.get("/certifications", (c) => withAdminAction(c, () => deps.service.listCertifications()));
  router.get("/vendors", (c) => withAdminAction(c, () => deps.service.listVendors()));
  router.get("/question-feedback", (c) => withAdminAction(c, () => deps.service.listQuestionFeedbackForAdmin()));
  router.patch("/question-feedback/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid question feedback id");
    const parsedBody = await adminJson(c, questionFeedbackUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid question feedback payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateQuestionFeedback(id, parsedBody.data));
  });
  router.post("/certifications", async (c) => {
    const parsedBody = await adminJson(c, certificationCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid certification payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createCertification(parsedBody.data));
  });
  router.patch("/certifications/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid certification id");
    const parsedBody = await adminJson(c, certificationUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid certification payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateCertification(id, parsedBody.data));
  });
  router.post("/certifications/:id/archive", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.archiveCertification(id));
  });

  router.get("/certifications/:certificationId/categories", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listCategories(certificationId));
  });
  router.post("/categories", async (c) => {
    const parsedBody = await adminJson(c, categoryCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid category payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createCategory(parsedBody.data));
  });
  router.patch("/categories/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid category id");
    const parsedBody = await adminJson(c, categoryUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid category payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateCategory(id, parsedBody.data));
  });
  router.post("/categories/:id/archive", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid category id");
    return withAdminAction(c, () => deps.service.archiveCategory(id));
  });

  router.get("/certifications/:certificationId/questions", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listQuestions(certificationId));
  });
  router.get("/questions", (c) => withAdminAction(c, () => deps.service.listQuestionIndex(adminQuestionIndexQuery(c))));
  router.post("/questions", async (c) => {
    const parsedBody = await adminJson(c, questionCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid question payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createQuestion(parsedBody.data));
  });
  router.post("/questions/import/preview", async (c) => {
    const parsedBody = await parseQuestionImportBody(c, questionImportPreviewRequestSchema);
    if (parsedBody.kind === "tooLarge") return questionImportPayloadTooLarge(c);
    if (parsedBody.kind === "invalidDocumentShape") return questionImportInvalidDocumentShape(c, "Invalid question import preview payload");
    if (parsedBody.kind === "invalid") return parsedValidationError(c, "Invalid question import preview payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.previewQuestionImport(parsedBody.data));
  });
  router.post("/questions/import", async (c) => {
    const parsedBody = await parseQuestionImportBody(c, questionImportConfirmRequestSchema, capQuestionImportIndexArrays);
    if (parsedBody.kind === "tooLarge") return questionImportPayloadTooLarge(c);
    if (parsedBody.kind === "invalidDocumentShape") return questionImportInvalidDocumentShape(c, "Invalid question import payload");
    if (parsedBody.kind === "invalid") return parsedValidationError(c, "Invalid question import payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.importQuestions(parsedBody.data));
  });
  router.patch("/questions/status", async (c) => {
    const parsedBody = await adminJson(c, questionBulkStatusSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid bulk question status payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateQuestionStatuses(parsedBody.data));
  });
  router.patch("/questions/delivery-purpose", async (c) => {
    const parsedBody = await adminJson(c, questionBulkDeliveryPurposeSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid bulk question purpose payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateQuestionDeliveryPurposes(parsedBody.data));
  });
  router.patch("/questions/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid question id");
    const parsedBody = await adminJson(c, questionUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid question payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateQuestion(id, parsedBody.data));
  });
  router.post("/questions/:id/publish", (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid question id");
    return withAdminAction(c, () => deps.service.publishQuestion(id));
  });

  router.get("/certifications/:certificationId/exam-forms", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listExamForms(certificationId));
  });
  router.get("/certifications/:certificationId/scenarios", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listScenarios(certificationId));
  });
  router.post("/scenarios", async (c) => {
    const parsedBody = await adminJson(c, scenarioInputSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid scenario payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createScenario(parsedBody.data), 201);
  });
  router.patch("/scenarios/status", async (c) => {
    const parsedBody = await adminJson(c, scenarioBulkStatusSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid bulk scenario status payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateScenarioStatuses(parsedBody.data));
  });
  router.patch("/scenarios/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid scenario id");
    const parsedBody = await adminJson(c, scenarioUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid scenario payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateScenario(id, parsedBody.data));
  });
  router.post("/scenarios/:id/archive", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid scenario id");
    return withAdminAction(c, () => deps.service.archiveScenario(id));
  });
  router.post("/scenarios/:id/validate", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid scenario id");
    return withAdminAction(c, () => deps.service.validateScenario(id));
  });
  router.post("/scenarios/:id/publish", (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid scenario id");
    return withAdminAction(c, () => deps.service.publishScenario(id));
  });
  router.put("/exam-forms/:id/scenarios", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormScenariosSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid scenario assignment payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.setExamFormScenarios(id, parsedBody.data.scenarioIds));
  });

  router.get("/exam-forms/:id", (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    return withAdminAction(c, () => deps.service.getExamForm(id));
  });
  router.post("/exam-forms", async (c) => {
    const parsedBody = await adminJson(c, examFormCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createExamForm(parsedBody.data));
  });
  router.patch("/exam-forms/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormMetadataSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateExamFormMetadata(id, parsedBody.data));
  });
  router.post("/exam-forms/:id/regenerate", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormRegenerateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form regeneration payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.regenerateExamForm(id, parsedBody.data));
  });
  router.post("/exam-forms/:id/questions/replace", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormReplaceSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form replacement payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.replaceExamFormQuestion(id, parsedBody.data));
  });
  router.patch("/exam-forms/:id/activation", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormActivationSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form activation payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.setExamFormActive(id, parsedBody.data.isActive));
  });

  router.get("/certifications/:certificationId/resources", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listResources(certificationId));
  });
  router.post("/certifications/:certificationId/category-discoveries", async (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    const parsedBody = await adminJson(c, categoryDiscoveryCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid category discovery payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.startCategoryDiscovery({ certificationId, ...parsedBody.data }), 201);
  });
  router.get("/certifications/:certificationId/blueprint-parse-runs", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listBlueprintParseRuns(certificationId));
  });
  router.get("/blueprint-parse-runs/:id", async (c) => {

    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid blueprint parse run id");

    try {
      const run = await deps.service.getBlueprintParseRun(id);
      if (!run) {
        return notFound(c, "Blueprint parse run not found.");
      }

      return ok(c, run);
    } catch (error) {
      return certDrillAdminErrorResponse(c, error);
    }
  });
  router.post("/certifications/:certificationId/question-generation-jobs", async (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    const parsedBody = await adminJson(c, questionGenerationCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid question generation payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.startQuestionGeneration({
      certificationId,
      categoryId: parsedBody.data.categoryId,
      resourceIds: parsedBody.data.resourceIds,
      sourceUrls: parsedBody.data.sourceUrls,
      requestedCount: parsedBody.data.requestedCount,
      config: {
        focus: parsedBody.data.focus,
        systemInstructions: parsedBody.data.systemInstructions,
        instructions: parsedBody.data.instructions,
        questionTypes: parsedBody.data.questionTypes,
        difficultyMix: parsedBody.data.difficultyMix,
        deliveryPurpose: parsedBody.data.deliveryPurpose,
      },
    }), 201);
  });
  router.get("/certifications/:certificationId/question-generation-jobs", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listQuestionGenerationJobs(certificationId));
  });
  router.get("/question-generation-jobs/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid question generation job id");
    try {
      const job = await deps.service.getQuestionGenerationJob(id);
      if (!job) return notFound(c, "Question generation job not found.");
      return ok(c, job);
    } catch (error) {
      return certDrillAdminErrorResponse(c, error);
    }
  });
  router.post("/certifications/:certificationId/scenario-generation-jobs", async (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    const parsedBody = await adminJson(c, scenarioGenerationCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid scenario generation payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.startScenarioGeneration({ certificationId, ...parsedBody.data }), 201);
  });
  router.get("/certifications/:certificationId/scenario-generation-jobs", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listScenarioGenerationJobs(certificationId));
  });
  router.get("/scenario-generation-jobs/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid scenario generation job id");
    try {
      const job = await deps.service.getScenarioGenerationJob(id);
      if (!job) return notFound(c, "Scenario generation job not found.");
      return ok(c, job);
    } catch (error) {
      return certDrillAdminErrorResponse(c, error);
    }
  });
  router.post("/resources", async (c) => {
    const parsedBody = await adminJson(c, resourceCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid resource payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createResource(parsedBody.data));
  });
  router.patch("/resources/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid resource id");
    const parsedBody = await adminJson(c, resourceUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid resource payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateResource(id, parsedBody.data));
  });
  router.post("/resources/:id/ingest", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid resource id");
    return withAdminAction(c, () => deps.service.ingestResource(id));
  });


  return router;
}
