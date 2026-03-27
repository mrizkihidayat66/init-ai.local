import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/:id/context - List context logs
export async function GET(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const logs = await prisma.contextLog.findMany({
    where: { projectId: id },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  const total = await prisma.contextLog.count({ where: { projectId: id } });

  return NextResponse.json({ logs, total });
}

// POST /api/projects/:id/context - Push context from external tool
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { source, type, content, metadata } = body;

  if (!source || !type || !content) {
    return NextResponse.json(
      { error: 'source, type, and content are required' },
      { status: 400 }
    );
  }

  const log = await prisma.contextLog.create({
    data: {
      projectId: id,
      source,
      type,
      content,
      metadata: metadata ? JSON.stringify(metadata) : null,
    },
  });

  return NextResponse.json({ log }, { status: 201 });
}
