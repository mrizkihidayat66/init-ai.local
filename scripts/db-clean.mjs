import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) return;

  const content = fs.readFileSync(envPath, 'utf8');
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '');
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

function parseDbPath(databaseUrl) {
  if (!databaseUrl || !databaseUrl.startsWith('file:')) {
    throw new Error('DATABASE_URL must use sqlite file: format, e.g. file:D:/path/dev.db');
  }
  const raw = databaseUrl.slice('file:'.length);
  // Preserve absolute Windows paths like D:/... and normalize separators.
  return path.normalize(raw);
}

function cleanDb() {
  loadEnvFile();
  const databaseUrl = process.env.DATABASE_URL;
  const dbPath = parseDbPath(databaseUrl);

  if (fs.existsSync(dbPath)) {
    fs.rmSync(dbPath, { force: true });
    console.log(`[db:clean] Removed database file: ${dbPath}`);
  } else {
    console.log(`[db:clean] Database file does not exist: ${dbPath}`);
  }
}

try {
  cleanDb();
} catch (error) {
  console.error('[db:clean] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
