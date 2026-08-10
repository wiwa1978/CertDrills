import { z } from "zod";

import type { CertDrillScenarioGenerationInput, CertDrillScenarioGenerationJob } from "@/lib/api/certdrill.server";

const PATH = "/api/certdrill/scenario-generation-jobs";
const jobSchema = z.object({
  id: z.string().uuid(),
  certificationId: z.string().uuid(),
  resourceIds: z.array(z.string().uuid()),
  requestedCount: z.number().int(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  focus: z.string().nullable(),
  instructions: z.string().nullable(),
  provider: z.string(),
  modelUsed: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  generatedCount: z.number().int().nullable(),
  errorMessage: z.string().nullable(),
  startedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).passthrough();
const envelopeSchema = z.object({ success: z.literal(true), data: jobSchema }).or(z.object({
  success: z.literal(false), error: z.object({ message: z.string().optional() }).optional(),
}));

async function requestJob(path: string, init?: RequestInit): Promise<CertDrillScenarioGenerationJob> {
  let response: Response;
  try { response = await fetch(path, { ...init, credentials: "same-origin" }); }
  catch (error) { throw new Error(error instanceof Error && error.message.trim() ? error.message : "Scenario generation request failed."); }
  const raw: unknown = await response.json().catch(() => null);
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) throw new Error("Scenario generation response was invalid.");
  if (!response.ok || !envelope.data.success) {
    throw new Error(envelope.data.success ? "Scenario generation request failed." : envelope.data.error?.message || "Scenario generation request failed.");
  }
  return envelope.data.data;
}

export function startScenarioGeneration(certificationId: string, input: CertDrillScenarioGenerationInput) {
  return requestJob(PATH, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ certificationId, ...input }),
  });
}

export function getScenarioGenerationJob(jobId: string) {
  return requestJob(`${PATH}/${jobId}`, { headers: { accept: "application/json" } });
}
