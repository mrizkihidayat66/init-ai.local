import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

function isMissingTableError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2021';
}

// GET /api/settings - Get current LLM configuration
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const reqProvider = searchParams.get('provider');

    let activeProvider = 'openai';
    const defaultGlobal = await prisma.settings.findUnique({ where: { id: 'default' } });
    if (defaultGlobal) {
      activeProvider = defaultGlobal.provider;
    } else {
      await prisma.settings.create({ data: { id: 'default', provider: 'openai', model: 'auto', temperature: 0.7 } });
    }

    const targetProvider = reqProvider || activeProvider;
    let settings = await prisma.settings.findUnique({ where: { id: targetProvider } });
    
    if (!settings) {
      settings = await prisma.settings.create({
        data: {
          id: targetProvider,
          provider: targetProvider,
          model: defaultGlobal?.model || 'auto',
          temperature: defaultGlobal?.temperature || 0.7,
        },
      });
    }

    return NextResponse.json({
      settings: {
        ...settings,
        apiKey: settings.apiKey ? '••••••' + settings.apiKey.slice(-4) : null,
      },
      activeProvider
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Database schema is not initialized. Run `npm run db:push` or `npm run db:migrate`.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to load settings' }, { status: 500 });
  }
}

// PUT /api/settings - Update LLM configuration
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, model, customModels, apiKey, baseUrl, temperature, makeActive } = body;

    const providerSettings = await prisma.settings.upsert({
      where: { id: provider },
      update: {
        ...(model && { model }),
        ...(customModels !== undefined && { customModels }),
        ...(apiKey !== undefined && { apiKey: apiKey === '' ? null : apiKey }),
        ...(baseUrl !== undefined && { baseUrl: baseUrl === '' ? null : baseUrl }),
        ...(temperature !== undefined && { temperature }),
      },
      create: {
        id: provider,
        provider: provider,
        model: model || 'auto',
        customModels: customModels || null,
        apiKey: apiKey || null,
        baseUrl: baseUrl || null,
        temperature: temperature ?? 0.7,
      },
    });

    if (makeActive !== false) {
      await prisma.settings.upsert({
        where: { id: 'default' },
        update: {
          provider,
          ...(model && { model }),
          ...(temperature !== undefined && { temperature }),
        },
        create: {
          id: 'default',
          provider,
          model: model || 'auto',
          temperature: temperature ?? 0.7,
        }
      });
    }

    return NextResponse.json({
      settings: {
        ...providerSettings,
        apiKey: providerSettings.apiKey ? '••••••' + providerSettings.apiKey.slice(-4) : null,
      },
    });
  } catch (error) {
    if (isMissingTableError(error)) {
      return NextResponse.json(
        { error: 'Database schema is not initialized. Run `npm run db:push` or `npm run db:migrate`.' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 });
  }
}


