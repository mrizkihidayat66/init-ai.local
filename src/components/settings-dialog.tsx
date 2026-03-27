'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type SettingsData = {
  provider: string;
  model: string;
  customModels: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  temperature: number;
};

const PROVIDER_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o1-mini', 'o3-mini'],
  agentrouter: ['gpt-4o', 'claude-3-5-sonnet', 'gemini-1.5-pro'],
  openai_compatible: ['gpt-4o-mini', 'llama-3.1-8b-instruct', 'deepseek-coder-6.7b-instruct', 'qwen/qwen3-vl-4b'],
  anthropic: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229'],
  google: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
  lmstudio: ['qwen/qwen3-vl-4b', 'deepseek-coder-6.7b-instruct', 'meta-llama-3.1-8b-instruct'],
  ollama: ['llama3.3', 'mistral', 'codellama', 'deepseek-coder-v2', 'deepseek-coder-6.7b-instruct', 'qwen2.5-coder', 'nvidia/nemotron-3-nano-4b'],
};

export function SettingsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [settings, setSettings] = useState<SettingsData>({
    provider: 'openai',
    model: 'auto',
    customModels: null,
    apiKey: null,
    baseUrl: null,
    temperature: 0.7,
  });
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [modelTagInput, setModelTagInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  // Fetch the specific provider's settings when dialog opens or provider dropdown changes
  useEffect(() => {
    if (open) {
      setApiKeyInput(''); // Clear whenever we load
      fetch(`/api/settings?provider=${settings.provider}`)
        .then((r) => r.json())
        .then((data) => {
          setSettings(data.settings);
        });
    }
  }, [open, settings.provider]);

  async function handleSave() {
    setSaving(true);
    setStatus('idle');
    try {
      const payload: Record<string, unknown> = {
        provider: settings.provider,
        model: settings.model,
        customModels: settings.customModels,
        baseUrl: settings.baseUrl,
        temperature: settings.temperature,
      };
      if (apiKeyInput) {
        payload.apiKey = apiKeyInput;
      }
      payload.makeActive = true; // Make this provider globally active when saving

      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch {
      setStatus('error');
    }
    setSaving(false);
  }

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; text?: string; error?: string } | null>(null);

  async function handleTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const payload = {
        provider: settings.provider,
        model: settings.model,
        baseUrl: settings.baseUrl,
        apiKey: apiKeyInput || settings.apiKey || '',
      };
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (error: any) {
      setTestResult({ success: false, error: error.message });
    }
    setTesting(false);
  }

  // Parse custom models list
  const parsedCustomModels = (settings.customModels || '')
    .split(',')
    .map(m => m.trim())
    .filter(Boolean);
  const modelOptions = parsedCustomModels.length > 0
    ? parsedCustomModels
    : (PROVIDER_MODELS[settings.provider] || []);

  function setCustomModels(next: string[]) {
    const deduped = Array.from(new Set(next.map((m) => m.trim()).filter(Boolean)));
    setSettings({ ...settings, customModels: deduped.join(', ') || null });
  }

  function addModelTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    setCustomModels([...(parsedCustomModels || []), value]);
    setModelTagInput('');
  }

  function removeModelTag(target: string) {
    setCustomModels(parsedCustomModels.filter((m) => m !== target));
  }

  function onTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addModelTag(modelTagInput);
      return;
    }

    if (e.key === 'Backspace' && !modelTagInput && parsedCustomModels.length > 0) {
      const last = parsedCustomModels[parsedCustomModels.length - 1];
      removeModelTag(last);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card/95 backdrop-blur-xl border-border/40">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">
            ⚙️ LLM Provider Settings
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Provider */}
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select
              value={settings.provider}
              onValueChange={(v: string | null) => {
                const newProvider = v ?? 'openai';
                // Only temporarily set it to fetch its settings. Real active save happens on handleSave
                setSettings({ ...settings, provider: newProvider });
              }}
            >
              <SelectTrigger className="bg-muted/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="openai">OpenAI</SelectItem>
                <SelectItem value="anthropic">Anthropic</SelectItem>
                <SelectItem value="google">Google</SelectItem>
                <SelectItem value="agentrouter">AgentRouter</SelectItem>
                <SelectItem value="openai_compatible">OpenAI Compatible</SelectItem>
                <SelectItem value="lmstudio">LM Studio (Local)</SelectItem>
                <SelectItem value="ollama">Ollama (Local)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Model Config (2-Step Manual List) */}
          <div className="space-y-4 pt-2 border-t border-border/40">
            <div className="space-y-2">
              <Label>Available Models List</Label>
              <div className="bg-muted/50 border border-input rounded-md p-2 min-h-[42px]">
                <div className="flex flex-wrap gap-2">
                  {parsedCustomModels.map((model) => (
                    <span
                      key={model}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs bg-violet-500/15 border border-violet-500/30 text-violet-200"
                    >
                      <span className="font-mono">{model}</span>
                      <button
                        type="button"
                        onClick={() => removeModelTag(model)}
                        className="text-violet-300 hover:text-white"
                        aria-label={`Remove ${model}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={modelTagInput}
                    onChange={(e) => setModelTagInput(e.target.value)}
                    onKeyDown={onTagInputKeyDown}
                    onBlur={() => addModelTag(modelTagInput)}
                    placeholder="Type a model and press Enter"
                    className="flex-1 min-w-[220px] bg-transparent outline-none text-xs font-mono py-1"
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-tight">
                Add one model per tag. Press Enter or comma to create a tag.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Active Model</Label>
              <Select
                value={settings.model}
                onValueChange={(v: string | null) => setSettings({ ...settings, model: v ?? 'auto' })}
              >
                <SelectTrigger className="bg-muted/50 font-mono text-sm">
                  <SelectValue placeholder="Auto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto" className="font-semibold text-violet-400">Auto (Default)</SelectItem>
                  {modelOptions.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* API Key */}
          {settings.provider !== 'ollama' && (
            <div className="space-y-2">
              <Label>API Key</Label>
              <Input
                type="password"
                placeholder={settings.apiKey || 'Enter API key...'}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="bg-muted/50 font-mono text-sm"
              />
              {settings.apiKey && settings.apiKey.startsWith('••••••') && !apiKeyInput && (
                <p className="text-xs text-muted-foreground mt-1">
                  Current: {settings.apiKey}
                </p>
              )}
            </div>
          )}

          {/* Base URL (Ollama & AgentRouter) */}
          {(settings.provider === 'ollama' || settings.provider === 'agentrouter' || settings.provider === 'openai_compatible' || settings.provider === 'lmstudio') && (
            <div className="space-y-2">
              <Label>Base URL</Label>
              <Input
                placeholder="http://localhost:11434/v1"
                value={settings.baseUrl || ''}
                onChange={(e) =>
                  setSettings({ ...settings, baseUrl: e.target.value || null })
                }
                className="bg-muted/50 font-mono text-sm"
              />
            </div>
          )}

          {/* Temperature */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm font-mono text-muted-foreground">
                {settings.temperature.toFixed(1)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={settings.temperature}
              onChange={(e) => setSettings({ ...settings, temperature: parseFloat(e.target.value) })}
              className="w-full accent-violet-500 h-2 bg-muted rounded-lg appearance-none cursor-pointer"
            />
          </div>

          {/* Save & Test */}
          <div className="flex flex-col gap-3 pt-2">
            {testResult && (
              <div className={`text-sm p-3 rounded-md ${testResult.success ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                {testResult.success ? `✅ Ping successful! Response: ${testResult.text}` : `❌ Test failed: ${testResult.error}`}
              </div>
            )}
            
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={handleTest}
                disabled={testing}
                className="border-violet-500/30 hover:bg-violet-500/10 transition-colors"
                type="button"
              >
                {testing ? 'Testing...' : '⚡ Test Connection'}
              </Button>

              <div className="flex items-center gap-3">
                {status === 'saved' && (
                  <span className="text-sm text-green-400 animate-in fade-in zoom-in duration-300">✅ Saved!</span>
                )}
                {status === 'error' && (
                  <span className="text-sm text-red-400 animate-in fade-in zoom-in duration-300">❌ Failed</span>
                )}
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-lg shadow-violet-500/20"
                >
                  {saving ? 'Saving...' : 'Save Configuration'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
