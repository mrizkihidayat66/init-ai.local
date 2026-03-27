import { generateText } from 'ai';
import type { z } from 'zod';
import { jsonrepair } from 'jsonrepair';
import {
  dbSchemaDocumentSchema,
  planDiagramsSchema,
  type DbSchemaDocument,
  type ErDiagram,
  type FlowDiagram,
  type PlanDiagrams,
  type SequenceDiagram,
} from '@/lib/ai/schemas';
import { parseMermaidServer } from '@/lib/ai/mermaid-server';

type ModelLike = Parameters<typeof generateText>[0]['model'];

type DiagramGenerationInput = {
  model: ModelLike;
  temperature: number;
  conversationContext: string;
  projectName: string;
  projectDescription: string;
  supportingDocuments?: string;
};

type ValidationResult = {
  valid: boolean;
  issues: string[];
};

function normalizeIdentifier(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const base = cleaned || fallbackPrefix;
  const prefixed = /^[A-Za-z]/.test(base) ? base : `${fallbackPrefix}_${base}`;
  return prefixed.toLowerCase();
}

function toPascalCase(raw: string, fallbackPrefix: string): string {
  const identifier = normalizeIdentifier(raw, fallbackPrefix);
  return identifier
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

function escapeMermaidText(value: string): string {
  return value
    .trim()
    .replace(/"/g, '#quot;')
    .replace(/#/g, '#35;')
    .replace(/</g, '#lt;')
    .replace(/>/g, '#gt;');
}

function buildSafeIdentifierMap(values: string[], prefix: string): Map<string, string> {
  const counts = new Map<string, number>();
  const mapping = new Map<string, string>();

  for (const value of values) {
    const normalized = normalizeIdentifier(value, prefix);
    const base = `${prefix}_${normalized}`;
    const count = counts.get(base) ?? 0;
    counts.set(base, count + 1);
    mapping.set(value.trim().toLowerCase(), count === 0 ? base : `${base}_${count + 1}`);
  }

  return mapping;
}

function getMappedId(mapping: Map<string, string>, value: string, fallbackPrefix: string): string {
  return mapping.get(value.trim().toLowerCase()) ?? `${fallbackPrefix}_${normalizeIdentifier(value, fallbackPrefix)}`;
}

function formatFlowNode(node: FlowDiagram['nodes'][number], nodeId: string): string {
  const label = escapeMermaidText(node.label);

  switch (node.type) {
    case 'actor':
      return `${nodeId}(["${label}"])`;
    case 'database':
      return `${nodeId}[("${label}")]`;
    case 'decision':
      return `${nodeId}{"${label}"}`;
    case 'start':
    case 'end':
      return `${nodeId}(("${label}"))`;
    default:
      return `${nodeId}["${label}"]`;
  }
}

function formatFlowEdge(edge: FlowDiagram['edges'][number], idMap: Map<string, string>): string {
  const from = getMappedId(idMap, edge.from, 'node');
  const to = getMappedId(idMap, edge.to, 'node');
  const label = edge.label?.trim() ? ` -->|${escapeMermaidText(edge.label)}| ` : ' --> ';
  return `${from}${label}${to}`;
}

function formatLeftCardinality(value: DbSchemaDocument['relationships'][number]['fromCardinality']): string {
  switch (value) {
    case 'zero_or_one':
      return 'o|';
    case 'exactly_one':
      return '||';
    case 'zero_or_more':
      return '}o';
    case 'one_or_more':
      return '}|';
  }
}

function formatRightCardinality(value: DbSchemaDocument['relationships'][number]['fromCardinality']): string {
  switch (value) {
    case 'zero_or_one':
      return '|o';
    case 'exactly_one':
      return '||';
    case 'zero_or_more':
      return 'o{';
    case 'one_or_more':
      return '|{';
  }
}

function formatRelationshipLine(
  relationship: DbSchemaDocument['relationships'][number],
  idMap: Map<string, string>
): string {
  const from = getMappedId(idMap, relationship.from, 'entity');
  const to = getMappedId(idMap, relationship.to, 'entity');
  const connector = relationship.identifying ? '--' : '..';
  return `${from} ${formatLeftCardinality(relationship.fromCardinality)}${connector}${formatRightCardinality(relationship.toCardinality)} ${to} : "${escapeMermaidText(relationship.label)}"`;
}

function formatAttribute(attribute: DbSchemaDocument['entities'][number]['attributes'][number]): string {
  const type = attribute.type.trim().replace(/[^A-Za-z0-9_\-\[\]()]/g, '');
  const name = attribute.name.trim().replace(/[^A-Za-z0-9_*\-]/g, '');
  const keys = attribute.keys.length > 0 ? ` ${attribute.keys.join(',')}` : '';
  const comment = attribute.comment?.trim() ? ` "${escapeMermaidText(attribute.comment)}"` : '';
  return `${type} ${name}${keys}${comment}`;
}

function validateUniqueIds(values: string[], label: string): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values.map((item) => item.trim().toLowerCase())) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }

  return Array.from(duplicates).map((value) => `Duplicate ${label} identifier: ${value}`);
}

function validateFlowDiagram(diagram: FlowDiagram, label: string): ValidationResult {
  const issues = validateUniqueIds(diagram.nodes.map((node) => node.id), `${label} node`);
  const nodeIds = new Set(diagram.nodes.map((node) => node.id.trim().toLowerCase()));

  for (const edge of diagram.edges) {
    if (!nodeIds.has(edge.from.trim().toLowerCase())) {
      issues.push(`${label} edge.from references missing node: ${edge.from}`);
    }
    if (!nodeIds.has(edge.to.trim().toLowerCase())) {
      issues.push(`${label} edge.to references missing node: ${edge.to}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function validateSequenceDiagram(diagram: SequenceDiagram): ValidationResult {
  const issues = validateUniqueIds(diagram.participants.map((participant) => participant.id), 'sequence participant');
  const participantIds = new Set(diagram.participants.map((participant) => participant.id.trim().toLowerCase()));

  for (const message of diagram.messages) {
    if (!participantIds.has(message.from.trim().toLowerCase())) {
      issues.push(`Sequence message.from references missing participant: ${message.from}`);
    }
    if (!participantIds.has(message.to.trim().toLowerCase())) {
      issues.push(`Sequence message.to references missing participant: ${message.to}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function validateErDiagram(diagram: ErDiagram): ValidationResult {
  const issues = validateUniqueIds(diagram.entities.map((entity) => entity.id), 'ER entity');
  const entityIds = new Set(diagram.entities.map((entity) => entity.id.trim().toLowerCase()));

  for (const relationship of diagram.relationships) {
    if (!entityIds.has(relationship.from.trim().toLowerCase())) {
      issues.push(`ER relationship.from references missing entity: ${relationship.from}`);
    }
    if (!entityIds.has(relationship.to.trim().toLowerCase())) {
      issues.push(`ER relationship.to references missing entity: ${relationship.to}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function validateDbSchemaDocument(document: DbSchemaDocument): ValidationResult {
  const issues = validateUniqueIds(document.entities.map((entity) => entity.id), 'database entity');
  const entityIds = new Set(document.entities.map((entity) => entity.id.trim().toLowerCase()));

  for (const entity of document.entities) {
    issues.push(...validateUniqueIds(entity.attributes.map((attribute) => attribute.name), `${entity.label} field`));
  }

  for (const relationship of document.relationships) {
    if (!entityIds.has(relationship.from.trim().toLowerCase())) {
      issues.push(`Database relationship.from references missing entity: ${relationship.from}`);
    }
    if (!entityIds.has(relationship.to.trim().toLowerCase())) {
      issues.push(`Database relationship.to references missing entity: ${relationship.to}`);
    }
  }

  return { valid: issues.length === 0, issues };
}

function compileFlowDiagram(diagram: FlowDiagram): string {
  const lines = ['flowchart TD'];
  const idMap = buildSafeIdentifierMap(diagram.nodes.map((node) => node.id), 'node');

  for (const node of diagram.nodes) {
    lines.push(`    ${formatFlowNode(node, getMappedId(idMap, node.id, 'node'))}`);
  }

  for (const edge of diagram.edges) {
    lines.push(`    ${formatFlowEdge(edge, idMap)}`);
  }

  return lines.join('\n');
}

function compileErDiagram(diagram: ErDiagram): string {
  const lines = ['erDiagram'];
  const idMap = buildSafeIdentifierMap(diagram.entities.map((entity) => entity.id), 'entity');

  for (const entity of diagram.entities) {
    const entityName = getMappedId(idMap, entity.id || entity.label, 'entity');
    lines.push(`    ${entityName}["${escapeMermaidText(entity.label)}"] {`);
    for (const attribute of entity.attributes) {
      lines.push(`        ${formatAttribute(attribute)}`);
    }
    lines.push('    }');
  }

  for (const relationship of diagram.relationships) {
    lines.push(`    ${formatRelationshipLine(relationship, idMap)}`);
  }

  return lines.join('\n');
}

function compileSequenceDiagram(diagram: SequenceDiagram): string {
  const lines = ['sequenceDiagram'];
  const idMap = buildSafeIdentifierMap(diagram.participants.map((participant) => participant.id), 'participant');

  for (const participant of diagram.participants) {
    const id = getMappedId(idMap, participant.id, 'participant');
    const label = escapeMermaidText(participant.label);
    if (participant.type === 'participant' || participant.type === 'actor') {
      lines.push(`    ${participant.type} ${id} as ${label}`);
    } else {
      lines.push(`    participant ${id}@{ "type": "${participant.type}" } as ${label}`);
    }
  }

  for (const message of diagram.messages) {
    const from = getMappedId(idMap, message.from, 'participant');
    const to = getMappedId(idMap, message.to, 'participant');
    const arrow = message.type === 'async' ? '-)' : message.type === 'response' ? '-->>' : '->>';
    lines.push(`    ${from}${arrow}${to}: ${escapeMermaidText(message.label)}`);
  }

  return lines.join('\n');
}

export function compilePlanDiagramsMarkdown(document: PlanDiagrams): string {
  const sections = [
    { heading: document.systemArchitecture.title, description: document.systemArchitecture.description, code: compileFlowDiagram(document.systemArchitecture) },
    { heading: document.entityRelationship.title, description: document.entityRelationship.description, code: compileErDiagram(document.entityRelationship) },
    { heading: document.userFlow.title, description: document.userFlow.description, code: compileFlowDiagram(document.userFlow) },
    { heading: document.keySequence.title, description: document.keySequence.description, code: compileSequenceDiagram(document.keySequence) },
  ];

  return sections
    .map((section) => `### ${section.heading}\n\n${section.description}\n\n\`\`\`mermaid\n${section.code}\n\`\`\``)
    .join('\n\n');
}

export function compileDbSchemaMarkdown(document: DbSchemaDocument): string {
  const erd: ErDiagram = {
    title: 'Entity Relationship Diagram',
    description: 'Generated from the structured database model.',
    entities: document.entities.map((entity) => ({
      id: entity.id,
      label: entity.label,
      description: entity.description,
      attributes: entity.attributes,
    })),
    relationships: document.relationships,
  };

  const entitySections = document.entities
    .map((entity) => {
      const fields = entity.attributes
        .map((attribute) => {
          const suffix = attribute.keys.length > 0 ? ` (${attribute.keys.join(', ')})` : '';
          const comment = attribute.comment ? ` - ${attribute.comment}` : '';
          return `- ${attribute.name}: ${attribute.type}${suffix}${comment}`;
        })
        .join('\n');

      const indexes = entity.indexes.length > 0 ? `\nIndexes:\n${entity.indexes.map((index) => `- ${index}`).join('\n')}` : '';
      return `### ${entity.label}\n\n${entity.description}\n\nFields:\n${fields}${indexes}`;
    })
    .join('\n\n');

  const relationships = document.relationships
    .map((relationship) => `- ${relationship.from} -> ${relationship.to}: ${relationship.label}`)
    .join('\n');

  const constraints = document.constraints.length > 0 ? document.constraints.map((constraint) => `- ${constraint}`).join('\n') : '- None specified';

  return [
    '## Database Overview',
    '',
    document.overview,
    '',
    '## Entities',
    '',
    entitySections,
    '',
    '## Relationships',
    '',
    relationships,
    '',
    '## Constraints',
    '',
    constraints,
    '',
    '## Entity Relationship Diagram',
    '',
    '```mermaid',
    compileErDiagram(erd),
    '```',
  ].join('\n');
}

function createStructuredPrompt(input: DiagramGenerationInput, instructions: string): string {
  return [
    `Project Name: ${input.projectName}`,
    `Project Description: ${input.projectDescription || 'N/A'}`,
    '',
    'Conversation Context:',
    input.conversationContext,
    input.supportingDocuments ? `\nSupporting Documents:\n${input.supportingDocuments}` : '',
    '',
    instructions,
  ].join('\n');
}

function extractJsonFromText(text: string): string {
  const jsonBlock = text.match(/```json\s*([\s\S]*?)```/i);
  if (jsonBlock) return jsonBlock[1].trim();
  const codeBlock = text.match(/```\s*([\s\S]*?)```/);
  if (codeBlock?.[1]?.trim().startsWith('{')) return codeBlock[1].trim();
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last > first) return text.slice(first, last + 1);
  return text.trim();
}

async function generateStructuredFromText<TOutput>(args: {
  model: ModelLike;
  temperature: number;
  prompt: string;
  system: string;
  schema: z.ZodType<TOutput>;
  label: string;
  maxRetries?: number;
}): Promise<TOutput> {
  const maxRetries = args.maxRetries ?? 2;
  let lastError: Error | null = null;

  const schemaJson = JSON.stringify(
    (args.schema as unknown as { toJSONSchema?: () => unknown }).toJSONSchema?.() ?? {},
    null,
    2
  );

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const errorFeedback =
      attempt > 0 && lastError
        ? `\n\nYour previous response failed with this validation error:\n${lastError.message}\nFix these issues in your next attempt.`
        : '';

    const { text } = await generateText({
      model: args.model,
      temperature: attempt === 0 ? args.temperature : Math.min(args.temperature, 0.2),
      system: [
        args.system,
        '',
        'Respond with ONLY a valid JSON object. No markdown, no explanation, no code fences.',
        'The JSON must exactly match this JSON Schema:',
        schemaJson,
        errorFeedback,
      ]
        .filter(Boolean)
        .join('\n'),
      prompt: args.prompt,
    });

    console.log(`[DIAGRAM][${args.label}] attempt=${attempt + 1} raw_length=${text.length}`);

    try {
      const extracted = extractJsonFromText(text);
      const repaired = jsonrepair(extracted);
      const parsed = JSON.parse(repaired) as unknown;
      const result = args.schema.parse(parsed);
      console.log(`[DIAGRAM][${args.label}] attempt=${attempt + 1} ✓ success`);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[DIAGRAM][${args.label}] attempt=${attempt + 1} ✗ ${lastError.message}`);
      if (attempt === maxRetries) {
        console.error(`[DIAGRAM][${args.label}] raw dump (first 500): ${text.slice(0, 500)}`);
      }
    }
  }

  throw new Error(`Structured generation failed after ${maxRetries + 1} attempts: ${lastError?.message}`);
}

function createFallbackPlanDiagrams(projectName: string): PlanDiagrams {
  const safeLabel = projectName.replace(/[^A-Za-z0-9 ]/g, '').substring(0, 30) || 'Application';
  return {
    systemArchitecture: {
      title: 'System Architecture',
      description: `High-level system overview for ${safeLabel}`,
      nodes: [
        { id: 'n_user', label: 'User', type: 'actor' },
        { id: 'n_app', label: safeLabel, type: 'service' },
        { id: 'n_db', label: 'Database', type: 'database' },
      ],
      edges: [
        { from: 'n_user', to: 'n_app', label: 'interacts' },
        { from: 'n_app', to: 'n_db', label: 'reads/writes' },
      ],
    },
    entityRelationship: {
      title: 'Entity Relationship',
      description: 'Core data model',
      entities: [
        {
          id: 'e_user',
          label: 'User',
          description: 'Application user account',
          attributes: [
            { name: 'id', type: 'string', keys: ['PK'] },
            { name: 'email', type: 'string', keys: ['UK'] },
          ],
        },
        {
          id: 'e_item',
          label: 'Item',
          description: 'Application resource',
          attributes: [
            { name: 'id', type: 'string', keys: ['PK'] },
            { name: 'userId', type: 'string', keys: ['FK'] },
          ],
        },
      ],
      relationships: [
        {
          from: 'e_user',
          to: 'e_item',
          fromCardinality: 'exactly_one',
          toCardinality: 'zero_or_more',
          label: 'owns',
          identifying: true,
        },
      ],
    },
    userFlow: {
      title: 'User Flow',
      description: 'Primary user journey',
      nodes: [
        { id: 'f_start', label: 'Start', type: 'start' },
        { id: 'f_main', label: 'Main Action', type: 'process' },
        { id: 'f_end', label: 'Done', type: 'end' },
      ],
      edges: [
        { from: 'f_start', to: 'f_main' },
        { from: 'f_main', to: 'f_end', label: 'complete' },
      ],
    },
    keySequence: {
      title: 'Key Sequence',
      description: 'Primary request/response interaction',
      participants: [
        { id: 'p_user', label: 'User', type: 'actor' },
        { id: 'p_app', label: 'Application', type: 'participant' },
        { id: 'p_db', label: 'Database', type: 'participant' },
      ],
      messages: [
        { from: 'p_user', to: 'p_app', label: 'Request', type: 'sync' },
        { from: 'p_app', to: 'p_db', label: 'Query', type: 'sync' },
        { from: 'p_db', to: 'p_app', label: 'Result', type: 'response' },
        { from: 'p_app', to: 'p_user', label: 'Response', type: 'response' },
      ],
    },
  };
}

function createFallbackDbSchema(projectName: string): DbSchemaDocument {
  return {
    overview: `Database schema for ${projectName}. [Fallback placeholder — regenerate for accurate schema]`,
    entities: [
      {
        id: 't_user',
        label: 'User',
        description: 'Application user accounts',
        attributes: [
          { name: 'id', type: 'string', keys: ['PK'] },
          { name: 'email', type: 'string', keys: ['UK'] },
          { name: 'createdAt', type: 'datetime', keys: [] },
        ],
        indexes: ['email'],
      },
      {
        id: 't_session',
        label: 'Session',
        description: 'User authentication sessions',
        attributes: [
          { name: 'id', type: 'string', keys: ['PK'] },
          { name: 'userId', type: 'string', keys: ['FK'] },
          { name: 'expiresAt', type: 'datetime', keys: [] },
        ],
        indexes: ['userId'],
      },
      {
        id: 't_resource',
        label: 'Resource',
        description: 'Core application resource',
        attributes: [
          { name: 'id', type: 'string', keys: ['PK'] },
          { name: 'userId', type: 'string', keys: ['FK'] },
          { name: 'createdAt', type: 'datetime', keys: [] },
        ],
        indexes: ['userId'],
      },
    ],
    relationships: [
      { from: 't_user', to: 't_session', fromCardinality: 'exactly_one', toCardinality: 'zero_or_more', label: 'has', identifying: true },
      { from: 't_user', to: 't_resource', fromCardinality: 'exactly_one', toCardinality: 'zero_or_more', label: 'owns', identifying: true },
    ],
    constraints: ['Users must have unique email addresses'],
  };
}

export async function generatePlanDiagramsMarkdown(input: DiagramGenerationInput): Promise<string> {
  let document: PlanDiagrams;
  let usedFallback = false;

  try {
    const candidate = await generateStructuredFromText({
      model: input.model,
      temperature: input.temperature,
      system:
        'You are a software architect. Return JSON only — no Mermaid, no markdown, no preamble. Use simple, implementation-relevant nodes, entities, and participants.',
      prompt: createStructuredPrompt(
        input,
        [
          'Produce four diagrams as a structured JSON object:',
          '- systemArchitecture: major product components and data flow (flowchart)',
          '- entityRelationship: core data entities and their cardinalities (ER diagram)',
          '- userFlow: main user journey through the MVP (flowchart)',
          '- keySequence: primary request/response interaction across system actors (sequence diagram)',
          'Keep each diagram minimal: prefer 3-7 nodes/entities/participants.',
          'All "id" values must be unique within their diagram, start with a letter, and contain only letters, numbers, underscores, or hyphens.',
          'All edge "from"/"to" values must exactly match an existing node "id" in the same diagram.',
        ].join('\n')
      ),
      schema: planDiagramsSchema,
      label: 'PlanDiagrams',
    });

    const validationResults = [
      validateFlowDiagram(candidate.systemArchitecture, 'systemArchitecture'),
      validateErDiagram(candidate.entityRelationship),
      validateFlowDiagram(candidate.userFlow, 'userFlow'),
      validateSequenceDiagram(candidate.keySequence),
    ];
    const issues = validationResults.flatMap((r) => r.issues);
    if (issues.length > 0) {
      throw new Error(`Semantic validation failed: ${issues.join('; ')}`);
    }

    document = candidate;
  } catch (err) {
    console.warn(`[DIAGRAM][PlanDiagrams] Falling back to minimal diagram: ${err instanceof Error ? err.message : String(err)}`);
    document = createFallbackPlanDiagrams(input.projectName);
    usedFallback = true;
  }

  const markdown = compilePlanDiagramsMarkdown(document);
  if (!usedFallback) {
    await assertCompiledMermaidMarkdown(markdown);
  }
  return markdown;
}

export async function generateDbSchemaMarkdown(input: DiagramGenerationInput): Promise<string> {
  let document: DbSchemaDocument;
  let usedFallback = false;

  try {
    const candidate = await generateStructuredFromText({
      model: input.model,
      temperature: input.temperature,
      system:
        'You are a software architect. Return JSON only — no Mermaid, no markdown, no preamble. Model the MVP data layer with realistic entities, fields, and relationships.',
      prompt: createStructuredPrompt(
        input,
        [
          'Produce a structured database schema document for the MVP.',
          'Include at least 3 entities, realistic fields, real relationships, likely indexes, and key constraints.',
          'Prefer singular entity labels and straightforward relational modeling.',
          'All "id" values must be unique, start with a letter, and contain only letters, numbers, underscores, or hyphens.',
          'All relationship "from"/"to" values must exactly match an existing entity "id".',
        ].join('\n')
      ),
      schema: dbSchemaDocumentSchema,
      label: 'DbSchema',
    });

    const validation = validateDbSchemaDocument(candidate);
    if (!validation.valid) {
      throw new Error(`DB schema validation failed: ${validation.issues.join('; ')}`);
    }

    document = candidate;
  } catch (err) {
    console.warn(`[DIAGRAM][DbSchema] Falling back to minimal schema: ${err instanceof Error ? err.message : String(err)}`);
    document = createFallbackDbSchema(input.projectName);
    usedFallback = true;
  }

  const markdown = compileDbSchemaMarkdown(document);
  if (!usedFallback) {
    await assertCompiledMermaidMarkdown(markdown);
  }
  return markdown;
}

async function assertCompiledMermaidMarkdown(markdown: string): Promise<void> {
  const blocks = Array.from(markdown.matchAll(/```mermaid\s*([\s\S]*?)```/gi)).map((match) => match[1].trim());
  for (const block of blocks) {
    const result = await parseMermaidServer(block);
    if (!result.valid) {
      throw new Error(`Compiled Mermaid failed validation: ${result.error || 'Unknown Mermaid parse error'}`);
    }
  }
}