import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/:id
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const project = await prisma.project.findUnique({
    where: { id },
    include: {
      plan: true,
      conversations: { orderBy: { createdAt: 'asc' } },
      _count: { select: { commits: true, contextLogs: true } },
    },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  return NextResponse.json({ project });
}

// PATCH /api/projects/:id
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { name, description, status } = body;

  const project = await prisma.project.update({
    where: { id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(status && { status }),
    },
  });

  return NextResponse.json({ project });
}

// DELETE /api/projects/:id
export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.project.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
