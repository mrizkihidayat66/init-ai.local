import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2021';
}

// GET /api/projects - List all projects
export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { updatedAt: 'desc' },
      include: {
        plan: { select: { id: true, version: true } },
        _count: { select: { conversations: true, commits: true, contextLogs: true } },
      },
    });
    return NextResponse.json({ projects });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Database schema is not initialized. Run `npm run db:push` or `npm run db:migrate`.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  try {
    const project = await prisma.project.create({
      data: { name, description: description || null },
    });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Database schema is not initialized. Run `npm run db:push` or `npm run db:migrate`.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
  }
}
