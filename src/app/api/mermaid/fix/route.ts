import { NextResponse } from 'next/server';
import { getModel, getSettings } from '@/lib/ai/provider';
import { repairMermaidWithAi } from '@/lib/ai/mermaid-pipeline';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const rawCode = typeof body?.code === 'string' ? body.code : '';

    if (!rawCode.trim()) {
      return NextResponse.json({ error: 'code is required' }, { status: 400 });
    }

    const settings = await getSettings();
    const model = getModel(settings);
    const result = await repairMermaidWithAi({
      rawCode,
      model,
      section: 'diagrams',
      maxRetries: 3,
    });

    return NextResponse.json({
      code: result.code,
      repaired: result.repaired,
      valid: result.valid,
      attempts: result.attempts,
      error: result.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
