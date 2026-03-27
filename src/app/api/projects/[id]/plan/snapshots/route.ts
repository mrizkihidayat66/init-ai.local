import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/:id/plan/snapshots - List all plan snapshots
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const plan = await prisma.plan.findUnique({
    where: { projectId: id },
  });

  if (!plan) {
    return NextResponse.json({ snapshots: [] });
  }

  const snapshots = await prisma.planSnapshot.findMany({
    where: { planId: plan.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      version: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ snapshots });
}

// POST /api/projects/:id/plan/snapshots - Restore a snapshot
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { snapshotId } = body;

  if (!snapshotId) {
    return NextResponse.json({ error: 'snapshotId is required' }, { status: 400 });
  }

  const snapshot = await prisma.planSnapshot.findUnique({
    where: { id: snapshotId },
  });

  if (!snapshot) {
    return NextResponse.json({ error: 'Snapshot not found' }, { status: 404 });
  }

  const plan = await prisma.plan.findUnique({ where: { projectId: id } });
  if (!plan) {
    return NextResponse.json({ error: 'Plan not found' }, { status: 404 });
  }

  // Snapshot current state before restoring
  const sectionKeys = ['prd', 'architecture', 'taskList', 'apiSpec', 'dbSchema', 'rules', 'workflow', 'diagrams', 'promptContext', 'effortEstimate'] as const;
  const currentSnapshot: Record<string, string | null> = {};
  for (const k of sectionKeys) {
    currentSnapshot[k] = (plan as any)[k] ?? null;
  }
  await prisma.planSnapshot.create({
    data: {
      planId: plan.id,
      version: plan.version,
      content: JSON.stringify(currentSnapshot),
    },
  });

  // Restore the selected snapshot
  const restoredContent = JSON.parse(snapshot.content);
  const updateData: Record<string, any> = { version: { increment: 1 } };
  for (const k of sectionKeys) {
    updateData[k] = restoredContent[k] ?? null;
  }

  const updated = await prisma.plan.update({
    where: { projectId: id },
    data: updateData,
  });

  return NextResponse.json({ plan: updated, restoredFromVersion: snapshot.version });
}
