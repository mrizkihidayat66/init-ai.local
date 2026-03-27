import { z } from 'zod';

const semanticIdSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^[A-Za-z][A-Za-z0-9_\- ]*$/, 'Identifier must start with a letter and contain letters, numbers, spaces, underscores, or hyphens');

const mermaidSafeTextSchema = z.string().trim().min(1).max(200);

export const flowNodeSchema = z.object({
  id: semanticIdSchema.describe('Stable semantic node identifier such as user, web_app, auth_service.'),
  label: mermaidSafeTextSchema.describe('Human-readable label shown in the node.'),
  type: z.enum(['actor', 'process', 'service', 'database', 'decision', 'start', 'end']).default('process'),
});

export const flowEdgeSchema = z.object({
  from: semanticIdSchema,
  to: semanticIdSchema,
  label: z.string().trim().max(120).optional(),
});

export const flowDiagramSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  nodes: z.array(flowNodeSchema).min(2),
  edges: z.array(flowEdgeSchema).min(1),
});

export const erAttributeSchema = z.object({
  name: semanticIdSchema.describe('Entity field name such as email or createdAt.'),
  type: z.string().trim().min(1).max(60).describe('Logical field type such as string, int, datetime, boolean.'),
  keys: z.array(z.enum(['PK', 'FK', 'UK'])).default([]),
  comment: z.string().trim().max(120).optional(),
});

export const erEntitySchema = z.object({
  id: semanticIdSchema.describe('Stable entity identifier such as user_account or order_item.'),
  label: mermaidSafeTextSchema.describe('Human-readable entity label.'),
  description: z.string().trim().min(1).max(240),
  attributes: z.array(erAttributeSchema).min(1),
});

export const erCardinalitySchema = z.enum(['zero_or_one', 'exactly_one', 'zero_or_more', 'one_or_more']);

export const erRelationshipSchema = z.object({
  from: semanticIdSchema,
  to: semanticIdSchema,
  fromCardinality: erCardinalitySchema,
  toCardinality: erCardinalitySchema,
  label: z.string().trim().min(1).max(80),
  identifying: z.boolean().default(true),
});

export const erDiagramSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  entities: z.array(erEntitySchema).min(2),
  relationships: z.array(erRelationshipSchema).min(1),
});

export const sequenceParticipantSchema = z.object({
  id: semanticIdSchema,
  label: mermaidSafeTextSchema,
  type: z.enum(['participant', 'actor', 'boundary', 'control', 'entity', 'database', 'queue']).default('participant'),
});

export const sequenceMessageSchema = z.object({
  from: semanticIdSchema,
  to: semanticIdSchema,
  label: z.string().trim().min(1).max(160),
  type: z.enum(['sync', 'async', 'response']).default('sync'),
});

export const sequenceDiagramSchema = z.object({
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(240),
  participants: z.array(sequenceParticipantSchema).min(2),
  messages: z.array(sequenceMessageSchema).min(1),
});

export const planDiagramsSchema = z.object({
  systemArchitecture: flowDiagramSchema,
  entityRelationship: erDiagramSchema,
  userFlow: flowDiagramSchema,
  keySequence: sequenceDiagramSchema,
});

export const dbEntitySchema = z.object({
  id: semanticIdSchema,
  label: mermaidSafeTextSchema,
  description: z.string().trim().min(1).max(240),
  attributes: z.array(erAttributeSchema).min(1),
  indexes: z.array(z.string().trim().min(1).max(120)).default([]),
});

export const dbSchemaDocumentSchema = z.object({
  overview: z.string().trim().min(1).max(500),
  entities: z.array(dbEntitySchema).min(3),
  relationships: z.array(erRelationshipSchema).min(1),
  constraints: z.array(z.string().trim().min(1).max(160)).default([]),
});

// Schema for a single clarification question
export const questionSchema = z.object({
  id: z.string(),
  dimension: z.string(),
  question: z.string(),
  options: z.array(z.string()),
  recommendation: z.string(),
});

// Schema for the clarification response
export const clarifyResponseSchema = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('needs_clarification'),
    covered: z.array(z.string()),
    missing: z.array(z.string()),
    questions: z.array(questionSchema),
  }),
  z.object({
    status: z.literal('requirements_complete'),
    summary: z.object({
      projectName: z.string(),
      problemStatement: z.string(),
      targetAudience: z.string(),
      coreFeatures: z.array(z.string()),
      techStack: z.object({
        frontend: z.string(),
        backend: z.string(),
        database: z.string(),
        hosting: z.string(),
      }),
      dataModel: z.array(z.string()),
      auth: z.object({
        required: z.boolean(),
        method: z.string(),
        roles: z.array(z.string()),
      }),
      integrations: z.array(z.string()),
      deployment: z.string(),
      designNotes: z.string(),
    }),
  }),
]);

// Schema for the plan generation response
export const planResponseSchema = z.object({
  prd: z.string(),
  architecture: z.string(),
  taskList: z.string(),
  apiSpec: z.string(),
  dbSchema: z.string(),
  rules: z.string(),
  workflow: z.string(),
  diagrams: z.string(),
  promptContext: z.string(),
});

export type ClarifyResponse = z.infer<typeof clarifyResponseSchema>;
export type PlanResponse = z.infer<typeof planResponseSchema>;
export type Question = z.infer<typeof questionSchema>;
export type FlowDiagram = z.infer<typeof flowDiagramSchema>;
export type ErDiagram = z.infer<typeof erDiagramSchema>;
export type SequenceDiagram = z.infer<typeof sequenceDiagramSchema>;
export type PlanDiagrams = z.infer<typeof planDiagramsSchema>;
export type DbSchemaDocument = z.infer<typeof dbSchemaDocumentSchema>;
