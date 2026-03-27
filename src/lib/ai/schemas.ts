import { z } from 'zod';

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
