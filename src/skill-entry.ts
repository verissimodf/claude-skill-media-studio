import { pathToFileURL } from 'node:url';
import { z } from 'zod';
import { loadConfig, SocialPlatformSchema, type SkillConfig } from './config/schema.js';
import { AssistentePessoalClient } from './lib/assistente-pessoal-client.js';
import { PipelineOrchestrator } from './lib/pipeline/orchestrator.js';
import { ServiceDiscovery } from './lib/service-discovery.js';
import { LocalStorageAdapter, type ListAssetsFilter } from './lib/storage-adapter.js';
import type {
  AssembleVideoParams,
  GenerateImageParams,
  GenerateVideoParams,
  PublishParams,
  SkillRequest,
  SkillResponse,
} from './types/index.js';

const SafePromptSchema = z
  .string()
  .min(1)
  .max(4000)
  .refine((v) => !v.includes('\0'), 'Null bytes are not allowed in prompt');

const GenerateImageParamsSchema = z.object({
  prompt: SafePromptSchema,
  negativePrompt: z.string().max(2000).optional(),
  model: z.string().min(1).max(255).optional(),
  width: z.number().int().min(64).max(4096).optional(),
  height: z.number().int().min(64).max(4096).optional(),
  steps: z.number().int().min(1).max(150).optional(),
  cfg: z.number().min(0.1).max(30).optional(),
  seed: z.number().int().min(0).optional(),
  batchSize: z.number().int().min(1).max(8).optional(),
  sampler: z.string().min(1).max(64).optional(),
  scheduler: z.string().min(1).max(64).optional(),
  inputAssetId: z.string().min(1).max(128).optional(),
  denoise: z.number().min(0).max(1).optional(),
  workflow: z.record(z.string(), z.unknown()).optional(),
});

const GenerateVideoParamsSchema = z.object({
  prompt: SafePromptSchema,
  negativePrompt: z.string().max(2000).optional(),
  model: z.string().min(1).max(255).optional(),
  inputAssetId: z.string().min(1).max(128).optional(),
  width: z.number().int().min(64).max(2048).optional(),
  height: z.number().int().min(64).max(2048).optional(),
  fps: z.number().int().min(1).max(60).optional(),
  duration: z.number().min(0.5).max(30).optional(),
  steps: z.number().int().min(1).max(150).optional(),
  cfg: z.number().min(0.1).max(30).optional(),
  seed: z.number().int().min(0).optional(),
  sampler: z.string().min(1).max(64).optional(),
  scheduler: z.string().min(1).max(64).optional(),
  workflow: z.record(z.string(), z.unknown()).optional(),
});

const AssembleVideoParamsSchema = z.object({
  type: z.enum(['shorts', 'reels', 'tiktok', 'standard']).optional(),
  clips: z
    .array(
      z.object({
        assetId: z.string().min(1).max(128),
        startSec: z.number().min(0).optional(),
        durationSec: z.number().positive().optional(),
      }),
    )
    .min(1)
    .max(50),
  aspectRatio: z.string().regex(/^\d+:\d+$/).optional(),
  resolution: z.string().regex(/^\d+x\d+$/).optional(),
  fps: z.number().int().min(1).max(60).optional(),
  audioAssetId: z.string().min(1).max(128).optional(),
  subtitleText: z.string().max(4000).optional(),
  outputFilename: z.string().min(1).max(128).optional(),
});

const PublishParamsSchema = z.object({
  assetId: z.string().min(1).max(128),
  platforms: z.array(SocialPlatformSchema).min(1),
  caption: z.string().min(1).max(4000),
  hashtags: z.array(z.string().min(1).max(64)).max(30).optional(),
  scheduledAt: z.string().datetime().optional(),
  title: z.string().max(200).optional(),
});

export class MediaStudioSkill {
  readonly config: SkillConfig;
  readonly discovery: ServiceDiscovery;
  readonly storage: LocalStorageAdapter;
  readonly assistente: AssistentePessoalClient;
  readonly orchestrator: PipelineOrchestrator;

  constructor(config?: SkillConfig) {
    this.config = config ?? loadConfig();
    this.discovery = new ServiceDiscovery(this.config);
    this.storage = new LocalStorageAdapter(this.config.storage);
    this.assistente = new AssistentePessoalClient(this.config);
    this.orchestrator = new PipelineOrchestrator(this.config, this.storage, this.assistente);
  }

  async execute<TParams = Record<string, unknown>>(
    request: SkillRequest<TParams>,
  ): Promise<SkillResponse> {
    const startedAt = Date.now();
    const params = (request.params ?? {}) as Record<string, unknown>;

    try {
      let data: unknown;

      switch (request.action) {
        case 'discover': {
          data = await this.discovery.scan(Boolean(params.force));
          break;
        }
        case 'get-status': {
          const scan = await this.discovery.scan(false);
          data = {
            skill: this.config.skill,
            summary: scan.summary,
            services: scan.services.map((s) => ({
              id: s.id,
              type: s.type,
              name: s.name,
              status: s.status,
              endpoint: s.endpoint,
            })),
          };
          break;
        }
        case 'generate-image': {
          const validated = GenerateImageParamsSchema.parse(params);
          data = await this.orchestrator.generateImage(
            validated as GenerateImageParams,
            request.context,
          );
          break;
        }
        case 'generate-video': {
          const validated = GenerateVideoParamsSchema.parse(params);
          data = await this.orchestrator.generateVideo(
            validated as GenerateVideoParams,
            request.context,
          );
          break;
        }
        case 'assemble-video': {
          const validated = AssembleVideoParamsSchema.parse(params);
          data = await this.orchestrator.assembleVideo(
            validated as AssembleVideoParams,
            request.context,
          );
          break;
        }
        case 'publish': {
          const validated = PublishParamsSchema.parse(params);
          data = await this.orchestrator.publish(validated as PublishParams);
          break;
        }
        case 'list-assets': {
          data = await this.storage.listAssets(params as ListAssetsFilter);
          break;
        }
        case 'get-asset': {
          const id = z.string().min(1).max(128).parse(params.assetId);
          data = await this.storage.getAsset(id);
          break;
        }
        case 'delete-asset': {
          const id = z.string().min(1).max(128).parse(params.assetId);
          data = { deleted: await this.storage.deleteAsset(id) };
          break;
        }
        case 'cleanup-temp': {
          const hours =
            typeof params.maxAgeHours === 'number' ? params.maxAgeHours : undefined;
          data = await this.storage.cleanupTemp(hours);
          break;
        }
        default: {
          throw new Error(`Unsupported action: ${String(request.action)}`);
        }
      }

      return {
        success: true,
        action: request.action,
        data,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (err) {
      return {
        success: false,
        action: request.action,
        error: {
          code: 'SKILL_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    }
  }
}

export const skill = new MediaStudioSkill();

export async function handleSkillRequest<TParams = Record<string, unknown>>(
  request: SkillRequest<TParams>,
): Promise<SkillResponse> {
  return skill.execute(request);
}

export * from './lib/index.js';

async function runCli(): Promise<void> {
  const rawArg = process.argv[2];
  if (!rawArg) {
    console.error(
      'Uso: node dist/skill-entry.js \'{"action":"discover","params":{}}\'',
    );
    process.exit(1);
  }

  const parsed = JSON.parse(rawArg) as SkillRequest;
  const response = await handleSkillRequest(parsed);
  console.log(JSON.stringify(response, null, 2));
  process.exit(response.success ? 0 : 1);
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  runCli().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
