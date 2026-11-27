#!/usr/bin/env node
/**
 * install-clients.mjs — Instalador multiplataforma (Windows, macOS, Linux)
 * Configura automaticamente o servidor MCP `claude-skill-media-studio` para:
 *   - Claude Desktop (claude_desktop_config.json)
 *   - OpenCode (~/.config/opencode/opencode.json)
 *   - ChatGPT Desktop (gera config/clients/chatgpt-desktop.mcp.json pronto para importação)
 *
 * Uso:
 *   node scripts/install-clients.mjs --client all
 *   node scripts/install-clients.mjs --client claude --dry-run
 *   node scripts/install-clients.mjs --client opencode --comfyui-url http://127.0.0.1:8188
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const MCP_ENTRY = path.join(PROJECT_ROOT, 'dist', 'mcp-server.js');

const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const idx = args.indexOf(flag);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
};

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Uso: node scripts/install-clients.mjs [opções]

Opções:
  --client <all|claude|chatgpt|opencode>  Cliente alvo (padrão: all)
  --comfyui-url <URL>                     Endpoint do ComfyUI (padrão: http://127.0.0.1:8188)
  --assistente-url <URL>                  Endpoint do AssistentePessoal (padrão: https://jarvis.laytech.com.br)
  --data-path <PATH>                      Diretório de dados da skill (padrão: ~/.media-studio-data)
  --dry-run                               Apenas exibe as alterações sem gravar arquivos
  --help                                  Exibe esta ajuda
`);
  process.exit(0);
}

const targetClient = getArg('--client', 'all').toLowerCase();
const dryRun = args.includes('--dry-run');
const comfyuiUrl = getArg('--comfyui-url', process.env.COMFYUI_ENDPOINT ?? 'http://127.0.0.1:8188');
const assistenteUrl = getArg(
  '--assistente-url',
  process.env.ASSISTENTE_PESSOAL_BASE_URL ?? 'https://jarvis.laytech.com.br',
);
const dataPath = getArg(
  '--data-path',
  process.env.SKILL_DATA_PATH ?? path.join(os.homedir(), '.media-studio-data'),
);

const serverEnv = {
  NODE_ENV: 'production',
  COMFYUI_ENDPOINT: comfyuiUrl,
  ASSISTENTE_PESSOAL_BASE_URL: assistenteUrl,
  ASSISTENTE_PESSOAL_API_KEY: process.env.ASSISTENTE_PESSOAL_API_KEY ?? '',
  SKILL_DATA_PATH: dataPath,
};

function getClaudeConfigPath() {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), 'AppData', 'Roaming');
    return path.join(appData, 'Claude', 'claude_desktop_config.json');
  }
  if (process.platform === 'darwin') {
    return path.join(
      os.homedir(),
      'Library',
      'Application Support',
      'Claude',
      'claude_desktop_config.json',
    );
  }
  return path.join(os.homedir(), '.config', 'Claude', 'claude_desktop_config.json');
}

function getOpenCodeConfigPath() {
  const xdg = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');
  return path.join(xdg, 'opencode', 'opencode.json');
}

function getChatGptExportPath() {
  return path.join(PROJECT_ROOT, 'config', 'clients', 'chatgpt-desktop.mcp.json');
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJsonWithBackup(filePath, data) {
  const serialized = `${JSON.stringify(data, null, 2)}\n`;
  if (dryRun) {
    console.log(`\n[DRY-RUN] Arquivo: ${filePath}\n${serialized}`);
    return;
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, `${filePath}.bak`);
  }
  fs.writeFileSync(filePath, serialized, 'utf-8');
  console.log(`[OK] Configurado: ${filePath}`);
}

function installClaude() {
  const configPath = getClaudeConfigPath();
  const current = readJsonSafe(configPath);
  const next = {
    ...current,
    mcpServers: {
      ...(current.mcpServers ?? {}),
      'media-studio': {
        command: 'node',
        args: [MCP_ENTRY],
        env: serverEnv,
      },
    },
  };
  writeJsonWithBackup(configPath, next);
}

function installOpenCode() {
  const configPath = getOpenCodeConfigPath();
  const current = readJsonSafe(configPath);
  const next = {
    $schema: 'https://opencode.ai/config.json',
    ...current,
    mcp: {
      ...(current.mcp ?? {}),
      'media-studio': {
        type: 'local',
        command: ['node', MCP_ENTRY],
        enabled: true,
        environment: serverEnv,
      },
    },
  };
  writeJsonWithBackup(configPath, next);
}

function installChatGpt() {
  const exportPath = getChatGptExportPath();
  const payload = {
    name: 'media-studio',
    description:
      'Geração de imagens/vídeos via ComfyUI + montagem FFmpeg + publicação social via AssistentePessoal',
    transport: 'stdio',
    command: 'node',
    args: [MCP_ENTRY],
    env: serverEnv,
  };
  writeJsonWithBackup(exportPath, payload);
  console.log(
    '[INFO] ChatGPT Desktop: abra Settings -> Apps & Connectors -> Developer Mode -> Add MCP Server e importe os campos de config/clients/chatgpt-desktop.mcp.json.',
  );
}

if (!fs.existsSync(MCP_ENTRY)) {
  console.warn(
    `[WARN] ${MCP_ENTRY} ainda não foi compilado. Execute "pnpm build" antes de iniciar os clientes.`,
  );
}

if (targetClient === 'all' || targetClient === 'claude') installClaude();
if (targetClient === 'all' || targetClient === 'opencode') installOpenCode();
if (targetClient === 'all' || targetClient === 'chatgpt') installChatGpt();

if (!['all', 'claude', 'opencode', 'chatgpt'].includes(targetClient)) {
  console.error(`[ERROR] Cliente desconhecido: ${targetClient}`);
  process.exit(1);
}

console.log('\nConcluído! Reinicie o(s) cliente(s) para carregar as ferramentas MCP do media-studio.');
