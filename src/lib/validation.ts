/**
 * SystemLab — Schémas de validation Zod (entrées API + configurations).
 * Le navigateur n'est jamais cru : tout ce qui transite par l'API est validé.
 */
import { z } from "zod";

/* ---------- Primitives ---------- */

export const protocolSchema = z.enum([
  "http",
  "https",
  "tcp",
  "grpc",
  "websocket",
  "amqp",
  "kafka",
  "redis",
  "sql",
]);

export const zoneColorSchema = z.enum([
  "indigo",
  "cyan",
  "emerald",
  "amber",
  "violet",
  "rose",
]);

export const positionSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

export const configValueSchema = z.union([
  z.number().finite(),
  z.string().max(120),
  z.boolean(),
]);

/* ---------- Architecture ---------- */

export const archNodeSchema = z.object({
  id: z.string().min(1).max(80),
  componentId: z.string().min(1).max(80),
  label: z.string().min(1).max(120),
  // Clés de config bornées (les clés du catalogue font ≤ 25 caractères)
  config: z.record(z.string().max(40), configValueSchema),
  position: positionSchema,
  zoneId: z.string().max(80).optional(),
});

export const archEdgeSchema = z.object({
  id: z.string().min(1).max(120),
  source: z.string().min(1).max(80),
  target: z.string().min(1).max(80),
  protocol: protocolSchema,
  networkLatencyMs: z.number().min(0).max(2000),
  bandwidthMbps: z.number().min(0).max(100000),
  label: z.string().max(80).optional(),
});

export const archZoneSchema = z.object({
  id: z.string().min(1).max(80),
  label: z.string().min(1).max(80),
  color: zoneColorSchema,
  position: positionSchema,
  size: z.object({
    width: z.number().min(50).max(5000),
    height: z.number().min(50).max(5000),
  }),
});

export const failureScenarioSchema = z.object({
  nodeId: z.string().min(1).max(80),
  startSec: z.number().min(0).max(600),
  durationSec: z.number().min(1).max(600),
  kind: z.enum(["outage", "degradation"]),
  severity: z.number().min(0).max(1),
  recoverySec: z.number().min(0).max(300),
});

export const scenarioSchema = z.object({
  activeUsers: z.number().int().min(1).max(10_000_000),
  requestsPerSecond: z.number().min(0.1).max(200_000),
  durationSec: z.number().int().min(5).max(600),
  readRatio: z.number().min(0).max(1),
  networkLatencyMs: z.number().min(0).max(2000),
  baseErrorRate: z.number().min(0).max(1),
  requestSizeKb: z.number().min(0).max(10240),
  profile: z.enum(["constant", "ramp", "spike", "waves", "random"]),
  mode: z.enum(["quick", "load", "stress", "endurance", "failure"]),
  seed: z.number().int().min(0).max(2_147_483_647),
  budgetPerMonthUsd: z.number().min(0).max(10_000_000),
  failure: failureScenarioSchema.nullable(),
});

export const architectureDataSchema = z
  .object({
    name: z.string().min(1).max(120),
    description: z.string().max(500).optional(),
    nodes: z.array(archNodeSchema).max(60, "60 nœuds maximum"),
    edges: z.array(archEdgeSchema).max(120),
    zones: z.array(archZoneSchema).max(12),
    scenario: scenarioSchema,
  })
  .refine((d) => JSON.stringify(d).length < 512_000, {
    message: "Architecture trop volumineuse",
  });

export const createArchitectureSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  data: architectureDataSchema,
});

export const updateArchitectureSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  data: architectureDataSchema.optional(),
});

/** Résumé `overall` d'un résultat de simulation (contrôle structurel minimal). */
export const simulationOverallSummarySchema = z
  .object({
    servedRps: z.number().finite(),
    p95Ms: z.number().finite(),
    errorRate: z.number().finite(),
    availability: z.number().finite(),
    costPerMonthUsd: z.number().finite(),
  })
  .passthrough();

/** Résultat de simulation — structure minimale (overall obligatoire), reste libre. */
export const simulationResultSchema = z
  .object({
    overall: simulationOverallSummarySchema,
  })
  .passthrough()
  .refine((r) => JSON.stringify(r).length < 2_000_000, "Résultat trop volumineux");

export const createSimulationSchema = z.object({
  architectureId: z.string().min(1),
  label: z.string().max(120).optional(),
  engineVersion: z.string().max(20),
  mode: z.enum(["analytical", "event-sampled"]),
  seed: z.number().int().min(0).max(2_147_483_647),
  scenario: scenarioSchema,
  /** Résultat complet — structurellement validé (overall) et borné */
  result: simulationResultSchema,
});

export type CreateArchitectureInput = z.infer<typeof createArchitectureSchema>;
export type UpdateArchitectureInput = z.infer<typeof updateArchitectureSchema>;
export type CreateSimulationInput = z.infer<typeof createSimulationSchema>;
