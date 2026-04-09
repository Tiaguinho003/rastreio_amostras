import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function parseEnvFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    console.error(`Arquivo .env nao encontrado: ${filePath}`);
    console.error('Copie .env.example para .env e preencha os valores.');
    process.exit(1);
  }

  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex < 1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

function required(vars, key) {
  const value = vars[key];
  if (!value) {
    console.error(`Variavel obrigatoria ausente no .env: ${key}`);
    process.exit(1);
  }
  return value;
}

export function loadConfig() {
  const envPath = resolve(__dirname, '.env');
  const vars = parseEnvFile(envPath);

  return Object.freeze({
    backendUrl: (vars.BACKEND_URL || 'https://rastreio-prod-app-r4au5o2iea-rj.a.run.app').replace(
      /\/$/,
      ''
    ),
    agentUsername: required(vars, 'AGENT_USERNAME'),
    agentPassword: required(vars, 'AGENT_PASSWORD'),
    printerName: required(vars, 'PRINTER_NAME'),
    printerId: vars.PRINTER_ID || 'elgin-l42-office',
    pollIntervalMs: parseInt(vars.POLL_INTERVAL_MS || '7000', 10),
    printRetryCount: Math.max(parseInt(vars.PRINT_RETRY_COUNT || '3', 10), 1),
    printRetryDelayMs: Math.max(parseInt(vars.PRINT_RETRY_DELAY_MS || '2000', 10), 500),
    logLevel: vars.LOG_LEVEL || 'info',
  });
}
