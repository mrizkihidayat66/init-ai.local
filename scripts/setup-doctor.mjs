import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');

function parseEnv(content) {
  const out = new Map();
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    out.set(key, val);
  }
  return out;
}

try {
  if (!fs.existsSync(envPath)) {
    throw new Error('.env not found. Run: npm run setup:env');
  }

  const env = parseEnv(fs.readFileSync(envPath, 'utf8'));
  const db = env.get('DATABASE_URL') || '';
  const hasAnyApiKey = [
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GOOGLE_API_KEY',
    'AGENTROUTER_API_KEY',
    'OPENAI_COMPATIBLE_API_KEY',
  ].some((k) => (env.get(k) || '').length > 0);

  if (!db.startsWith('file:')) {
    throw new Error('DATABASE_URL must be sqlite format: file:<path-to-db>');
  }

  if (!hasAnyApiKey) {
    console.warn('[setup:doctor] Warning: no provider API key found in .env');
  }

  console.log('[setup:doctor] Environment looks good.');
} catch (error) {
  console.error('[setup:doctor] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
