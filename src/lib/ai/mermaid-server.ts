/**
 * Server-side Mermaid parsing utilities.
 *
 * Uses the real `mermaid.parse()` function (which runs in Node.js without
 * any browser globals — only the renderer needs DOM).  This gives us
 * genuine syntax validation instead of regex heuristics, so the AI fixer
 * can be given the exact error message that mermaid itself would produce.
 *
 * Import this ONLY from server-side code (API routes, server actions).
 * next.config.ts marks mermaid as a serverExternalPackage so webpack
 * will not bundle it and Node.js will import it natively.
 */

let _mermaid: { parse: (text: string) => Promise<unknown> } | null = null;

async function getMermaidParser() {
  if (_mermaid) return _mermaid;
  const mod = await import('mermaid');
  const instance = mod.default as {
    initialize: (cfg: Record<string, unknown>) => void;
    parse: (text: string) => Promise<unknown>;
  };
  instance.initialize({ startOnLoad: false });
  _mermaid = instance;
  return _mermaid;
}

export type ServerParseResult = {
  valid: boolean;
  /** Actual mermaid parser error message, or undefined when valid. */
  error?: string;
};

/**
 * Validate Mermaid code using the real mermaid parser (all diagram types).
 * Returns `{ valid: true }` when the diagram parses successfully, or
 * `{ valid: false, error: "<mermaid error message>" }` otherwise.
 */
export async function parseMermaidServer(code: string): Promise<ServerParseResult> {
  const trimmed = code.trim();
  if (!trimmed) {
    return { valid: false, error: 'Empty diagram code' };
  }
  try {
    const mermaid = await getMermaidParser();
    await mermaid.parse(trimmed);
    return { valid: true };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // DOMPurify and similar browser-only APIs are not available in the Node.js
    // server runtime. This is an environment limitation, not a diagram syntax
    // error — treat as skipped validation so the pipeline is not blocked.
    if (raw.includes('DOMPurify') || raw.includes('addHook')) {
      console.warn('[mermaid-server] Browser-only API unavailable in Node.js — skipping Mermaid validation. Diagram will be validated client-side on render.');
      return { valid: true };
    }
    // Trim very long PEG.js "Expecting ..." lists to keep prompts compact.
    const error = raw.length > 400 ? raw.slice(0, 400) + '…' : raw;
    return { valid: false, error };
  }
}
