import type { PlatformApiModule } from "@platform/module-contracts";
import type { PlatformDb } from "@platform/platform-db";
import { cron, type Inngest } from "inngest";
import { createAllPurchasedCertificationAccessProvider } from "./access";
import { createCertDrillAdminService } from "./admin-service";
import {
  BlueprintParserError,
  buildFoundryResponsesUrl,
  createFoundryBlueprintParser,
  type BlueprintParser,
} from "./blueprint-parser";
import {
  createFoundryQuestionGenerator,
  QuestionGeneratorError,
  type QuestionGenerator,
} from "./question-generator";
import { createCertDrillAdminRouter, createCertDrillUserRouter } from "./routes";
import {
  createFoundryScenarioGenerator,
  ScenarioGeneratorError,
  type ScenarioGenerator,
} from "./scenario-generator";
import { createCertDrillService } from "./service";

const QUESTION_IMPORT_MAX_RAW_BODY_BYTES = 5 * 1024 * 1024 + 64 * 1024;
export type CertDrillFoundryConfig = {
  projectEndpoint: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
};

type CertDrillApiModuleDeps = {
  db: PlatformDb;
  inngest: Inngest;
  foundry?: CertDrillFoundryConfig;
};


export function createCertDrillApiModule(deps: CertDrillApiModuleDeps): PlatformApiModule {
  const accessProvider = createAllPurchasedCertificationAccessProvider();
  const adminService = createCertDrillAdminService({
    db: deps.db,
    blueprintParser: createBlueprintParser(deps.foundry),
    questionGenerator: createQuestionGenerator(deps.foundry),
    scenarioGenerator: createScenarioGenerator(deps.foundry),
  });
  const userService = createCertDrillService({ db: deps.db, accessProvider });

  const blueprintParserJob = deps.inngest.createFunction(
    {
      id: "certdrill-blueprint-parser",
      name: "CertDrill blueprint parser",
      retries: 4,
      triggers: [cron("* * * * *")],
    },
    async ({ step }) => step.run("process-blueprint-parses", () => adminService.processPendingBlueprintParseRuns(5)),
  );
  const questionGeneratorJob = deps.inngest.createFunction(
    {
      id: "certdrill-question-generator",
      name: "CertDrill question generator",
      retries: 4,
      triggers: [cron("* * * * *")],
    },
    async ({ step }) => step.run("process-question-generation", () => adminService.processPendingQuestionGenerationJobs(3)),
  );
  const scenarioGeneratorJob = deps.inngest.createFunction(
    {
      id: "certdrill-scenario-generator",
      name: "CertDrill scenario generator",
      retries: 4,
      triggers: [cron("* * * * *")],
    },
    async ({ step }) => step.run("process-scenario-generation", () => adminService.processPendingScenarioGenerationJobs(1)),
  );

  return {
    id: "certdrill",
    routes: [
      {
        id: "certdrill-user",
        mountPath: "/api/certdrill",
        access: "user",
        router: createCertDrillUserRouter({ service: userService }),
      },
      {
        id: "certdrill-admin",
        mountPath: "/admin/certdrill",
        access: "admin",
        router: createCertDrillAdminRouter({ service: adminService }),
        guardrails: [
          {
            method: "POST",
            path: /^\/admin\/certdrill\/questions\/import$/,
            maxBodyBytes: QUESTION_IMPORT_MAX_RAW_BODY_BYTES,
            rateLimit: { windowMs: 60_000, max: 10 },
          },
          {
            method: "POST",
            path: /^\/admin\/certdrill\/questions\/import\/preview$/,
            maxBodyBytes: QUESTION_IMPORT_MAX_RAW_BODY_BYTES,
            rateLimit: { windowMs: 60_000, max: 30 },
          },
        ],
      },
    ],
    inngestFunctions: [blueprintParserJob, questionGeneratorJob, scenarioGeneratorJob],
    database: {
      migrationNamespace: "certdrill",
      tablePrefixes: ["certdrill_"],
    },
  };
}

function createBlueprintParser(config?: CertDrillFoundryConfig): BlueprintParser {
  if (config) return createFoundryBlueprintParser(foundryAdapterConfig(config));

  return {
    provider: "not-configured",
    model: "not-configured",
    async parse() {
      throw new BlueprintParserError(
        "BLUEPRINT_PARSER_NOT_CONFIGURED",
        "Blueprint parser is not configured.",
      );
    },
  };
}

function createQuestionGenerator(config?: CertDrillFoundryConfig): QuestionGenerator {
  if (config) return createFoundryQuestionGenerator(foundryAdapterConfig(config));

  return {
    provider: "not-configured",
    model: "not-configured",
    async generate() {
      throw new QuestionGeneratorError(
        "QUESTION_GENERATOR_NOT_CONFIGURED",
        "Question generator is not configured.",
      );
    },
  };
}

function createScenarioGenerator(config?: CertDrillFoundryConfig): ScenarioGenerator {
  if (config) return createFoundryScenarioGenerator(foundryAdapterConfig(config));

  return {
    provider: "not-configured",
    model: "not-configured",
    async generate() {
      throw new ScenarioGeneratorError(
        "SCENARIO_GENERATOR_NOT_CONFIGURED",
        "Scenario generator is not configured.",
      );
    },
  };
}

function foundryAdapterConfig(config: CertDrillFoundryConfig) {
  return {
    responsesUrl: buildFoundryResponsesUrl(config.projectEndpoint),
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs,
  };
}
