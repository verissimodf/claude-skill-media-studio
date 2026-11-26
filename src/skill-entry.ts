import { pathToFileURL } from 'node:url';
import { loadConfig, type SkillConfig } from './config/schema.js';
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
          data = await this.orchestrator.generateImage(
            params as unknown as GenerateImageParams,
            request.context,
          );
          break;
        }
        case 'generate-video': {
          data = await this.orchestrator.generateVideo(
            params as unknown as GenerateVideoParams,
            request.context,
          );
          break;
        }
        case 'assemble-video': {
          data = await this.orchestrator.assembleVideo(
            params as unknown as AssembleVideoParams,
            request.context,
          );
          break;
        }
        case 'publish': {
          data = await this.orchestrator.publish(params as unknown as PublishParams);
          break;
        }
        case 'list-assets': {
          data = await this.storage.listAssets(params as ListAssetsFilter);
          break;
        }
        case 'get-asset': {
          const id = String(params.assetId ?? '');
          if (!id) throw new Error('assetId is required');
          data = await this.storage.getAsset(id);
          break;
        }
        case 'delete-asset': {
          const id = String(params.assetId ?? '');
          if (!id) throw new Error('assetId is required');
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
