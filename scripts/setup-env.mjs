import fs from 'node:fs';
import path from 'node:path';

const cwd = process.cwd();
const envPath = path.join(cwd, '.env');
const examplePath = path.join(cwd, '.env.example');

try {
  if (fs.existsSync(envPath)) {
    console.log('[setup:env] .env already exists. Skipping creation.');
    process.exit(0);
  }

  if (!fs.existsSync(examplePath)) {
    throw new Error('.env.example not found');
  }

  fs.copyFileSync(examplePath, envPath);
  console.log('[setup:env] Created .env from .env.example');
} catch (error) {
  console.error('[setup:env] Failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
}
