import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/:id/commit - List commits
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');

  const commits = await prisma.commit.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return NextResponse.json({ commits });
}

// POST /api/projects/:id/commit - Record a new commit/revision
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { version, message, diff, snapshot, author, parentId } = body;

  if (!version || !message || !author) {
    return NextResponse.json(
      { error: 'version, message, and author are required' },
      { status: 400 }
    );
  }

  const commit = await prisma.commit.create({
    data: {
      projectId: id,
      version,
      message,
      diff: diff || null,
      snapshot: snapshot ? JSON.stringify(snapshot) : null,
      author,
      parentId: parentId || null,
    },
  });

  // Only advance to IN_PROGRESS from early stages — never downgrade from PLAN_GENERATED
  const project = await prisma.project.findUnique({ where: { id }, select: { status: true } });
  const earlyStatuses = ['CLARIFYING', 'REQUIREMENTS_LOCKED'];
  if (project && earlyStatuses.includes(project.status)) {
    await prisma.project.update({
      where: { id },
      data: { status: 'IN_PROGRESS' },
    });
  }

  return NextResponse.json({ commit }, { status: 201 });
}
