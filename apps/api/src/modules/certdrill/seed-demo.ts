import { and, asc, eq } from "drizzle-orm";

import {
  certdrillAnswerOptions,
  certdrillCertifications,
  certdrillExamCategories,
  certdrillExamForms,
  certdrillQuestions,
} from "@platform/platform-db";
import type { createPlatformDb } from "@platform/platform-db";

type SeedDb = ReturnType<typeof createPlatformDb>["db"];

type DemoCertification = {
  code: string;
  name: string;
  vendor: string;
  blueprintSourceUrl: string;
  description: string;
  questionCountDefault: number;
  passThresholdPct: number;
  category: {
    code: string;
    name: string;
    weightPct: string;
    questions: Array<{
      stem: string;
      difficulty: "easy" | "medium" | "hard";
      options: Array<{
        text: string;
        isCorrect: boolean;
        explanation: string;
        citationUrls: string[];
      }>;
    }>;
  };
};

const quickDrillQuestionCount = 10;
const categoryDrillQuestionCount = 10;
const examSimulationDurationMinutes = 120;
const examFormNames = ["Exam Form A", "Exam Form B", "Exam Form C"];

const demoCertifications: DemoCertification[] = [
  {
    code: "AWS-SAA-C03",
    name: "AWS Certified Solutions Architect - Associate",
    vendor: "Amazon Web Services",
    blueprintSourceUrl: "https://aws.amazon.com/certification/certified-solutions-architect-associate/",
    description: "Demo CertDrill catalog entry for AWS architecture practice.",
    questionCountDefault: 2,
    passThresholdPct: 72,
    category: {
      code: "D1",
      name: "Design Secure Architectures",
      weightPct: "30.00",
      questions: [
        {
          stem: "A company needs to store application secrets for an AWS Lambda function. Which service should be used to rotate and retrieve the secrets securely?",
          difficulty: "easy",
          options: [
            {
              text: "AWS Secrets Manager",
              isCorrect: true,
              explanation: "Secrets Manager stores secrets securely and supports managed rotation.",
              citationUrls: ["https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html"],
            },
            {
              text: "Amazon S3 public bucket metadata",
              isCorrect: false,
              explanation: "S3 metadata is not designed for secure secret storage or rotation.",
              citationUrls: ["https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html"],
            },
          ],
        },
        {
          stem: "Which design gives private subnets outbound internet access without accepting inbound internet connections?",
          difficulty: "medium",
          options: [
            {
              text: "Route private subnet traffic through a NAT gateway in a public subnet.",
              isCorrect: true,
              explanation: "A NAT gateway lets private subnet resources initiate outbound internet connections.",
              citationUrls: ["https://docs.aws.amazon.com/vpc/latest/userguide/vpc-nat-gateway.html"],
            },
            {
              text: "Attach an internet gateway directly to each private subnet.",
              isCorrect: false,
              explanation: "Internet gateways attach to VPCs, and direct public routing would not preserve private-only inbound access.",
              citationUrls: ["https://docs.aws.amazon.com/vpc/latest/userguide/VPC_Internet_Gateway.html"],
            },
          ],
        },
      ],
    },
  },
  {
    code: "AZ-104",
    name: "Microsoft Azure Administrator",
    vendor: "Microsoft",
    blueprintSourceUrl: "https://learn.microsoft.com/credentials/certifications/azure-administrator/",
    description: "Demo CertDrill catalog entry for Azure administrator practice.",
    questionCountDefault: 2,
    passThresholdPct: 70,
    category: {
      code: "D1",
      name: "Manage Azure Identities and Governance",
      weightPct: "25.00",
      questions: [
        {
          stem: "Which Azure feature should you use to enforce that new resources include a cost center tag?",
          difficulty: "easy",
          options: [
            {
              text: "Azure Policy",
              isCorrect: true,
              explanation: "Azure Policy can audit, deny, or modify resources based on organizational rules such as required tags.",
              citationUrls: ["https://learn.microsoft.com/azure/governance/policy/overview"],
            },
            {
              text: "Azure Monitor metrics",
              isCorrect: false,
              explanation: "Azure Monitor observes telemetry; it does not enforce resource creation rules.",
              citationUrls: ["https://learn.microsoft.com/azure/azure-monitor/overview"],
            },
          ],
        },
        {
          stem: "An administrator needs to grant a user permission to restart virtual machines in one resource group only. What should be configured?",
          difficulty: "medium",
          options: [
            {
              text: "Assign an appropriate Azure RBAC role scoped to the resource group.",
              isCorrect: true,
              explanation: "Azure RBAC assignments can be scoped at management group, subscription, resource group, or resource level.",
              citationUrls: ["https://learn.microsoft.com/azure/role-based-access-control/overview"],
            },
            {
              text: "Make the user a Global Administrator for the tenant.",
              isCorrect: false,
              explanation: "Global Administrator is broader than required and does not follow least privilege for this Azure resource task.",
              citationUrls: ["https://learn.microsoft.com/entra/identity/role-based-access-control/permissions-reference"],
            },
          ],
        },
      ],
    },
  },
];

export async function seedCertDrillDemoData(db: SeedDb) {
  let createdCertifications = 0;
  let skippedCertifications = 0;

  for (const demo of demoCertifications) {
    const existing = await db.query.certdrillCertifications.findFirst({
      where: eq(certdrillCertifications.code, demo.code),
    });

    if (existing) {
      const effectiveExamSimulationQuestionCount = positiveOrDefault(
        existing.examSimulationQuestionCount,
        demo.category.questions.length,
      );
      await db.update(certdrillCertifications).set({
        quickDrillQuestionCount: positiveOrDefault(existing.quickDrillQuestionCount, quickDrillQuestionCount),
        categoryDrillQuestionCount: positiveOrDefault(existing.categoryDrillQuestionCount, categoryDrillQuestionCount),
        examSimulationQuestionCount: effectiveExamSimulationQuestionCount,
        examSimulationDurationMinutes: positiveOrDefault(existing.examSimulationDurationMinutes, examSimulationDurationMinutes),
      }).where(eq(certdrillCertifications.code, demo.code));

      const categoryId = await ensureDemoCategory(db, existing.id, demo);
      const questionIds = await ensureDemoQuestions(db, existing.id, categoryId, demo);
      const existingForms = await db.query.certdrillExamForms.findMany({
        where: eq(certdrillExamForms.certificationId, existing.id),
      });
      await insertMissingExamForms(
        db,
        existing.id,
        demo.code,
        questionIds,
        new Set(existingForms.map((form) => form.sortOrder)),
        effectiveExamSimulationQuestionCount,
        categoryId,
        demo.category.name,
        false,
      );

      skippedCertifications += 1;
      continue;
    }

    const [certification] = await db.insert(certdrillCertifications).values({
      code: demo.code,
      name: demo.name,
      vendor: demo.vendor,
      blueprintSourceUrl: demo.blueprintSourceUrl,
      description: demo.description,
      questionCountDefault: demo.questionCountDefault,
      quickDrillQuestionCount,
      categoryDrillQuestionCount,
      examSimulationQuestionCount: demo.category.questions.length,
      examSimulationDurationMinutes,
      passThresholdPct: demo.passThresholdPct,
      isActive: true,
    }).returning({ id: certdrillCertifications.id });

    const certificationId = certification?.id;
    if (!certificationId) {
      throw new Error(`Failed to create demo certification ${demo.code}`);
    }

    const categoryId = await insertDemoCategory(db, certificationId, demo);
    const questionIds = await insertDemoQuestions(db, certificationId, categoryId, demo);
    await insertMissingExamForms(db, certificationId, demo.code, questionIds, new Set(), demo.category.questions.length, categoryId, demo.category.name, true);

    createdCertifications += 1;
  }

  return { createdCertifications, skippedCertifications };
}

function positiveOrDefault(value: number | null | undefined, fallback: number) {
  return typeof value === "number" && value > 0 ? value : fallback;
}

async function ensureDemoCategory(db: SeedDb, certificationId: string, demo: DemoCertification) {
  const existingCategory = await db.query.certdrillExamCategories.findFirst({
    where: and(
      eq(certdrillExamCategories.certificationId, certificationId),
      eq(certdrillExamCategories.code, demo.category.code),
    ),
  });

  if (existingCategory?.id) {
    return existingCategory.id;
  }
  return insertDemoCategory(db, certificationId, demo);
}

async function insertDemoCategory(db: SeedDb, certificationId: string, demo: DemoCertification) {
  const [category] = await db.insert(certdrillExamCategories).values({
    certificationId,
    parentCategoryId: null,
    code: demo.category.code,
    name: demo.category.name,
    weightPct: "100.00",
    sortOrder: 1,
  }).returning({ id: certdrillExamCategories.id });

  const categoryId = category?.id;
  if (!categoryId) {
    throw new Error(`Failed to create demo category for ${demo.code}`);
  }

  return categoryId;
}

async function listPublishedQuestions(db: SeedDb, certificationId: string) {
  const questions = await db
    .select({ id: certdrillQuestions.id, stem: certdrillQuestions.stem })
    .from(certdrillQuestions)
    .where(and(
      eq(certdrillQuestions.certificationId, certificationId),
      eq(certdrillQuestions.status, "published"),
    ))
    .orderBy(asc(certdrillQuestions.createdAt));

  return questions;
}

async function ensureDemoQuestions(db: SeedDb, certificationId: string, categoryId: string, demo: DemoCertification) {
  const questions = await listPublishedQuestions(db, certificationId);
  const questionIds = questions.map((question) => question.id);
  const existingStems = new Set(questions.map((question) => question.stem));
  const missingQuestions = demo.category.questions.filter((question) => !existingStems.has(question.stem));

  if (missingQuestions.length > 0) {
    questionIds.push(...await insertDemoQuestions(db, certificationId, categoryId, {
      ...demo,
      category: { ...demo.category, questions: missingQuestions },
    }));
  }

  return questionIds;
}

async function insertDemoQuestions(db: SeedDb, certificationId: string, categoryId: string, demo: DemoCertification) {
  const questionIds: string[] = [];

  for (const [questionIndex, question] of demo.category.questions.entries()) {
    const [createdQuestion] = await db.insert(certdrillQuestions).values({
      certificationId,
      categoryId,
      stem: question.stem,
      mediaAssets: [],
      difficulty: question.difficulty,
      status: "published",
      createdBy: "admin",
    }).returning({ id: certdrillQuestions.id });

    const questionId = createdQuestion?.id;
    if (!questionId) {
      throw new Error(`Failed to create demo question for ${demo.code}`);
    }

    questionIds.push(questionId);

    for (const [optionIndex, option] of question.options.entries()) {
      await db.insert(certdrillAnswerOptions).values({
        questionId,
        text: option.text,
        mediaAssets: [],
        isCorrect: option.isCorrect,
        explanation: option.explanation,
        citationUrls: option.citationUrls,
        sortOrder: questionIndex * 10 + optionIndex,
      }).returning({ id: certdrillAnswerOptions.id });
    }
  }

  return questionIds;
}

async function insertMissingExamForms(
  db: SeedDb,
  certificationId: string,
  certificationCode: string,
  questionIds: string[],
  existingSortOrders: Set<number>,
  questionCountDefault: number,
  categoryId: string,
  categoryName: string,
  isActive: boolean,
) {
  if (questionIds.length === 0) return;

  for (const form of buildExamForms(certificationCode, questionIds, questionCountDefault)) {
    if (existingSortOrders.has(form.sortOrder)) continue;
    await insertExamForm(db, certificationId, categoryId, categoryName, isActive, form);
  }
}

function buildExamForms(certificationCode: string, questionIds: string[], questionCountDefault: number) {
  const formQuestionCount = Math.max(1, questionCountDefault);
  const fullFormCount = Math.min(examFormNames.length, Math.floor(questionIds.length / formQuestionCount));
  const formCount = fullFormCount > 0 ? fullFormCount : 1;

  return examFormNames.slice(0, formCount).map((name, index) => ({
    name,
    description: `Demo fixed-form exam for ${certificationCode}.`,
    sortOrder: index + 1,
    isActive: true,
    durationMinutes: examSimulationDurationMinutes,
    questionIds: index === 0 && fullFormCount === 0
      ? questionIds
      : questionIds.slice(index * formQuestionCount, (index + 1) * formQuestionCount),
  }));
}

async function insertExamForm(
  db: SeedDb,
  certificationId: string,
  categoryId: string,
  categoryName: string,
  isActive: boolean,
  form: ReturnType<typeof buildExamForms>[number],
) {
  const targetQuestionCount = form.questionIds.length;
  await db.insert(certdrillExamForms).values({
    certificationId,
    ...form,
    isActive,
    targetQuestionCount,
    assignmentVersion: 1,
    allocationSnapshot: [{
      categoryId,
      categoryName,
      weightPct: "100.00",
      allocatedCount: targetQuestionCount,
      assignedCount: targetQuestionCount,
    }],
    generatedAt: new Date(),
  }).returning({ id: certdrillExamForms.id });
}
