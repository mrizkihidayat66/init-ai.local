import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText } from 'ai';
import { getSettings, getModel } from '@/lib/ai/provider';
import { CLARIFY_SYSTEM_PROMPT } from '@/lib/ai/prompts/clarify';
import { jsonrepair } from 'jsonrepair';
import { clarifyResponseSchema } from '@/lib/ai/schemas';

type ParsedResponse = {
  status: 'needs_clarification' | 'requirements_complete';
  covered?: string[];
  missing?: string[];
  questions?: Array<{
    id?: string;
    dimension?: string;
    question?: string;
    options?: string[];
    recommendation?: string;
  }>;
  summary?: Record<string, unknown>;
};

function parseModelPayload(text: string): ParsedResponse | null {
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1] : text;

  let potentialJson = jsonStr;
  if (!jsonMatch) {
    const firstCurly = text.indexOf('{');
    const lastCurly = text.lastIndexOf('}');
    if (firstCurly !== -1 && lastCurly !== -1) {
      potentialJson = text.substring(firstCurly, lastCurly + 1);
    }
  }

  try {
    return JSON.parse(potentialJson.trim());
  } catch {
    try {
      const repaired = jsonrepair(potentialJson.trim());
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

function getConversationalPrefix(text: string): string {
  const clean = text.replace(/```(?:json)?[\s\S]*?(```|$)/g, '').trim();
  return clean || 'Thanks. I reviewed your input and prepared the next clarification step.';
}

function fallbackQuestionForDimension(dimension: string, idx: number) {
  const defaults: Record<string, { q: string; o: string[]; r: string }> = {
    problem: {
      q: 'Who is the primary target user and what pain should this product solve first?',
      o: ['Internal team workflow', 'Small business operations', 'Consumer productivity', 'Other'],
      r: 'Start from one clear user segment and one measurable pain point.',
    },
    features: {
      q: 'Which feature must be included in MVP before launch?',
      o: ['Project/task CRUD', 'Real-time collaboration', 'Notifications', 'Other'],
      r: 'Define one core workflow end-to-end before adding advanced features.',
    },
    tech_stack: {
      q: 'Which stack should we optimize for implementation speed and maintainability?',
      o: ['Next.js + TypeScript', 'Python FastAPI + React', 'Node + Express', 'No strong preference'],
      r: 'Use a single typed full-stack setup when speed is the priority.',
    },
    data_model: {
      q: 'Which entities are mandatory in the first schema revision?',
      o: ['Users, Projects, Tasks', 'Users, Workspaces, Tickets', 'Users, Plans, Commits', 'Other'],
      r: 'Keep the initial schema small and normalize relationships early.',
    },
    auth: {
      q: 'What authentication and role scope is required for v1?',
      o: ['Email/password only', 'OAuth + email/password', 'No auth for MVP', 'Other'],
      r: 'Choose the minimum secure auth flow that fits MVP usage.',
    },
    integrations: {
      q: 'Do you need third-party integrations in MVP?',
      o: ['None for MVP', 'Payments', 'Email/notifications', 'Analytics'],
      r: 'Defer non-essential integrations unless they are core to user value.',
    },
    deployment: {
      q: 'Where should the first production deployment run?',
      o: ['VPS / Docker', 'Managed cloud platform', 'Self-hosted on-prem', 'Not decided yet'],
      r: 'Pick a deployment target early to avoid infra rework later.',
    },
    design: {
      q: 'What UX style and complexity level do you want for MVP?',
      o: ['Minimal dashboard UI', 'Modern SaaS style', 'Mobile-first workflow', 'Other'],
      r: 'Keep visual scope constrained while validating product workflow.',
    },
  };

  const d = defaults[dimension] ?? defaults.features;
  return {
    id: `fallback_${dimension || 'q'}_${idx + 1}`,
    dimension: dimension || 'general',
    question: d.q,
    options: d.o,
    recommendation: d.r,
  };
}

function normalizeClarifyPayload(payload: ParsedResponse | null): ParsedResponse {
  if (!payload || (payload.status !== 'needs_clarification' && payload.status !== 'requirements_complete')) {
    return {
      status: 'needs_clarification',
      covered: [],
      missing: ['problem', 'features', 'tech_stack', 'data_model', 'auth', 'integrations', 'deployment', 'design'],
      questions: [fallbackQuestionForDimension('problem', 0), fallbackQuestionForDimension('features', 1)],
    };
  }

  if (payload.status === 'requirements_complete') {
    return payload;
  }

  const covered = Array.isArray(payload.covered) ? payload.covered.filter(Boolean) : [];
  const missing = Array.isArray(payload.missing) ? payload.missing.filter(Boolean) : [];
  const rawQuestions = Array.isArray(payload.questions) ? payload.questions : [];

  let questions = rawQuestions.map((q, idx) => {
    const options = Array.from(new Set([...(Array.isArray(q.options) ? q.options.filter(Boolean) : []), 'Other']));
    return {
      id: q.id || `q_${idx + 1}`,
      dimension: q.dimension || missing[idx] || 'general',
      question: q.question || fallbackQuestionForDimension(missing[idx] || 'features', idx).question,
      options: options.length > 1 ? options : fallbackQuestionForDimension(missing[idx] || 'features', idx).options,
      recommendation:
        q.recommendation || fallbackQuestionForDimension(missing[idx] || 'features', idx).recommendation,
    };
  });

  if (questions.length === 0) {
    const sourceDims = missing.length > 0 ? missing.slice(0, 2) : ['features', 'tech_stack'];
    questions = sourceDims.map((dim, idx) => fallbackQuestionForDimension(dim, idx));
  }

  return {
    status: 'needs_clarification',
    covered,
    missing,
    questions,
  };
}

// POST /api/chat - Handle the clarification conversation loop
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { projectId, message } = body;

  if (!projectId || !message) {
    return NextResponse.json(
      { error: 'projectId and message are required' },
      { status: 400 }
    );
  }

  // Save user message
  await prisma.conversation.create({
    data: {
      projectId,
      role: 'USER',
      content: message,
    },
  });

  // Get full conversation history
  const conversations = await prisma.conversation.findMany({
    where: { projectId },
    orderBy: { createdAt: 'asc' },
  });

  const messages = conversations.map((c) => ({
    role: c.role.toLowerCase() as 'user' | 'assistant' | 'system',
    content: c.content,
  }));

  const settings = await getSettings();
  const model = getModel(settings);

  console.log(`\n================================`);
  console.log(`[DEBUG] Test Case Execution Start`);
  console.log(`[DEBUG] Project ID: ${projectId}`);
  console.log(`[DEBUG] Provider: ${settings.provider} | Model: ${model.modelId}`);
  console.log(`[DEBUG] Incoming Message: "${message.substring(0, 100)}..."`);
  console.log(`================================\n`);

  const result = await generateText({
    model,
    system: CLARIFY_SYSTEM_PROMPT,
    messages,
    temperature: settings.temperature,
  });

  const parsed = normalizeClarifyPayload(parseModelPayload(result.text));
  const conversational = getConversationalPrefix(result.text);
  const normalizedText = `${conversational}\n\n\`\`\`json\n${JSON.stringify(parsed, null, 2)}\n\`\`\``;

  const schemaValidated = clarifyResponseSchema.safeParse(parsed);
  if (!schemaValidated.success) {
    console.log('[DEBUG] Clarify payload required normalization fallback');
  }

  await prisma.conversation.create({
    data: {
      projectId,
      role: 'ASSISTANT',
      content: normalizedText,
    },
  });

  if (parsed.status === 'requirements_complete') {
    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'REQUIREMENTS_LOCKED' },
    });
  }

  return new Response(normalizedText, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
