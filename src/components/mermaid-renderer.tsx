'use client';

import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { autoFixMermaidCode, normalizeMermaidMarkdown, sanitizeMermaidCode } from '@/lib/ai/mermaid';

let mermaidLoadPromise: Promise<any> | null = null;

async function getMermaid() {
  if (mermaidLoadPromise) {
    return mermaidLoadPromise;
  }

  mermaidLoadPromise = import('mermaid').then((mod) => {
    const mermaid = mod.default;
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      themeVariables: {
        primaryColor: '#7c3aed',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#6d28d9',
        lineColor: '#94a3b8',
        secondaryColor: '#1e293b',
        tertiaryColor: '#0f172a',
        fontFamily: 'Outfit, sans-serif',
      },
    });
    return mermaid;
  });

  return mermaidLoadPromise;
}

/**
 * Renders a single Mermaid diagram code block as SVG.
 * Renders compiled Mermaid safely from the installed package.
 */
export function MermaidDiagram({ code, id }: { code: string; id: string }) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');

  const candidates = useMemo(() => {
    const sanitized = sanitizeMermaidCode(code);
    const fixed = autoFixMermaidCode(code);
    return Array.from(new Set([sanitized, fixed].filter(Boolean)));
  }, [code]);

  useEffect(() => {
    let cancelled = false;

    async function renderDiagram() {
      if (candidates.length === 0) {
        setError('No Mermaid diagram source found');
        setSvg('');
        return;
      }

      try {
        const mermaid = await getMermaid();

        let renderedSvg = '';
        let lastErrorMessage = 'Unable to render Mermaid diagram';
        for (const candidate of candidates) {
          try {
            await mermaid.parse(candidate);
            const uniqueId = `mermaid-${id}-${Date.now()}`;
            const result = await mermaid.render(uniqueId, candidate);
            if (result?.svg && result.svg.includes('<svg')) {
              renderedSvg = result.svg;
              break;
            }
          } catch (e) {
            lastErrorMessage = e instanceof Error ? e.message : String(e);
          }
        }

        if (!cancelled) {
          if (renderedSvg) {
            setSvg(renderedSvg);
            setError('');
          } else {
            setSvg('');
            setError(lastErrorMessage);
          }
        }
      } catch (e) {
        if (!cancelled) {
          setSvg('');
          setError(e instanceof Error ? e.message : 'Unknown Mermaid rendering error');
        }
      }
    }

    renderDiagram();

    return () => {
      cancelled = true;
    };
  }, [candidates, id]);

  // Graceful fallback: show raw source in a styled code block
  if (error) {
    return (
      <div className="rounded-lg border border-border/30 overflow-hidden">
        <div className="px-3 py-1.5 bg-muted/30 border-b border-border/20 flex items-center gap-2">
          <span className="text-xs text-muted-foreground/70">⚠️ Preview unavailable - showing source</span>
        </div>
        <div className="px-4 py-2 text-[11px] text-amber-300/80 border-b border-border/20 bg-amber-500/10">
          {error}
        </div>
        <pre className="p-4 text-xs font-mono text-muted-foreground overflow-auto whitespace-pre-wrap bg-background/50">
          {code.trim()}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-6 text-muted-foreground animate-pulse text-sm">
        Rendering diagram…
      </div>
    );
  }

  return (
    <div
      className="mermaid-diagram overflow-auto bg-background/50 rounded-lg p-4 border border-border/20"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * Extracts mermaid code blocks from markdown content and renders them,
 * while rendering the rest as plain text.
 */
export function MermaidRenderer({ content }: { content: string }) {
  const normalizedContent = useMemo(() => normalizeMermaidMarkdown(content), [content]);
  const parts = useMemo(() => normalizedContent.split(/(```mermaid[\s\S]*?```)/gi), [normalizedContent]);

  return (
    <div className="space-y-4">
      {parts.map((part, i) => {
        const mermaidMatch = part.match(/^```mermaid\s*\n?([\s\S]*?)```$/i);
        if (mermaidMatch) {
          return (
            <MermaidDiagram
              key={`mermaid-${i}`}
              code={mermaidMatch[1]}
              id={`block-${i}`}
            />
          );
        }
        // Non-mermaid text
        const trimmed = part.trim();
        if (!trimmed) return null;

        return (
          <div key={`text-${i}`} className="text-sm leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ node: _n, ...props }) => <h1 className="text-xl font-bold mb-3 mt-5 first:mt-0 border-b border-border/30 pb-2" {...props} />,
                h2: ({ node: _n, ...props }) => <h2 className="text-lg font-semibold mb-2 mt-4 first:mt-0" {...props} />,
                h3: ({ node: _n, ...props }) => <h3 className="text-base font-semibold mb-2 mt-3 first:mt-0" {...props} />,
                h4: ({ node: _n, ...props }) => <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0" {...props} />,
                p: ({ node: _n, ...props }) => <p className="mb-3 last:mb-0 text-muted-foreground" {...props} />,
                ul: ({ node: _n, ...props }) => <ul className="list-disc pl-5 mb-3 space-y-1 text-muted-foreground" {...props} />,
                ol: ({ node: _n, ...props }) => <ol className="list-decimal pl-5 mb-3 space-y-1 text-muted-foreground" {...props} />,
                li: ({ node: _n, ...props }) => <li className="leading-relaxed" {...props} />,
                strong: ({ node: _n, ...props }) => <strong className="font-semibold text-foreground" {...props} />,
                em: ({ node: _n, ...props }) => <em className="italic" {...props} />,
                code: ({ node: _n, className, children, ...props }) => {
                  const isBlock = /language-/.test(className || '');
                  return isBlock
                    ? <code className={`block font-mono text-xs overflow-auto ${className ?? ''}`} {...props}>{children}</code>
                    : <code className="bg-muted/60 px-1.5 py-0.5 rounded font-mono text-xs text-cyan-300" {...props}>{children}</code>;
                },
                pre: ({ node: _n, ...props }) => <pre className="bg-muted/40 rounded-lg p-4 overflow-auto mb-3 border border-border/30" {...props} />,
                blockquote: ({ node: _n, ...props }) => <blockquote className="border-l-2 border-violet-500/50 pl-4 italic text-muted-foreground/80 my-3" {...props} />,
                table: ({ node: _n, ...props }) => <div className="overflow-auto mb-3"><table className="w-full border-collapse text-sm" {...props} /></div>,
                thead: ({ node: _n, ...props }) => <thead className="bg-muted/30" {...props} />,
                th: ({ node: _n, ...props }) => <th className="border border-border/40 px-3 py-2 text-left font-semibold" {...props} />,
                td: ({ node: _n, ...props }) => <td className="border border-border/40 px-3 py-2 text-muted-foreground" {...props} />,
                a: ({ node: _n, ...props }) => <a className="text-violet-400 hover:text-violet-300 hover:underline" target="_blank" rel="noopener noreferrer" {...props} />,
                hr: ({ node: _n, ...props }) => <hr className="border-border/30 my-4" {...props} />,
              }}
            >
              {trimmed}
            </ReactMarkdown>
          </div>
        );
      })}
    </div>
  );
}
