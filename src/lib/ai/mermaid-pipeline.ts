import { generateText } from 'ai';
import { autoFixMermaidCode } from '@/lib/ai/mermaid';
import { parseMermaidServer } from '@/lib/ai/mermaid-server';

type DiagramSection = 'diagrams' | 'dbSchema';
type ModelLike = Parameters<typeof generateText>[0]['model'];

export type RepairMermaidInput = {
  rawCode: string;
  model: ModelLike;
  section: DiagramSection;
  maxRetries?: number;
};

export type RepairMermaidResult = {
  code: string;
  repaired: boolean;
  valid: boolean;
  attempts: number;
  error?: string;
};

function getSectionRules(section: DiagramSection): string {
  if (section === 'dbSchema') {
    return [
      '- First line must be exactly erDiagram',
      '- Keep entity names in PascalCase without spaces',
      '- Quote ERD relationship labels with spaces',
      '- Preserve original entities and relationships',
    ].join('\n');
  }

  return [
    '- First line must be a valid Mermaid diagram type keyword',
    '- Keep original intent and entities',
    '- Ensure syntax is fully renderable',
  ].join('\n');
}

export async function repairMermaidWithAi(input: RepairMermaidInput): Promise<RepairMermaidResult> {
  const maxRetries = input.maxRetries ?? 3;
  let current = autoFixMermaidCode(input.rawCode) || input.rawCode.trim();
  let parseResult = await parseMermaidServer(current);
  let previousInvalid = current;

  if (parseResult.valid) {
    return { code: current, repaired: false, valid: true, attempts: 0 };
  }

  let attempt = 0;
  while (!parseResult.valid && attempt < maxRetries) {
    const { text } = await generateText({
      model: input.model,
      temperature: 0.1,
      prompt: `You are a Mermaid diagram syntax repair engine.
Fix the diagram below so it parses without errors.
Return ONLY corrected Mermaid code, no markdown fences, no explanations.

Actual Mermaid parser error:
${parseResult.error}

Requirements:
${getSectionRules(input.section)}

Diagram to fix:
${current}`,
    });

    const candidate = autoFixMermaidCode(text.trim());
    if (candidate) {
      if (candidate.trim() === previousInvalid.trim()) {
        break;
      }
      current = candidate;
      previousInvalid = candidate;
    }

    parseResult = await parseMermaidServer(current);
    attempt += 1;
  }

  return {
    code: current,
    repaired: attempt > 0,
    valid: parseResult.valid,
    attempts: attempt,
    error: parseResult.valid ? undefined : parseResult.error,
  };
}
