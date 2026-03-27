// Shared TypeScript types

export type ProjectStatus =
  | 'CLARIFYING'
  | 'REQUIREMENTS_LOCKED'
  | 'PLAN_GENERATED'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type MessageRole = 'USER' | 'ASSISTANT' | 'SYSTEM';

export type PlanSection =
  | 'prd'
  | 'architecture'
  | 'taskList'
  | 'apiSpec'
  | 'dbSchema'
  | 'rules'
  | 'workflow'
  | 'diagrams'
  | 'promptContext'
  | 'effortEstimate';

export const PLAN_SECTION_LABELS: Record<PlanSection, string> = {
  prd: 'Product Requirements',
  architecture: 'Architecture',
  taskList: 'Task List',
  apiSpec: 'API Specification',
  dbSchema: 'Database Schema',
  rules: 'Agent Rules',
  workflow: 'Workflow',
  diagrams: 'Diagrams',
  promptContext: 'Prompt Context',
  effortEstimate: 'Effort Estimate',
};

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  CLARIFYING: 'Clarifying',
  REQUIREMENTS_LOCKED: 'Requirements Locked',
  PLAN_GENERATED: 'Plan Generated',
  IN_PROGRESS: 'In Progress',
  COMPLETED: 'Completed',
};

export const PROJECT_STATUS_COLORS: Record<ProjectStatus, string> = {
  CLARIFYING: 'bg-yellow-500/20 text-yellow-400',
  REQUIREMENTS_LOCKED: 'bg-blue-500/20 text-blue-400',
  PLAN_GENERATED: 'bg-green-500/20 text-green-400',
  IN_PROGRESS: 'bg-purple-500/20 text-purple-400',
  COMPLETED: 'bg-emerald-500/20 text-emerald-400',
};
