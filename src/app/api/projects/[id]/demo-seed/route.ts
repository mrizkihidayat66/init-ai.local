import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

type DemoMessage = {
  role: 'USER' | 'ASSISTANT' | 'SYSTEM';
  content: string;
};

const DEFAULT_MESSAGES: DemoMessage[] = [
  {
    role: 'USER',
    content:
      'I need an AI-assisted project planner that can clarify requirements, generate an implementation plan, and export project context for coding tools.',
  },
  {
    role: 'ASSISTANT',
    content:
      'Understood. I will focus on requirements capture, plan generation by sections, and export compatibility with external coding assistants.',
  },
  {
    role: 'USER',
    content:
      'Prioritize reliability over creativity, include diagrams, and keep the workflow understandable for solo developers.',
  },
  {
    role: 'ASSISTANT',
    content:
      'Great. I will include deterministic section-by-section generation, Mermaid diagram normalization, and clear export artifacts for downstream automation.',
  },
];

// POST /api/projects/:id/demo-seed - Seed deterministic conversation messages for recording/demo
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const project = await prisma.project.findUnique({ where: { id } });
  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const rawMessages = Array.isArray(body?.messages) ? body.messages : DEFAULT_MESSAGES;

  const messages: DemoMessage[] = rawMessages
    .filter(
      (item): item is DemoMessage =>
        item &&
        typeof item === 'object' &&
        (item.role === 'USER' || item.role === 'ASSISTANT' || item.role === 'SYSTEM') &&
        typeof item.content === 'string' &&
        item.content.trim().length > 0
    )
    .map((item) => ({ role: item.role, content: item.content.trim() }));

  if (messages.length === 0) {
    return NextResponse.json({ error: 'No valid messages provided' }, { status: 400 });
  }

  await prisma.conversation.createMany({
    data: messages.map((m) => ({
      projectId: id,
      role: m.role,
      content: m.content,
    })),
  });

  return NextResponse.json({ seeded: messages.length });
}
