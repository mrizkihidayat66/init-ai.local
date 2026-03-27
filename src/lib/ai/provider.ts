import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { prisma } from '@/lib/db';

export type ProviderConfig = {
  provider: string;
  model: string;
  customModels?: string | null;
  apiKey: string | null;
  baseUrl: string | null;
  temperature: number;
};

export async function getSettings(): Promise<ProviderConfig> {
  // 1. Get global active provider setting
  let globalSettings = await prisma.settings.findUnique({ where: { id: 'default' } });
  if (!globalSettings) {
    globalSettings = await prisma.settings.create({
      data: {
        id: 'default',
        provider: 'openai',
        model: 'gpt-4o',
        temperature: 0.7,
      },
    });
  }

  // 2. Get specific config for that provider
  const activeProvider = globalSettings.provider;
  let providerSettings = await prisma.settings.findUnique({ where: { id: activeProvider } });
  if (!providerSettings) {
    providerSettings = await prisma.settings.create({
      data: {
        id: activeProvider,
        provider: activeProvider,
        model: globalSettings.model,
        temperature: globalSettings.temperature,
      },
    });
  }

  return providerSettings;
}

export function getProvider(config: ProviderConfig) {
  switch (config.provider) {
    case 'openai':
      return createOpenAI({
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      });
    case 'anthropic':
      return createAnthropic({
        apiKey: config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? '',
      });
    case 'agentrouter':
      return createOpenAI({
        baseURL: config.baseUrl ?? 'https://api.agentrouter.org/v1',
        apiKey: config.apiKey ?? process.env.AGENTROUTER_API_KEY ?? '',
      });
    case 'openai_compatible':
      return createOpenAI({
        baseURL: config.baseUrl ?? process.env.OPENAI_COMPATIBLE_BASE_URL ?? '',
        apiKey: config.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? '',
      });
    case 'google':
      return createGoogleGenerativeAI({
        apiKey: config.apiKey ?? process.env.GOOGLE_API_KEY ?? '',
      });
    case 'lmstudio':
      return createOpenAI({
        baseURL: config.baseUrl ?? 'http://localhost:1234/v1',
        apiKey: config.apiKey || 'lm-studio',
      });
    case 'ollama':
      return createOpenAI({
        baseURL: config.baseUrl ?? 'http://localhost:11434/v1',
        apiKey: config.apiKey || 'ollama',
      });
    default:
      return createOpenAI({
        apiKey: config.apiKey ?? process.env.OPENAI_API_KEY ?? '',
      });
  }
}

export function getModel(config: ProviderConfig) {
  const provider = getProvider(config);
  let modelStr = config.model;

  if (modelStr === 'auto') {
    switch (config.provider) {
      case 'openai':
        modelStr = 'gpt-4o';
        break;
      case 'anthropic':
        modelStr = 'claude-3-5-sonnet-20241022';
        break;
      case 'google':
        modelStr = 'gemini-2.5-pro';
        break;
      case 'ollama':
        modelStr = 'llama3.3';
        break;
      case 'lmstudio':
        modelStr = 'model-identifier'; // LM studio usually has one active model
        break;
      case 'agentrouter':
        modelStr = 'claude-3-5-sonnet';
        break;
      case 'openai_compatible':
        modelStr = 'gpt-4o-mini';
        break;
      default:
        modelStr = 'gpt-4o';
    }
  }

  // Force chat model selection if the provider supports .chat()
  // This prevents the SDK from defaulting to /v1/responses or /v1/completions for unknown model strings
  if (provider.chat) {
    return provider.chat(modelStr);
  }
  
  return provider(modelStr);
}
