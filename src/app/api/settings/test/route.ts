import { NextResponse } from 'next/server';
import { generateText } from 'ai';
import { getModel, ProviderConfig } from '@/lib/ai/provider';
import { prisma } from '@/lib/db';

export async function POST(req: Request) {
  try {
    const config: ProviderConfig = await req.json();
    
    // If the API key is masked (has ••••••) or missing, load the real one from the DB for this provider
    if (!config.apiKey || config.apiKey.includes('••••••')) {
      const dbSettings = await prisma.settings.findUnique({ where: { id: config.provider } });
      config.apiKey = dbSettings?.apiKey || null;
    }

    const model = getModel(config);
    
    // Perform a very fast connection test
    const { text } = await generateText({
      model,
      prompt: 'Reply with the exact word: "Connection Successful!". Do not say anything else.',
      temperature: 0,
    });
    
    return NextResponse.json({ success: true, text });
  } catch (error: any) {
    console.error('LLM Test Error:', error);
    return NextResponse.json({ success: false, error: error.message || 'Unknown error occurred' }, { status: 500 });
  }
}
