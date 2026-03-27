import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { generateText } from 'ai';
import { getSettings, getModel } from '@/lib/ai/provider';
import { PLAN_SECTIONS, getSectionSystemPrompt } from '@/lib/ai/prompts/generate-plan';
import { normalizeMermaidMarkdown } from '@/lib/ai/mermaid';
import { repairMermaidWithAi } from '@/lib/ai/mermaid-pipeline';
import { generateDbSchemaMarkdown, generatePlanDiagramsMarkdown } from '@/lib/ai/diagram-generator';

type Params = { params: Promise<{ id: string }> };

type MermaidBlock = {
  index: number;
  start: number;
  end: number;
  code: string;
};

function getMermaidBlocks(content: string): MermaidBlock[] {
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  const blocks: MermaidBlock[] = [];
  let blockIndex = 0;
  let match: RegExpExecArray | null = regex.exec(content);

  while (match) {
    blocks.push({
      index: blockIndex,
      start: match.index,
      end: match.index + match[0].length,
      code: match[1].trim(),
    });
    blockIndex += 1;
    match = regex.exec(content);
  }

  return blocks;
}

async function fixInvalidMermaidBlocks(
  content: string,
  model: ReturnType<typeof getModel>,
  section: 'diagrams' | 'dbSchema'
): Promise<string> {
  let current = normalizeMermaidMarkdown(content);
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const blocks = getMermaidBlocks(current);
    if (blocks.length === 0) break;

    let anyFixed = false;

    // Process blocks back-to-front so string offsets stay valid.
    for (const block of [...blocks].reverse()) {
      const before = block.code.trim();
      const result = await repairMermaidWithAi({
        rawCode: block.code,
        model,
        section,
        maxRetries: 3,
      });

      console.log(
        `[PLAN][${section}] Mermaid repair block=${block.index} valid=${result.valid} attempts=${result.attempts} repaired=${result.repaired}`
      );

      if (result.valid) {
        const replacement = `\`\`\`mermaid\n${result.code}\n\`\`\``;
        current = current.slice(0, block.start) + replacement + current.slice(block.end);
        anyFixed = true;
        if (result.code.trim() === before && result.repaired) {
          console.log(`[PLAN][${section}] Mermaid repair converged without changing block=${block.index}`);
        }
      }
    }

    current = normalizeMermaidMarkdown(current);
    if (!anyFixed) break;
  }

  return current;
}

async function generateDiagramSectionContent(
  section: 'diagrams' | 'dbSchema',
  model: ReturnType<typeof getModel>,
  settings: Awaited<ReturnType<typeof getSettings>>,
  conversationContext: string,
  projectName: string,
  projectDescription: string | null,
  supportingDocuments?: string
): Promise<string> {
  if (section === 'diagrams') {
    return await generatePlanDiagramsMarkdown({
      model,
      temperature: settings.temperature,
      conversationContext,
      projectName,
      projectDescription: projectDescription || '',
      supportingDocuments,
    });
  }

  return await generateDbSchemaMarkdown({
    model,
    temperature: settings.temperature,
    conversationContext,
    projectName,
    projectDescription: projectDescription || '',
    supportingDocuments,
  });
}

// POST /api/projects/:id/plan - Generate or regenerate plan (section-by-section)
export async function POST(request: NextRequest, { params }: Params) {
  const { id } = await params;

  const project = await prisma.project.findUnique({
    where: { id },
    include: { conversations: { orderBy: { createdAt: 'asc' } } },
  });

  if (!project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Build the requirements summary from conversation history
  const conversationContext = project.conversations
    .map((c) => `${c.role}: ${c.content}`)
    .join('\n\n');

  const settings = await getSettings();
  const model = getModel(settings);

  // Failsafe: ensure status is at least REQUIREMENTS_LOCKED before generating
  await prisma.project.update({
    where: { id },
    data: { status: 'REQUIREMENTS_LOCKED' },
  });

  const sectionsGenerated: string[] = [];
  const sectionsFailed: string[] = [];
  const sectionContent = new Map<string, string>();

  // Ensure the plan row exists
  const existingPlan = await prisma.plan.upsert({
    where: { projectId: id },
    update: {},
    create: { projectId: id },
  });

  // Snapshot the existing plan before overwriting (if it has any content)
  const sectionKeys = ['prd', 'architecture', 'taskList', 'apiSpec', 'dbSchema', 'rules', 'workflow', 'diagrams', 'promptContext', 'effortEstimate'] as const;
  type SectionKey = (typeof sectionKeys)[number];
  const hasContent = sectionKeys.some((k) => {
    const value = existingPlan[k as keyof typeof existingPlan];
    return typeof value === 'string' && value.length > 0;
  });
  if (hasContent) {
    const snapshot: Record<SectionKey, string | null> = {
      prd: null,
      architecture: null,
      taskList: null,
      apiSpec: null,
      dbSchema: null,
      rules: null,
      workflow: null,
      diagrams: null,
      promptContext: null,
      effortEstimate: null,
    };
    for (const k of sectionKeys) {
      const value = existingPlan[k as keyof typeof existingPlan];
      snapshot[k] = typeof value === 'string' ? value : null;
    }
    await prisma.planSnapshot.create({
      data: {
        planId: existingPlan.id,
        version: existingPlan.version,
        content: JSON.stringify(snapshot),
      },
    });
    console.log(`[PLAN] Snapshot saved: v${existingPlan.version}`);
  }

  // Generate each section individually
  for (const section of PLAN_SECTIONS) {
    console.log(`[PLAN] Generating section: ${section} ...`);

    try {
      let content = '';

      if (section === 'diagrams' || section === 'dbSchema') {
        const supportingDocuments = ['prd', 'architecture', 'apiSpec', 'workflow', 'dbSchema']
          .filter((key) => key !== section)
          .map((key) => {
            const value = sectionContent.get(key);
            return value ? `## ${key}\n${value}` : '';
          })
          .filter(Boolean)
          .join('\n\n');

        content = await generateDiagramSectionContent(
          section,
          model,
          settings,
          conversationContext,
          project.name,
          project.description,
          supportingDocuments
        );
      } else {
        const { text } = await generateText({
          model,
          system: getSectionSystemPrompt(section),
          prompt: `Here is the full conversation with the user about their project:\n\n${conversationContext}\n\nProject Name: ${project.name}\nProject Description: ${project.description || 'N/A'}\n\nWrite the "${section}" section now.`,
          temperature: settings.temperature,
        });

        content = text.trim();
        const fenceMatch = content.match(/^```(?:markdown|md)?\s*\n?([\s\S]*?)```\s*$/);
        if (fenceMatch) {
          content = fenceMatch[1].trim();
        }
      }

      // Save this section immediately to the DB
      await prisma.plan.update({
        where: { projectId: id },
        data: { [section]: content },
      });

      sectionsGenerated.push(section);
  sectionContent.set(section, content);
      console.log(`[PLAN] ✅ Section "${section}" saved (${content.length} chars)`);
    } catch (error) {
      console.error(`[PLAN] ❌ Section "${section}" failed:`, error);
      sectionsFailed.push(section);

      // Save a placeholder so the UI always has something
      await prisma.plan.update({
        where: { projectId: id },
        data: {
          [section]: `> ⚠️ This section could not be generated automatically. You can edit it manually or try regenerating.\n\n_Error: ${String(error).substring(0, 200)}_`,
        },
      });
    }
  }

  // Bump version
  await prisma.plan.update({
    where: { projectId: id },
    data: { version: { increment: 1 } },
  });

  // Update project status
  await prisma.project.update({
    where: { id },
    data: { status: 'PLAN_GENERATED' },
  });

  // Fetch the final plan
  const plan = await prisma.plan.findUnique({ where: { projectId: id } });

  console.log(`[PLAN] Generation complete. Success: ${sectionsGenerated.length}/${PLAN_SECTIONS.length}, Failed: ${sectionsFailed.length}`);

  return NextResponse.json({ plan, sectionsGenerated, sectionsFailed });
}

// PATCH /api/projects/:id/plan - Edit a single plan section
export async function PATCH(request: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await request.json();
  const { section, content } = body;

  const validSections = [
    'prd', 'architecture', 'taskList', 'apiSpec',
    'dbSchema', 'rules', 'workflow', 'diagrams', 'promptContext', 'effortEstimate',
  ];

  if (!validSections.includes(section)) {
    return NextResponse.json({ error: `Invalid section: ${section}` }, { status: 400 });
  }

  const normalizedContent =
    (section === 'diagrams' || section === 'dbSchema') && typeof content === 'string'
      ? normalizeMermaidMarkdown(content)
      : content;

  const plan = await prisma.plan.update({
    where: { projectId: id },
    data: { [section]: normalizedContent },
  });

  return NextResponse.json({ plan });
}
