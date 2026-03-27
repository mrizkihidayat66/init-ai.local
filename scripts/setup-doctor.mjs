import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');

function resolveSqlitePath(databaseUrl) {
  if (!databaseUrl.startsWith('file:')) return null;

  const rawPath = databaseUrl.slice('file:'.length).split('?')[0];
  if (!rawPath) return null;

  if (path.isAbsolute(rawPath)) {
    return rawPath;
  }

  return path.resolve(process.cwd(), rawPath);
}

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
  const dbPath = resolveSqlitePath(db);
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

  if (!dbPath) {
    throw new Error('DATABASE_URL must include a sqlite file path');
  }

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at ${dbPath}. Run: bun run db:migrate`);
  }

  const dbStats = fs.statSync(dbPath);
  if (!dbStats.isFile() || dbStats.size === 0) {
    throw new Error(`Database file is empty or invalid at ${dbPath}. Run: bun run db:migrate`);
  }

  if (!hasAnyApiKey) {
    console.warn('[setup:doctor] Warning: no provider API key found in .env');
  }

  console.log(`[setup:doctor] Environment looks good. Database: ${dbPath}`);
} catch (error) {
  console.error('[setup:doctor] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
