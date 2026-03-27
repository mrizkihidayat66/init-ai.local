import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const provider = searchParams.get('provider');
  const apiKey = searchParams.get('apiKey') || undefined;
  let baseUrl = searchParams.get('baseUrl') || undefined;

  try {
    switch (provider) {
      case 'openai':
      case 'agentrouter': {
        const url = provider === 'agentrouter' 
          ? (baseUrl || 'https://api.agentrouter.org/v1') + '/models'
          : 'https://api.openai.com/v1/models';
        
        const key = apiKey || process.env.OPENAI_API_KEY || process.env.AGENTROUTER_API_KEY || '';
        if (!key) return NextResponse.json({ models: [] });

        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) throw new Error('Failed to fetch models');
        
        const data = await res.json();
        // Return array of purely string model IDs
        const models = data.data.map((m: any) => m.id).sort();
        return NextResponse.json({ models });
      }

      case 'google': {
        const key = apiKey || process.env.GOOGLE_API_KEY || '';
        if (!key) return NextResponse.json({ models: [] });

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        if (!res.ok) throw new Error('Failed to fetch Gemini models');

        const data = await res.json();
        const models = data.models
          .map((m: any) => m.name.replace('models/', ''))
          .filter((name: string) => name.includes('gemini'));
        return NextResponse.json({ models });
      }

      case 'ollama': {
        const url = baseUrl || 'http://localhost:11434';
        const res = await fetch(`${url.replace('/v1', '').replace('/api', '')}/api/tags`);
        if (!res.ok) throw new Error('Failed to fetch Ollama models');

        const data = await res.json();
        const models = data.models.map((m: any) => m.name);
        return NextResponse.json({ models });
      }

      case 'anthropic': {
        // Anthropic doesn't have a public models list endpoint yet.
        return NextResponse.json({
          models: [
            'claude-3-7-sonnet-20250219',
            'claude-3-5-sonnet-20241022',
            'claude-3-5-haiku-20241022',
            'claude-3-opus-20240229',
          ],
        });
      }

      default:
        return NextResponse.json({ models: [] });
    }
  } catch (error) {
    console.error('Error fetching models:', error);
    return NextResponse.json({ models: [], error: 'Failed to fetch' }, { status: 500 });
  }
}
