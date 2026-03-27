/**
 * GET /api/test/diagrams
 *
 * Runs the full diagram generation pipeline against a fixed test project and
 * returns per-step timing, pass/fail status, and any error details.
 *
 * Use this after any diagram-related change to measure the actual failure rate
 * before and after rather than guessing.
 */
import { NextResponse } from 'next/server';
import { getSettings, getModel } from '@/lib/ai/provider';
import { generatePlanDiagramsMarkdown, generateDbSchemaMarkdown } from '@/lib/ai/diagram-generator';
import { parseMermaidServer } from '@/lib/ai/mermaid-server';

type StepResult = {
  step: string;
  success: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
};

const TEST_PROJECT_NAME = 'Test E-Commerce Platform';
const TEST_PROJECT_DESCRIPTION =
  'A simple online store where users can browse products, add them to a cart, and complete checkout with Stripe.';
const TEST_CONVERSATION_CONTEXT = [
  'user: I want to build a simple e-commerce platform for digital downloads.',
  'assistant: Great. What kinds of products and who are your users?',
  'user: Ebooks and software licenses. Small business owners are the main buyers.',
  'assistant: Understood. What features does the MVP need?',
  'user: Product catalog, cart, Stripe checkout, and a downloads page after purchase.',
].join('\n');

export async function GET() {
  const startTime = Date.now();
  const steps: StepResult[] = [];

  // ── Step 1: Load settings and model ──────────────────────────────────────
  let model: ReturnType<typeof getModel> | null = null;
  let settings: Awaited<ReturnType<typeof getSettings>> | null = null;
  {
    const t = Date.now();
    try {
      settings = await getSettings();
      model = getModel(settings);
      steps.push({
        step: 'load_settings',
        success: true,
        durationMs: Date.now() - t,
        detail: `provider=${settings.provider} model=${settings.model} temperature=${settings.temperature}`,
      });
    } catch (err) {
      steps.push({ step: 'load_settings', success: false, durationMs: Date.now() - t, error: String(err) });
      return NextResponse.json({ success: false, steps, totalMs: Date.now() - startTime });
    }
  }

  // ── Step 2: Plan diagrams ─────────────────────────────────────────────────
  let planMarkdown: string | null = null;
  {
    const t = Date.now();
    try {
      planMarkdown = await generatePlanDiagramsMarkdown({
        model: model!,
        temperature: settings!.temperature,
        conversationContext: TEST_CONVERSATION_CONTEXT,
        projectName: TEST_PROJECT_NAME,
        projectDescription: TEST_PROJECT_DESCRIPTION,
      });
      steps.push({
        step: 'plan_diagrams_generate',
        success: true,
        durationMs: Date.now() - t,
        detail: `${planMarkdown.length} chars`,
      });
    } catch (err) {
      steps.push({ step: 'plan_diagrams_generate', success: false, durationMs: Date.now() - t, error: String(err) });
    }
  }

  // ── Step 3: DB schema ─────────────────────────────────────────────────────
  let dbMarkdown: string | null = null;
  {
    const t = Date.now();
    try {
      dbMarkdown = await generateDbSchemaMarkdown({
        model: model!,
        temperature: settings!.temperature,
        conversationContext: TEST_CONVERSATION_CONTEXT,
        projectName: TEST_PROJECT_NAME,
        projectDescription: TEST_PROJECT_DESCRIPTION,
      });
      steps.push({
        step: 'db_schema_generate',
        success: true,
        durationMs: Date.now() - t,
        detail: `${dbMarkdown.length} chars`,
      });
    } catch (err) {
      steps.push({ step: 'db_schema_generate', success: false, durationMs: Date.now() - t, error: String(err) });
    }
  }

  // ── Step 4: Validate every Mermaid block ──────────────────────────────────
  const allMarkdown = [planMarkdown, dbMarkdown].filter(Boolean).join('\n\n');
  const blockMatches = Array.from(allMarkdown.matchAll(/```mermaid\s*([\s\S]*?)```/gi));
  const blockResults: Array<{ index: number; valid: boolean; firstLine: string; error?: string }> = [];
  {
    const t = Date.now();
    for (let i = 0; i < blockMatches.length; i++) {
      const code = blockMatches[i][1].trim();
      const result = await parseMermaidServer(code);
      blockResults.push({
        index: i,
        valid: result.valid,
        firstLine: code.split('\n')[0],
        error: result.error?.slice(0, 150),
      });
    }
    const validCount = blockResults.filter((r) => r.valid).length;
    steps.push({
      step: 'mermaid_parse_all_blocks',
      success: validCount === blockMatches.length,
      durationMs: Date.now() - t,
      detail: `${validCount}/${blockMatches.length} blocks valid`,
    });
  }

  const overallSuccess = steps.every((s) => s.success);
  return NextResponse.json({
    success: overallSuccess,
    totalMs: Date.now() - startTime,
    steps,
    blockResults,
    previews: {
      plan: planMarkdown?.slice(0, 800),
      db: dbMarkdown?.slice(0, 800),
    },
  });
}
