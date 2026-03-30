import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

const SECTION_KEYS = ['prd', 'architecture', 'taskList', 'apiSpec', 'dbSchema', 'rules', 'workflow', 'diagrams', 'promptContext', 'effortEstimate'] as const;

function getSectionsWithContent(content: Record<string, string | null>): string[] {
  return SECTION_KEYS.filter((k) => {
    const v = content[k];
    return typeof v === 'string' && v.length > 0 && !v.startsWith('> ⚠️');
  });
}

// GET /api/projects/:id/plan/snapshots
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const plan = await prisma.plan.findUnique({ where: { projectId: id } });
  if (!plan) return NextResponse.json({ snapshots: [] });

  const rows = await prisma.planSnapshot.findMany({
    where: { planId: plan.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, version: true, createdAt: true, content: true },
  });

  const snapshots = rows.map((row) => {
    let sections: string[] = [];
    try {
      sections = getSectionsWithContent(JSON.parse(row.content) as Record<string, string | null>);
    } catch {
      // malformed content — leave sections empty
    }
    return { id: row.id, version: row.version, createdAt: row.createdAt, sections };
  });

  return NextResponse.json({ snapshots });
}

// POST /api/projects/:id/plan/snapshots — restore a snapshot
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { snapshotId } = body;

  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
  }

  const snapshot = await prisma.planSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot) return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });

  const plan = await prisma.plan.findUnique({ where: { projectId: id } });
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const restoredContent = JSON.parse(snapshot.content) as Record<string, string | null>;
  const updateData: Record<string, unknown> = { version: { increment: 1 } };
  for (const k of SECTION_KEYS) {
    updateData[k] = restoredContent[k] ?? null;
  }

  const updated = await prisma.plan.update({ where: { projectId: id }, data: updateData });
  return NextResponse.json({ plan: updated, restoredFromVersion: snapshot.version });
}

// DELETE /api/projects/:id/plan/snapshots?snapshotId=<id>
export async function DELETE(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const snapshotId = new URL(request.url).searchParams.get('snapshotId');

  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshotId query param is required' }, { status: 400 });
  }

  // Verify the snapshot belongs to this project's plan before deleting
  const plan = await prisma.plan.findUnique({ where: { projectId: id } });
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 });

  const snapshot = await prisma.planSnapshot.findUnique({ where: { id: snapshotId } });
  if (!snapshot || snapshot.planId !== plan.id) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  await prisma.planSnapshot.delete({ where: { id: snapshotId } });
  return NextResponse.json({ deleted: true });
}
