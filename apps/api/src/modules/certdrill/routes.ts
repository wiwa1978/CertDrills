import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";

import {
  answerCertDrillQuestionRequestSchema,
  createCertDrillExamAttemptRequestSchema,
  createCertDrillQuestionFeedbackRequestSchema,
} from "@platform/contracts";

import type { AppEnv } from "../../context";
import { badRequest, forbidden, notFound, ok, parseJsonBody, unauthorized, validationError } from "../../lib/http";
import { CertDrillAccessDeniedError } from "./access";
import type { AdminQuestionIndexQueryInput } from "./admin-question-index";
import { CertDrillAdminServiceError, type createCertDrillAdminService } from "./admin-service";
import { CertDrillServiceError, type createCertDrillService } from "./service";
import { isSafeCitationUrl } from "./validation";

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

const mediaAssetSchema = z.object({ url: z.string().url(), mimeType: z.string().optional(), mime_type: z.string().optional() });
const questionOptionSchema = z.object({
  text: z.string().min(1),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  isCorrect: z.boolean(),
  explanation: z.string().optional(),
  citationUrls: z.array(z.string().url().refine(isSafeCitationUrl)).optional(),
  sortOrder: z.number().int().optional(),
});
const questionCreateSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  stem: z.string().min(1),
  mediaAssets: z.array(mediaAssetSchema).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  createdBy: z.enum(["ai", "admin"]).optional(),
  sourceResourceId: z.string().uuid().nullable().optional(),
  generationJobId: z.string().uuid().nullable().optional(),
  options: z.array(questionOptionSchema).optional(),
});
const questionUpdateSchema = questionCreateSchema.omit({ certificationId: true, createdBy: true }).partial();

const examFormCreateSchema = z.object({
  certificationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  durationMinutes: z.number().int().positive().optional(),
  questionIds: z.array(z.string().uuid()),
});
const examFormUpdateSchema = examFormCreateSchema.partial();

const questionFeedbackUpdateSchema = z.object({
  status: z.enum(["reviewed", "resolved"]),
});

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

const mockGenerationSchema = z.object({
  certificationId: z.string().uuid(),
  categoryId: z.string().uuid(),
  prompt: z.string().min(1),
  topic: z.string().nullable().optional(),
  requestedCount: z.number().int().positive().max(25).optional(),
  resourceIds: z.array(z.string().uuid()).optional(),
});
const uuidParamSchema = z.object({ id: z.string().uuid() });
const certificationIdParamSchema = z.object({ certificationId: z.string().uuid() });

const validationMessages: Record<string, { required?: string; uuid?: string; url?: string; min?: string }> = {
  certificationId: { required: "Certification ID is required.", uuid: "Certification ID must be a valid UUID." },
  categoryId: { required: "Category ID is required.", uuid: "Category ID must be a valid UUID." },
  parentCategoryId: { uuid: "Parent category ID must be a valid UUID." },
  questionId: { required: "Question ID is required.", uuid: "Question ID must be a valid UUID." },
  selectedOptionId: { required: "Selected option ID is required.", uuid: "Selected option ID must be a valid UUID." },
  examFormId: { uuid: "Exam form ID must be a valid UUID." },
  sourceResourceId: { uuid: "Source resource ID must be a valid UUID." },
  generationJobId: { uuid: "Generation job ID must be a valid UUID." },
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

function certDrillAdminErrorResponse(c: Context<AppEnv>, error: unknown) {
  if (error instanceof CertDrillAdminServiceError) {
    const requestId = c.get("requestId");
    const response = c.json({
      success: false,
      error: {
        code: error.code,
        message: error.message,
        ...(error.details !== undefined ? { details: error.details } : {}),
      },
      ...(requestId ? { requestId } : {}),
    }, 400);

    if (requestId) {
      response.headers.set("x-request-id", requestId);
    }

    return response;
  }

  throw error;
}

async function adminJson<T>(c: Context<AppEnv>, schema: z.ZodSchema<T>) {
  const body = await c.req.json().catch(() => null);
  return parseJsonBody(schema, body);
}

function issuePath(issue: z.core.$ZodIssue) {
  return issue.path.map((item) => String(item)).join(".") || "body";
}

function validationIssueMessage(issue: z.core.$ZodIssue) {
  const path = issuePath(issue);
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
  return error.issues.map((issue) => ({
    path: issuePath(issue),
    message: validationIssueMessage(issue),
    code: issue.code,
  }));
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

async function withAdminAction<T>(c: Context<AppEnv>, action: () => Promise<T>) {
  try {
    return ok(c, await action());
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
  router.post("/exam-forms", async (c) => {
    const parsedBody = await adminJson(c, examFormCreateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createExamForm(parsedBody.data));
  });
  router.patch("/exam-forms/:id", async (c) => {
    const id = adminUuidParam(c);
    if (!id) return validationError(c, "Invalid exam form id");
    const parsedBody = await adminJson(c, examFormUpdateSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid exam form payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.updateExamForm(id, parsedBody.data));
  });

  router.get("/certifications/:certificationId/resources", (c) => {
    const certificationId = adminCertificationIdParam(c);
    if (!certificationId) return validationError(c, "Invalid certification id");
    return withAdminAction(c, () => deps.service.listResources(certificationId));
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

  router.post("/generation-jobs/mock", async (c) => {
    const parsedBody = await adminJson(c, mockGenerationSchema);
    if (!parsedBody.success) return parsedValidationError(c, "Invalid generation payload", parsedBody.error);
    return withAdminAction(c, () => deps.service.createMockGenerationJob(parsedBody.data));
  });

  return router;
}
