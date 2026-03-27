const MERMAID_DIAGRAM_TYPES = [
  'graph',
  'flowchart',
  'sequenceDiagram',
  'classDiagram',
  'stateDiagram',
  'stateDiagram-v2',
  'erDiagram',
  'journey',
  'gantt',
  'pie',
  'quadrantChart',
  'requirementDiagram',
  'gitGraph',
  'mindmap',
  'timeline',
  'sankey',
  'xychart',
  'block',
  'packet',
  'kanban',
  'architecture',
] as const;

const MERMAID_START_REGEX = new RegExp(
  `^(?:${MERMAID_DIAGRAM_TYPES
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})(?:\\b|\\s|-)`,
  'i'
);

function isMermaidStart(line: string): boolean {
  return MERMAID_START_REGEX.test(line.trim());
}

export type MermaidIssueType =
  | 'syntax'
  | 'node'
  | 'edge'
  | 'graph-structure'
  | 'style'
  | 'unknown';

export type MermaidIssue = {
  type: MermaidIssueType;
  message: string;
  line?: number;
};

export type MermaidPrevalidationResult = {
  valid: boolean;
  normalizedCode: string;
  issues: MermaidIssue[];
};

function classifyMermaidIssue(message: string): MermaidIssueType {
  const lower = message.toLowerCase();
  if (lower.includes('syntax') || lower.includes('unexpected') || lower.includes('invalid')) {
    return 'syntax';
  }
  if (lower.includes('node') || lower.includes('identifier') || lower.includes('id ')) {
    return 'node';
  }
  if (lower.includes('edge') || lower.includes('arrow') || lower.includes('relationship')) {
    return 'edge';
  }
  if (lower.includes('structure') || lower.includes('graph') || lower.includes('empty')) {
    return 'graph-structure';
  }
  if (lower.includes('style') || lower.includes('class')) {
    return 'style';
  }
  return 'unknown';
}

function hasBalancedPairs(code: string, open: string, close: string): boolean {
  let depth = 0;
  for (const ch of code) {
    if (ch === open) depth += 1;
    if (ch === close) depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function hasEvenUnescapedQuotes(code: string): boolean {
  let count = 0;
  for (let i = 0; i < code.length; i++) {
    if (code[i] === '"' && code[i - 1] !== '\\') {
      count += 1;
    }
  }
  return count % 2 === 0;
}

export function sanitizeMermaidCode(raw: string): string {
  let code = raw.trim();
  code = code.replace(/^```(?:mermaid)?\s*\n?/i, '');
  code = code.replace(/\n?```\s*$/i, '');

  const lines = code.split('\n');
  const startIdx = lines.findIndex((line) => isMermaidStart(line));

  if (startIdx >= 0) {
    code = lines.slice(startIdx).join('\n').trim();
  }

  return code;
}

export function autoFixMermaidCode(raw: string): string {
  const sanitized = sanitizeMermaidCode(raw);
  if (!sanitized) return sanitized;

  let lines = sanitized
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, '  ')
    .split('\n')
    .map((line) => line.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"'));

  // Remove HTML comments often produced by LLMs inside mermaid fences.
  lines = lines.filter((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith('<!--') && !trimmed.endsWith('-->');
  });

  // Mermaid uses %% comments; convert JS-style comments to avoid parse failures.
  lines = lines.map((line) => {
    if (line.trim().startsWith('//')) {
      return line.replace('//', '%%');
    }
    return line;
  });

  const first = lines[0]?.trim() ?? '';
  if (/^graph$/i.test(first)) {
    lines[0] = 'graph TD';
  } else if (/^flowchart$/i.test(first)) {
    lines[0] = 'flowchart TD';
  } else if (/^stateDiagram$/i.test(first)) {
    lines[0] = 'stateDiagram-v2';
  }

  if (/^erDiagram$/i.test(first)) {
    lines = lines.map((line, index) => {
      if (index === 0) return line;

      const entityHeader = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_ ]+)\s*(\{)\s*$/);
      if (entityHeader && entityHeader[2].includes(' ')) {
        const compactName = entityHeader[2].replace(/\s+/g, '');
        return `${entityHeader[1]}${compactName} ${entityHeader[3]}`;
      }

      const relationship = line.match(
        /^(\s*)([A-Za-z][A-Za-z0-9_ ]*)\s+([|o{}<][|o{}<\-]+[|o{}>])\s+([A-Za-z][A-Za-z0-9_ ]*)\s*:\s*(.*)$/
      );
      if (relationship) {
        const left = relationship[2].replace(/\s+/g, '');
        const right = relationship[4].replace(/\s+/g, '');
        const label = relationship[5].trim();
        const normalizedLabel = /^".*"$/.test(label) ? label : `"${label}"`;
        return `${relationship[1]}${left} ${relationship[3]} ${right} : ${normalizedLabel}`;
      }

      return line;
    });
  }

  return lines.join('\n').trim();
}

export function prevalidateMermaidCode(raw: string): MermaidPrevalidationResult {
  const normalizedCode = autoFixMermaidCode(raw);
  const issues: MermaidIssue[] = [];

  if (!normalizedCode) {
    issues.push({ type: 'graph-structure', message: 'Mermaid block is empty after normalization' });
    return { valid: false, normalizedCode, issues };
  }

  const lines = normalizedCode.split('\n');
  const first = lines[0]?.trim() ?? '';

  if (!isMermaidStart(first)) {
    issues.push({
      type: 'syntax',
      message: `First line must start with a Mermaid diagram type, got "${first}"`,
      line: 1,
    });
  }

  if (!hasBalancedPairs(normalizedCode, '{', '}')) {
    issues.push({ type: 'syntax', message: 'Unbalanced curly braces detected' });
  }
  if (!hasBalancedPairs(normalizedCode, '(', ')')) {
    issues.push({ type: 'syntax', message: 'Unbalanced parentheses detected' });
  }
  if (!hasBalancedPairs(normalizedCode, '[', ']')) {
    issues.push({ type: 'syntax', message: 'Unbalanced square brackets detected' });
  }
  if (!hasEvenUnescapedQuotes(normalizedCode)) {
    issues.push({ type: 'syntax', message: 'Unbalanced double quotes detected' });
  }

  if (/^erDiagram$/i.test(first)) {
    const hasEntity = lines.some((line, i) => i > 0 && /\{\s*$/.test(line.trim()));
    const hasRelationship = lines.some((line, i) => i > 0 && /\|\|--|\}o--|\|o--|--\|\{|--o\{/.test(line));
    if (!hasEntity) {
      issues.push({ type: 'graph-structure', message: 'ERD should contain at least one entity block (EntityName { ... })' });
    }
    if (!hasRelationship) {
      issues.push({ type: 'edge', message: 'ERD should contain at least one relationship line' });
    }

    lines.forEach((line, idx) => {
      const relLabel = line.match(/:\s*(.+)$/);
      if (!relLabel) return;
      const label = relLabel[1].trim();
      if (label.includes(' ') && !/^".*"$/.test(label)) {
        issues.push({
          type: 'style',
          message: 'ERD relationship labels with spaces should be quoted',
          line: idx + 1,
        });
      }
    });
  }

  if (/^(graph|flowchart)\b/i.test(first)) {
    const hasEdge = lines.some((line, i) => i > 0 && /-->|==>|-.->|---/.test(line));
    if (!hasEdge) {
      issues.push({
        type: 'graph-structure',
        message: 'Flowchart/graph should include at least one edge',
      });
    }
  }

  return { valid: issues.length === 0, normalizedCode, issues };
}

type Segment = { start: number; end: number; code: string };

function findImplicitMermaidSegments(content: string): Segment[] {
  const lines = content.split('\n');
  const segments: Segment[] = [];
  let i = 0;
  let inCodeFence = false;

  while (i < lines.length) {
    const trimmed = lines[i].trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
      i += 1;
      continue;
    }

    if (inCodeFence || !isMermaidStart(trimmed)) {
      i += 1;
      continue;
    }

    const start = i;
    i += 1;

    while (i < lines.length) {
      const current = lines[i].trim();
      if (!current) break;
      if (current.startsWith('```')) break;
      if (/^#{1,6}\s/.test(current)) break;
      if (isMermaidStart(current)) break;
      i += 1;
    }

    const end = i;
    const code = lines.slice(start, end).join('\n').trim();
    if (code) {
      segments.push({ start, end, code });
    }
  }

  return segments;
}

export function normalizeMermaidMarkdown(content: string): string {
  if (!content.trim()) return content;

  const normalizedFenced = content.replace(/```mermaid\s*([\s\S]*?)```/gi, (_full, inner: string) => {
    const fixed = autoFixMermaidCode(inner);
    return fixed ? `\n\`\`\`mermaid\n${fixed}\n\`\`\`\n` : '';
  });

  const hasFencedMermaid = /```mermaid\s*[\s\S]*?```/i.test(normalizedFenced);
  if (hasFencedMermaid) {
    return normalizedFenced.trim();
  }

  const lines = normalizedFenced.split('\n');
  const segments = findImplicitMermaidSegments(normalizedFenced);
  if (segments.length === 0) return normalizedFenced.trim();

  const out: string[] = [];
  let cursor = 0;

  for (const segment of segments) {
    if (segment.start > cursor) {
      out.push(lines.slice(cursor, segment.start).join('\n'));
    }

    const fixed = autoFixMermaidCode(segment.code);
    if (fixed) {
      out.push(`\`\`\`mermaid\n${fixed}\n\`\`\``);
    }

    cursor = segment.end;
  }

  if (cursor < lines.length) {
    out.push(lines.slice(cursor).join('\n'));
  }

  return out.join('\n\n').trim();
}

export function extractMermaidBlocks(content: string): string[] {
  const normalized = normalizeMermaidMarkdown(content);
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  const blocks: string[] = [];

  let match: RegExpExecArray | null = regex.exec(normalized);
  while (match) {
    const fixed = autoFixMermaidCode(match[1]);
    if (fixed) {
      blocks.push(fixed);
    }
    match = regex.exec(normalized);
  }

  return blocks;
}

export type MermaidValidationError = {
  blockIndex: number;
  code: string;
  issue: string;
};

/**
 * Validates all Mermaid code blocks in normalized markdown content.
 * Returns a list of errors; an empty array means all blocks are structurally valid.
 */
export function validateMermaidBlocks(content: string): MermaidValidationError[] {
  const normalized = normalizeMermaidMarkdown(content);
  const regex = /```mermaid\s*([\s\S]*?)```/gi;
  const errors: MermaidValidationError[] = [];
  let blockIndex = 0;
  let match: RegExpExecArray | null = regex.exec(normalized);

  while (match) {
    const rawCode = match[1].trim();
    const fixed = autoFixMermaidCode(rawCode);

    if (!fixed) {
      errors.push({ blockIndex, code: rawCode, issue: 'Empty or unparseable diagram block' });
      blockIndex++;
      match = regex.exec(normalized);
      continue;
    }

    const nonEmptyLines = fixed.split('\n').filter((l) => l.trim().length > 0);

    if (nonEmptyLines.length < 2) {
      errors.push({
        blockIndex,
        code: rawCode,
        issue: 'Diagram is too short — needs a type declaration and at least one node or interaction',
      });
      blockIndex++;
      match = regex.exec(normalized);
      continue;
    }

    if (!isMermaidStart(nonEmptyLines[0])) {
      errors.push({
        blockIndex,
        code: rawCode,
        issue: `First line "${nonEmptyLines[0].trim()}" is not a valid Mermaid diagram type keyword`,
      });
      blockIndex++;
      match = regex.exec(normalized);
      continue;
    }

    const prevalidation = prevalidateMermaidCode(rawCode);
    if (!prevalidation.valid) {
      const issue = prevalidation.issues[0];
      errors.push({
        blockIndex,
        code: rawCode,
        issue: issue?.message || 'Pre-validation failed',
      });
    }

    blockIndex++;
    match = regex.exec(normalized);
  }

  return errors;
}
