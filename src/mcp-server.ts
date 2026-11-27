#!/usr/bin/env node
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import { handleSkillRequest, MediaStudioSkill } from './skill-entry.js';
import type { SkillAction } from './types/index.js';

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

interface McpToolDefinition {
  name: string;
  action: SkillAction;
  description: string;
  inputSchema: Record<string, unknown>;
}

export const MCP_TOOLS: McpToolDefinition[] = [
  {
    name: 'media_studio_discover',
    action: 'discover',
    description: 'Executa varredura do host para descobrir ComfyUI, AssistentePessoal, FFmpeg, GPU e volumes.',
    inputSchema: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Ignora cache e força nova varredura' },
      },
    },
  },
  {
    name: 'media_studio_get_status',
    action: 'get-status',
    description: 'Retorna status resumido da skill e saúde dos serviços configurados.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'media_studio_generate_image',
    action: 'generate-image',
    description: 'Gera imagem (t2i/i2i) via ComfyUI (FLUX.1 GGUF ou checkpoints SDXL/DreamShaper) e salva no storage local.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string', description: 'Prompt positivo de geração' },
        negativePrompt: { type: 'string' },
        model: { type: 'string', description: 'Ex: flux1-schnell-Q3_K_S.gguf ou DreamShaper_8_pruned.safetensors' },
        width: { type: 'integer', minimum: 64, maximum: 4096 },
        height: { type: 'integer', minimum: 64, maximum: 4096 },
        steps: { type: 'integer', minimum: 1, maximum: 150 },
        cfg: { type: 'number', minimum: 0.1, maximum: 30 },
        seed: { type: 'integer', minimum: 0 },
      },
    },
  },
  {
    name: 'media_studio_generate_video',
    action: 'generate-video',
    description: 'Gera vídeo (t2v/i2v) via ComfyUI (ex: Wan 2.1 I2V 14B 720p GGUF) e salva no storage local.',
    inputSchema: {
      type: 'object',
      required: ['prompt'],
      properties: {
        prompt: { type: 'string' },
        negativePrompt: { type: 'string' },
        model: { type: 'string' },
        inputAssetId: { type: 'string', description: 'ID do asset de imagem para i2v' },
        width: { type: 'integer' },
        height: { type: 'integer' },
        fps: { type: 'integer' },
        duration: { type: 'number' },
        steps: { type: 'integer' },
        seed: { type: 'integer' },
      },
    },
  },
  {
    name: 'media_studio_assemble_video',
    action: 'assemble-video',
    description: 'Monta Shorts/Reels/TikTok concatenando clips via FFmpeg (libx264, faststart).',
    inputSchema: {
      type: 'object',
      required: ['clips'],
      properties: {
        type: { type: 'string', enum: ['shorts', 'reels', 'tiktok', 'standard'] },
        clips: {
          type: 'array',
          items: {
            type: 'object',
            required: ['assetId'],
            properties: {
              assetId: { type: 'string' },
              startSec: { type: 'number' },
              durationSec: { type: 'number' },
            },
          },
        },
        aspectRatio: { type: 'string', description: 'Ex: 9:16' },
        resolution: { type: 'string', description: 'Ex: 1080x1920' },
      },
    },
  },
  {
    name: 'media_studio_publish',
    action: 'publish',
    description: 'Publica um asset salvo em redes sociais via AssistentePessoal.',
    inputSchema: {
      type: 'object',
      required: ['assetId', 'platforms', 'caption'],
      properties: {
        assetId: { type: 'string' },
        platforms: {
          type: 'array',
          items: { type: 'string', enum: ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin'] },
        },
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
        scheduledAt: { type: 'string', format: 'date-time' },
        title: { type: 'string' },
      },
    },
  },
  {
    name: 'media_studio_list_assets',
    action: 'list-assets',
    description: 'Lista assets salvos no índice local da skill.',
    inputSchema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: ['assets', 'gallery', 'projects', 'temp'] },
        kind: { type: 'string', enum: ['image', 'video', 'audio', 'other'] },
        projectId: { type: 'string' },
        tag: { type: 'string' },
      },
    },
  },
  {
    name: 'media_studio_get_asset',
    action: 'get-asset',
    description: 'Obtém metadados de um asset específico pelo ID.',
    inputSchema: {
      type: 'object',
      required: ['assetId'],
      properties: { assetId: { type: 'string' } },
    },
  },
  {
    name: 'media_studio_delete_asset',
    action: 'delete-asset',
    description: 'Remove um asset do disco e do índice local.',
    inputSchema: {
      type: 'object',
      required: ['assetId'],
      properties: { assetId: { type: 'string' } },
    },
  },
  {
    name: 'media_studio_cleanup_temp',
    action: 'cleanup-temp',
    description: 'Limpa arquivos temporários expirados do storage da skill.',
    inputSchema: {
      type: 'object',
      properties: { maxAgeHours: { type: 'number' } },
    },
  },
];

export async function handleMcpMessage(
  msg: JsonRpcRequest,
  skillInstance?: MediaStudioSkill,
): Promise<JsonRpcResponse | null> {
  const id = msg.id ?? null;

  if (msg.method === 'notifications/initialized') {
    return null;
  }

  if (msg.method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'claude-skill-media-studio',
          version: '1.1.0',
        },
      },
    };
  }

  if (msg.method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (msg.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: MCP_TOOLS.map(({ name, description, inputSchema }) => ({
          name,
          description,
          inputSchema,
        })),
      },
    };
  }

  if (msg.method === 'tools/call') {
    const toolName = String(msg.params?.name ?? '');
    const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
    const tool = MCP_TOOLS.find((t) => t.name === toolName);

    if (!tool) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: `Unknown tool: ${toolName}` },
      };
    }

    const response = skillInstance
      ? await skillInstance.execute({ action: tool.action, params: args })
      : await handleSkillRequest({ action: tool.action, params: args });

    return {
      jsonrpc: '2.0',
      id,
      result: {
        content: [{ type: 'text', text: JSON.stringify(response, null, 2) }],
        isError: !response.success,
      },
    };
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${msg.method}` },
  };
}

function startStdioServer(): void {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });

  rl.on('line', (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed: JsonRpcRequest;
    try {
      parsed = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      const errRes: JsonRpcResponse = {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error' },
      };
      process.stdout.write(`${JSON.stringify(errRes)}\n`);
      return;
    }

    handleMcpMessage(parsed)
      .then((res) => {
        if (res !== null) {
          process.stdout.write(`${JSON.stringify(res)}\n`);
        }
      })
      .catch((err) => {
        const errRes: JsonRpcResponse = {
          jsonrpc: '2.0',
          id: parsed.id ?? null,
          error: {
            code: -32603,
            message: err instanceof Error ? err.message : String(err),
          },
        };
        process.stdout.write(`${JSON.stringify(errRes)}\n`);
      });
  });
}

const isMain =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMain) {
  startStdioServer();
}
