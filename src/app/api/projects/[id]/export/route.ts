import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { buildProjectZip } from '@/lib/export/zip-builder';

type Params = { params: Promise<{ id: string }> };

// GET /api/projects/:id/export - Download project plan as ZIP
export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { plan: true },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  if (!project.plan) {
    return NextResponse.json({ error: 'No plan generated yet' }, { status: 400 });
  }

  const zip = buildProjectZip(project, project.plan);
  const buffer = await zip.generateAsync({ type: 'nodebuffer' });

  const safeName = (project.name || 'project')
    .replace(/[^a-zA-Z0-9-_\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(buffer));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}-plan.zip"`,
      'Content-Length': String(buffer.length),
    },
  });
}
