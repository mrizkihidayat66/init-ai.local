import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// GET /api/projects - List all projects
export async function GET() {
  const projects = await prisma.project.findMany({
    orderBy: { updatedAt: 'desc' },
    include: {
      plan: { select: { id: true, version: true } },
      _count: { select: { conversations: true, commits: true, contextLogs: true } },
    },
  });
  return NextResponse.json({ projects });
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, description } = body;

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }

  const project = await prisma.project.create({
    data: { name, description: description || null },
  });

  return NextResponse.json({ project }, { status: 201 });
}
