'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Suspense } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Message = {
  role: 'USER' | 'ASSISTANT';
  content: string;
};

type ClarifyQuestion = {
  id: string;
  dimension: string;
  question: string;
  options: string[];
  recommendation: string;
};

type ParsedAIResponse = {
  status: 'needs_clarification' | 'requirements_complete';
  covered?: string[];
  missing?: string[];
  questions?: ClarifyQuestion[];
  summary?: Record<string, unknown>;
};

const DIMENSIONS = [
  { key: 'problem', label: 'Problem', icon: '🎯' },
  { key: 'features', label: 'Features', icon: '⚡' },
  { key: 'tech_stack', label: 'Tech Stack', icon: '🛠️' },
  { key: 'data_model', label: 'Data Model', icon: '🗃️' },
  { key: 'auth', label: 'Auth & Roles', icon: '🔐' },
  { key: 'integrations', label: 'Integrations', icon: '🔗' },
  { key: 'deployment', label: 'Deploy', icon: '☁️' },
  { key: 'design', label: 'Design', icon: '🎨' },
];

function NewProjectContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get('projectId');
  const testMode = searchParams.get('testMode');

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [projectName, setProjectName] = useState('New Project');
  const [coveredDimensions, setCoveredDimensions] = useState<string[]>([]);
  const [requirementsComplete, setRequirementsComplete] = useState(false);
  const [generatingPlan, setGeneratingPlan] = useState(false);
  const [planProgress, setPlanProgress] = useState<string[]>([]);
  const [pendingAnswers, setPendingAnswers] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const autopilotRaw = searchParams.get('testMode');
  const [autopilotEnabled, setAutopilotEnabled] = useState(autopilotRaw === 'true');
  const autopilotInit = useRef(false);
  const autopilotNoParseCount = useRef(0);

  useEffect(() => {
    if (projectId) {
      fetch(`/api/projects/${projectId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.project) {
            setProjectName(data.project.name);
            const msgs: Message[] = data.project.conversations.map(
              (c: { role: string; content: string }) => ({
                role: c.role as 'USER' | 'ASSISTANT',
                content: c.content,
              })
            );
            setMessages(msgs);

            // Reconstruct radar state from message history
            const allCovered = new Set<string>();
            let isComplete = false;
            
            for (const m of msgs) {
              if (m.role === 'ASSISTANT') {
                const p = tryParseAI(m.content);
                if (p) {
                  if (p.covered) p.covered.forEach(c => allCovered.add(c));
                  if (p.status === 'requirements_complete') isComplete = true;
                }
              }
            }
            if (allCovered.size > 0) setCoveredDimensions(Array.from(allCovered));
            if (isComplete) setRequirementsComplete(true);
          }
        });
    }
  }, [projectId]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, generatingPlan, planProgress]);

  function tryParseAI(content: string): ParsedAIResponse | null {
    if (!content) return null;
    try {
      // 1. Try to find JSON inside markdown blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1].trim());
      }
      // 2. Try to find raw JSON if it starts with {
      const firstCurly = content.indexOf('{');
      const lastCurly = content.lastIndexOf('}');
      if (firstCurly !== -1 && lastCurly !== -1) {
        const potentialJson = content.substring(firstCurly, lastCurly + 1);
        return JSON.parse(potentialJson.trim());
      }
      return null;
    } catch {
      return null;
    }
  }

  function getCleanText(content: string): string {
    // 1. Remove markdown json blocks anywhere
    let clean = content.replace(/```(?:json)?[\s\S]*?(```|$)/g, '').trim();
    // 2. Remove naked JSON objects at the END of the string
    clean = clean.replace(/\{[\s\S]*\}\s*$/g, '').trim();
    return clean;
  }

  function normalizeQuestions(questions: ClarifyQuestion[] | undefined): ClarifyQuestion[] {
    if (!questions || questions.length === 0) return [];

    return questions.map((q, idx) => {
      const normalizedOptions = Array.from(new Set([...(q.options || []).filter(Boolean), 'Other']));
      return {
        id: q.id || `q_${idx + 1}`,
        dimension: q.dimension || 'general',
        question: q.question || 'Could you provide more detail?',
        recommendation: q.recommendation || 'Choose the closest option or provide a custom answer.',
        options: normalizedOptions.length > 1 ? normalizedOptions : ['Option A', 'Option B', 'Other'],
      };
    });
  }

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !projectId || loading) return;

    const userMsg: Message = { role: 'USER', content: text };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      console.log(`[DEBUG - Test Case Chat] Sending message to API. ProjectID: ${projectId}`);
      console.log(`[DEBUG - Payload]`, { message: text });
      
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, message: text }),
      });

      // Read streaming response (plain text from toTextStreamResponse)
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      setMessages((prev) => [...prev, { role: 'ASSISTANT', content: '' }]);

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          const currentText = fullText;
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = { role: 'ASSISTANT', content: currentText };
            return updated;
          });
        }
      }

      // Try to parse the final response
      const parsedRaw = tryParseAI(fullText);
      const parsed = parsedRaw
        ? { ...parsedRaw, questions: normalizeQuestions(parsedRaw.questions as ClarifyQuestion[] | undefined) }
        : null;
      console.log(`[DEBUG - Test Case Chat] Stream complete. Parsed JSON Status: ${parsed?.status || 'none'}`);
      if (parsed) {
        if (parsed.covered && parsed.covered.length > 0) {
          console.log(`[DEBUG] Covered update:`, parsed.covered);
          setCoveredDimensions((prev) => {
            const next = new Set([...prev, ...(parsed.covered || [])]);
            return Array.from(next);
          });
        }
        if (parsed.status === 'requirements_complete') {
          setRequirementsComplete(true);
          // Always lock status; optionally update name
          const patch: Record<string, string> = { status: 'REQUIREMENTS_LOCKED' };
          if (parsed.summary && typeof parsed.summary === 'object' && 'projectName' in parsed.summary) {
            const newName = parsed.summary.projectName as string;
            setProjectName(newName);
            patch.name = newName;
          }
          fetch(`/api/projects/${projectId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(patch),
          });
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'ASSISTANT', content: '❌ Error communicating with AI. Please check your API settings.' },
      ]);
    }

    setLoading(false);
  }, [projectId, loading]);

  // --- UI AUTOPILOT FOR TEST PIPELINE ---
  useEffect(() => {
    if (!autopilotEnabled || loading || generatingPlan) return;

    const lastMsg = messages[messages.length - 1];
    const userTurns = messages.filter((m) => m.role === 'USER').length;

    // 1. Initial Start
    if (!lastMsg && !autopilotInit.current) {
      autopilotInit.current = true;
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete('testMode');
      window.history.replaceState({}, '', newUrl);

      setTimeout(() => {
        sendMessage('I want to build a modern task management application. Please ask me any required questions to define the project scope. Use deep iterative adaptive probing.');
      }, 1000);
      return;
    }

    // 2. If requirementsComplete is already true, generate the plan
    if (requirementsComplete && !generatingPlan) {
      console.log('[AUTOPILOT] Requirements confirmed, generating plan...');
      setTimeout(() => generatePlan(), 2000);
      return;
    }

    // 3. Reacting to Assistant messages
    if (lastMsg && lastMsg.role === 'ASSISTANT') {
      const parsedRaw = tryParseAI(lastMsg.content);
      const parsed = parsedRaw
        ? { ...parsedRaw, questions: normalizeQuestions(parsedRaw.questions as ClarifyQuestion[] | undefined) }
        : null;
      
      // If AI returned no parseable JSON, send a gentle nudge (but only after several turns)
      if (!parsed) {
        autopilotNoParseCount.current += 1;
        if (autopilotNoParseCount.current >= 2) {
          setTimeout(() => {
            sendMessage('Please return a clarification JSON block with 1-2 questions and selectable options so I can continue.');
          }, 2500);
          autopilotNoParseCount.current = 0;
        } else if (userTurns >= 6) {
          setTimeout(() => {
            sendMessage('All requirements are clear. Please provide your finalization check so we can proceed to plan generation.');
          }, 3000);
        }
        return;
      }

      autopilotNoParseCount.current = 0;

      if (parsed.status === 'needs_clarification') {
        // Check if this is the final_check confirmation question
        const isFinalCheck = parsed.questions?.some((q: any) => q.id === 'final_check' || q.dimension === 'confirmation');
        
        if (isFinalCheck) {
          // Auto-confirm the finalization
          console.log('[AUTOPILOT] Final check detected — auto-confirming.');
          setTimeout(() => {
            sendMessage('Looks good, generate plan');
          }, 3000);
        } else if (parsed.questions && parsed.questions.length > 0) {
          // Answer the clarification questions
          setTimeout(() => {
            const answers: Record<string, string> = {};
            const customFallbacks = [
              'A modern, responsive web UI with dark mode support',
              'PostgreSQL with Prisma ORM for type-safe queries',
              'JWT-based authentication with role-based access control',
              'Docker containers deployed via CI/CD pipeline',
              'RESTful API with OpenAPI documentation',
              'Real-time updates via WebSocket integration',
              'Comprehensive test coverage with Jest and Cypress',
              'Redis caching layer for frequently accessed data',
            ];
            (parsed.questions || []).forEach((q: any, idx: number) => {
              const opts = Array.from(new Set([...(q.options || []), 'Other'])).filter(Boolean);
              if (opts.length > 0) {
                const pick = idx % opts.length;
                answers[q.id] = opts[pick];
              } else {
                answers[q.id] = customFallbacks[idx % customFallbacks.length];
              }
            });
            const formatted = Object.entries(answers).map(([id, ans]) => `- ${id}: ${ans}`).join('\n');
            sendMessage(`Autopilot Answers:\n${formatted}`);
          }, 4000);
        } else if (parsed.missing?.length === 0) {
          // All dimensions covered but no questions — request the finalization check
          setTimeout(() => {
            sendMessage('All requirements appear complete. Please proceed with the finalization check.');
          }, 3000);
        } else {
          // Missing dimensions but the model still gave no actionable options.
          setTimeout(() => {
            sendMessage(`Please ask focused clarification questions for: ${(parsed.missing || []).join(', ')} and include selectable options.`);
          }, 2500);
        }
      }
      // Note: requirements_complete is handled via the requirementsComplete state
      // which is set by the sendMessage response parser. The check at step 2 above
      // will auto-trigger generatePlan on the next effect cycle.
    }
  }, [autopilotEnabled, loading, generatingPlan, messages, sendMessage, requirementsComplete]);
  // ---------------------------------------

  const PLAN_SECTION_NAMES: Record<string, string> = {
    prd: 'Product Requirements',
    architecture: 'Architecture',
    taskList: 'Task List',
    apiSpec: 'API Specification',
    dbSchema: 'Database Schema',
    rules: 'Agent Rules',
    workflow: 'Workflow',
    diagrams: 'Diagrams',
    promptContext: 'Prompt Context',
    effortEstimate: 'Effort Estimate',
  };
  const ALL_PLAN_KEYS = Object.keys(PLAN_SECTION_NAMES);

  async function generatePlan() {
    if (!projectId) return;
    setGeneratingPlan(true);
    setPlanProgress([]);

    // Start polling for section progress
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}`);
        const data = await res.json();
        if (data.project?.plan) {
          const completedSections = ALL_PLAN_KEYS.filter(
            (k) => data.project.plan[k] && !data.project.plan[k].startsWith('> ⚠️')
          );
          setPlanProgress(completedSections);
        }
      } catch {}
    }, 3000);

    try {
      const res = await fetch(`/api/projects/${projectId}/plan`, { method: 'POST' });
      const data = await res.json();
      clearInterval(pollInterval);
      
      if (!res.ok) {
        throw new Error(data.error || data.details || 'Failed to generate plan');
      }
      
      // Show completion briefly before redirecting
      setPlanProgress(ALL_PLAN_KEYS);
      await new Promise((r) => setTimeout(r, 1000));

      if (autopilotEnabled) {
        router.push(`/project/${projectId}?autopilot=true`);
      } else {
        router.push(`/project/${projectId}`);
      }
    } catch (error: any) {
      clearInterval(pollInterval);
      console.error('Plan generation error:', error);
      // Even on error, redirect to project page to show partial results
      if (autopilotEnabled) {
        router.push(`/project/${projectId}?autopilot=true`);
      } else {
        alert(`Some sections may have failed. Check the project detail page.`);
        router.push(`/project/${projectId}`);
      }
    }
  }

  function submitBatchAnswers() {
    const lines = Object.entries(pendingAnswers).map(([qid, answer]) => {
      // If they chose 'Other', use the custom input value
      if (answer === 'Other') {
        const customTxt = customInputs[qid];
        return `- ${qid}: ${customTxt || 'Not specified'}`;
      }
      return `- ${qid}: ${answer}`;
    });

    if (lines.length === 0) return;
    const finalMsg = `My answers to your questions:\n${lines.join('\n')}`;
    
    setPendingAnswers({});
    setCustomInputs({});
    sendMessage(finalMsg);
  }

  function renderMessage(msg: Message, index: number) {
    const parsedRaw = msg.role === 'ASSISTANT' ? tryParseAI(msg.content) : null;
    const parsed = parsedRaw
      ? { ...parsedRaw, questions: normalizeQuestions(parsedRaw.questions as ClarifyQuestion[] | undefined) }
      : null;
    const cleanStr = getCleanText(msg.content) || (msg.role === 'ASSISTANT' && loading ? '...' : msg.content);

    return (
      <div key={index} className={`flex flex-col mb-6 ${msg.role === 'USER' ? 'items-end' : 'items-start'}`}>
        
        {/* Chat Text Bubble */}
        {(cleanStr || msg.role === 'USER') && (
          <div
            className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-sm ${
              msg.role === 'USER'
                ? 'bg-gradient-to-r from-violet-600 to-cyan-600 text-white'
                : 'bg-muted/50 backdrop-blur-sm border border-border/40 text-foreground'
            }`}
          >
            {msg.role === 'USER' ? (
              <p className="text-sm whitespace-pre-wrap">{cleanStr}</p>
            ) : (
              <div className="text-sm leading-relaxed space-y-2">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({node, ...props}) => <p className="mb-2 last:mb-0" {...props} />,
                    ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                    ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                    li: ({node, ...props}) => <li className="" {...props} />,
                    a: ({node, ...props}) => <a className="text-violet-400 hover:underline" {...props} />,
                    strong: ({node, ...props}) => <strong className="font-semibold text-violet-300" {...props} />,
                    code: ({node, ...props}) => <code className="bg-background/80 px-1.5 py-0.5 rounded font-mono text-xs text-cyan-300" {...props} />,
                  }}
                >
                  {cleanStr}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}

        {/* AI Clarification Widget (Rendered outside text bubble) */}
        {parsed && parsed.status === 'needs_clarification' && parsed.questions && (
          <div className="mt-3 w-[85%] max-w-2xl space-y-3">
            {parsed.questions.map((q) => (
              <div key={q.id} className="space-y-3 p-4 bg-background border border-border/40 rounded-xl shadow-sm">
                <p className="font-medium text-sm text-foreground">{q.question}</p>
                <div className="flex flex-col gap-2">
                  <div className="flex flex-wrap gap-2">
                    {Array.from(new Set([...(q.options || []), 'Other'])).map((option, optionIdx) => {
                      const isSelected = pendingAnswers[q.id] === option;
                      return (
                        <button
                          key={`${q.id}-${option}-${optionIdx}`}
                          onClick={() => setPendingAnswers(prev => ({ ...prev, [q.id]: option }))}
                          disabled={loading || msg !== messages[messages.length - 1]}
                          className={`px-3 py-1.5 text-xs rounded-full transition-all border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            isSelected 
                              ? 'bg-violet-600 text-white border-violet-500 shadow-md' 
                              : 'bg-muted hover:bg-muted/80 text-muted-foreground border-border/50'
                          }`}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                  {pendingAnswers[q.id] === 'Other' && (
                     <div className="pt-2 animate-in fade-in slide-in-from-top-1">
                       <input 
                         type="text"
                         placeholder="Type your custom requirement..."
                         value={customInputs[q.id] || ''}
                         onChange={e => setCustomInputs(prev => ({ ...prev, [q.id]: e.target.value }))}
                         disabled={loading || msg !== messages[messages.length - 1]}
                         className="w-full bg-muted/50 border border-border/50 rounded-md px-3 py-2 text-sm focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50"
                       />
                     </div>
                  )}
                </div>
                {q.recommendation && (
                  <p className="text-[11px] text-muted-foreground italic bg-violet-500/10 p-2 rounded-md border border-violet-500/20">
                    💡 <span className="text-violet-200">Recommendation:</span> {q.recommendation}
                  </p>
                )}
              </div>
            ))}
            
            {/* Submit Button for LATEST message */}
            {msg === messages[messages.length - 1] && !loading && Object.keys(pendingAnswers).length > 0 && (
              <div className="flex justify-end pt-2">
                 <Button 
                   onClick={submitBatchAnswers}
                   className="bg-gradient-to-r from-violet-600 to-cyan-600 text-white shadow-lg lg:px-8 hover:shadow-violet-500/30"
                 >
                   Submit Answers
                 </Button>
              </div>
            )}
          </div>
        )}

        {/* Completion Widget */}
        {parsed && parsed.status === 'requirements_complete' && (
          <div className="mt-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl max-w-[80%]">
            <p className="font-semibold text-emerald-400 flex items-center gap-2 mb-1">
              <span className="text-lg">✨</span> Requirements Complete!
            </p>
            <p className="text-sm text-emerald-200/70">
              All dimensions clarified. You can now generate the plan from the header.
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-screen">
      {/* Left: Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="border-b border-border/40 backdrop-blur-xl bg-background/80 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
              ← Back
            </Button>
            <h1 className="font-semibold">{projectName}</h1>
            <Badge variant="secondary" className="bg-yellow-500/20 text-yellow-400">
              Clarifying
            </Badge>
          </div>
          {requirementsComplete && (
            <Button
              onClick={generatePlan}
              disabled={generatingPlan}
              className="bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/40 transition-all"
            >
              {generatingPlan ? '⏳ Generating Plan...' : '🚀 Generate Plan'}
            </Button>
          )}
        </header>

        {/* Messages */}
        <ScrollArea className="flex-1 p-6">
          <div className="max-w-3xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-20">
                <div className="text-6xl mb-4">💡</div>
                <h3 className="text-xl font-semibold mb-2">Describe your project</h3>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Tell the AI what you want to build. Be as detailed or vague as you like — it will ask follow-up questions to clarify.
                </p>
                <div className="max-w-lg mx-auto">
                  <div
                    className="border-2 border-dashed border-border/50 rounded-xl p-6 hover:border-violet-500/50 transition-colors cursor-pointer bg-muted/10"
                    onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-violet-500/50'); }}
                    onDragLeave={(e) => { e.currentTarget.classList.remove('border-violet-500/50'); }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('border-violet-500/50');
                      const file = e.dataTransfer.files?.[0];
                      if (file && (file.type === 'text/plain' || file.type === 'text/markdown' || file.name.endsWith('.md') || file.name.endsWith('.txt'))) {
                        const reader = new FileReader();
                        reader.onload = () => {
                          const text = reader.result as string;
                          setInput(`Here is my project README / idea document:\n\n${text}\n\nPlease analyze this and create a comprehensive project plan.`);
                        };
                        reader.readAsText(file);
                      }
                    }}
                    onClick={() => {
                      const el = document.createElement('input');
                      el.type = 'file';
                      el.accept = '.md,.txt,.markdown';
                      el.onchange = () => {
                        const file = el.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = () => {
                            const text = reader.result as string;
                            setInput(`Here is my project README / idea document:\n\n${text}\n\nPlease analyze this and create a comprehensive project plan.`);
                          };
                          reader.readAsText(file);
                        }
                      };
                      el.click();
                    }}
                  >
                    <div className="text-2xl mb-2">📄</div>
                    <p className="text-sm font-medium text-muted-foreground">Import from README or idea doc</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Drop a .md or .txt file here, or click to browse</p>
                  </div>
                </div>
              </div>
            )}
            {messages.map((msg, i) => renderMessage(msg, i))}
            {loading && (
              <div className="flex justify-start mb-4">
                <div className="bg-muted/60 rounded-2xl px-4 py-3 border border-border/30">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 bg-violet-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce [animation-delay:0.1s]" />
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  </div>
                </div>
              </div>
            )}
            {generatingPlan && (
              <div className="mb-6 p-6 bg-muted/30 border border-violet-500/20 rounded-2xl backdrop-blur-sm">
                <h4 className="text-sm font-semibold mb-3 text-violet-300 flex items-center gap-2">
                  <span className="animate-spin">⚙️</span> Generating Plan — Section by Section
                </h4>
                <div className="space-y-2">
                  {ALL_PLAN_KEYS.map((key) => {
                    const done = planProgress.includes(key);
                    return (
                      <div key={key} className={`flex items-center gap-2 text-sm transition-all duration-500 ${done ? 'text-green-400' : 'text-muted-foreground'}`}>
                        <span>{done ? '✅' : '⏳'}</span>
                        <span>{PLAN_SECTION_NAMES[key]}</span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Each section is generated independently for maximum reliability.</p>
              </div>
            )}
            <div ref={scrollRef} />
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="border-t border-border/40 bg-background/80 backdrop-blur-xl p-4">
          <div className="max-w-3xl mx-auto flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Describe your project idea..."
              className="resize-none bg-muted/50 border-border/50 min-h-[60px] max-h-[120px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(input);
                }
              }}
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="self-end bg-gradient-to-r from-violet-600 to-cyan-600 text-white px-6"
            >
              Send
            </Button>
          </div>
        </div>
      </div>

      {/* Right: Requirements Radar */}
      <div className="w-72 border-l border-border/40 bg-card/30 backdrop-blur-sm p-4 hidden lg:block">
        <h3 className="text-sm font-semibold mb-4 text-muted-foreground uppercase tracking-wider">
          Requirements Radar
        </h3>
        <div className="space-y-2">
          {DIMENSIONS.map((dim) => {
            const covered = coveredDimensions.includes(dim.key);
            return (
              <Card
                key={dim.key}
                className={`p-3 border transition-all duration-300 ${
                  covered
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-border/30 bg-muted/20'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{dim.icon}</span>
                  <span className="text-sm">{dim.label}</span>
                  {covered && (
                    <span className="ml-auto text-green-400 text-sm">✓</span>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
        <div className="mt-6 text-center">
          <div className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            {coveredDimensions.length}/{DIMENSIONS.length}
          </div>
          <div className="text-xs text-muted-foreground mt-1">dimensions covered</div>
        </div>
      </div>
    </div>
  );
}

export default function NewProjectPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-screen"><div className="text-muted-foreground">Loading...</div></div>}>
      <NewProjectContent />
    </Suspense>
  );
}
