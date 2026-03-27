import fs from 'node:fs';
import path from 'node:path';

const ALLOWED_KEYS = new Set([
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'AGENTROUTER_API_KEY',
  'OPENAI_COMPATIBLE_API_KEY',
  'OPENAI_COMPATIBLE_BASE_URL',
]);

function usage() {
  console.log('Usage: npm run setup:api-key -- <KEY_NAME> <VALUE>');
  console.log('Example: npm run setup:api-key -- OPENAI_API_KEY sk-xxxx');
}

const [, , keyName, value] = process.argv;

if (!keyName || !value) {
  usage();
  process.exit(1);
}

if (!ALLOWED_KEYS.has(keyName)) {
  console.error(`[setup:api-key] Unsupported key: ${keyName}`);
  console.error(`[setup:api-key] Allowed keys: ${Array.from(ALLOWED_KEYS).join(', ')}`);
  process.exit(1);
}

const envPath = path.join(process.cwd(), '.env');
if (!fs.existsSync(envPath)) {
  console.error('[setup:api-key] .env not found. Run: npm run setup:env');
  process.exit(1);
}

let content = fs.readFileSync(envPath, 'utf8');
const line = `${keyName}="${value.replace(/"/g, '\\"')}"`;
const regex = new RegExp(`^\\s*${keyName}\\s*=.*$`, 'm');

if (regex.test(content)) {
  content = content.replace(regex, line);
} else {
  if (!content.endsWith('\n')) content += '\n';
  content += `${line}\n`;
}

fs.writeFileSync(envPath, content, 'utf8');
console.log(`[setup:api-key] Updated ${keyName} in .env`);
