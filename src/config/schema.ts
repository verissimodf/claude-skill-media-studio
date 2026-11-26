import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const SocialPlatformSchema = z.enum([
  'instagram',
  'tiktok',
  'youtube',
  'facebook',
  'linkedin',
]);

export const SkillConfigSchema = z.object({
  skill: z.object({
    name: z.string().min(1),
    version: z.string().min(1),
    description: z.string().default(''),
  }),
  host: z.object({
    dataRoot: z.string().min(1),
    volumes: z.object({
      skill: z.string().min(1),
      comfyuiModels: z.string().min(1),
      comfyuiOutput: z.string().min(1),
      comfyuiInput: z.string().min(1),
      comfyuiCustomNodes: z.string().min(1),
      ffmpegTemp: z.string().min(1),
    }),
  }),
  services: z.object({
    comfyui: z.object({
      endpoint: z.string().url(),
      healthPath: z.string().default('/system_stats'),
      timeout: z.number().int().positive().default(300000),
      maxConcurrent: z.number().int().positive().default(2),
    }),
    assistentePessoal: z.object({
      baseUrl: z.string().url(),
      healthPath: z.string().default('/api/health'),
      timeout: z.number().int().positive().default(30000),
      apiKeyEnv: z.string().default('ASSISTENTE_PESSOAL_API_KEY'),
    }),
    ffmpeg: z.object({
      binary: z.string().default('ffmpeg'),
      tempDir: z.string().min(1),
      preset: z.string().default('medium'),
      crf: z.number().int().min(0).max(51).default(20),
    }),
  }),
  storage: z.object({
    basePath: z.string().min(1),
    maxFileSize: z.number().int().positive().default(2147483648),
    allowedExtensions: z.array(z.string().startsWith('.')).min(1),
    cleanupTempHours: z.number().positive().default(24),
  }),
  pipeline: z.object({
    defaultImageModel: z.string().min(1),
    defaultVideoModel: z.string().min(1),
    defaultWidth: z.number().int().positive().default(1024),
    defaultHeight: z.number().int().positive().default(1024),
    defaultVideoWidth: z.number().int().positive().default(1024),
    defaultVideoHeight: z.number().int().positive().default(576),
    defaultFps: z.number().int().positive().default(8),
    defaultDuration: z.number().positive().default(4),
    defaultSteps: z.number().int().positive().default(25),
    defaultCfg: z.number().positive().default(7),
    defaultSampler: z.string().default('euler_ancestral'),
    defaultScheduler: z.string().default('normal'),
  }),
  social: z.object({
    platforms: z.array(SocialPlatformSchema).min(1),
    defaultAspectRatio: z.string().default('9:16'),
    defaultResolution: z.string().regex(/^\d+x\d+$/).default('1080x1920'),
    maxCaptionLength: z.number().int().positive().default(2200),
  }),
  discovery: z.object({
    scanIntervalMs: z.number().int().positive().default(300000),
    healthCheckIntervalMs: z.number().int().positive().default(60000),
    criticalServices: z.array(z.string()).default(['comfyui', 'assistente-pessoal', 'ffmpeg']),
  }),
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Record<string, unknown>,
): T {
  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value);
    } else if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

function readJsonIfExists(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function parseIntEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseFloatEnv(name: string): number | undefined {
  const raw = process.env[name];
  if (!raw) return undefined;
  const parsed = Number.parseFloat(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export function resolveConfigDir(customDir?: string): string {
  if (customDir) return customDir;
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidateFromSrc = path.resolve(currentDir, '../../config');
  if (fs.existsSync(candidateFromSrc)) return candidateFromSrc;
  return path.resolve(process.cwd(), 'config');
}

export function loadConfig(options?: {
  env?: string;
  configDir?: string;
  overrides?: Record<string, unknown>;
}): SkillConfig {
  const env = options?.env ?? process.env.NODE_ENV ?? 'development';
  const configDir = resolveConfigDir(options?.configDir);

  const defaultCfg = readJsonIfExists(path.join(configDir, 'default.json'));
  const envCfg = readJsonIfExists(path.join(configDir, `${env}.json`));

  let merged = deepMerge(defaultCfg, envCfg);

  const envOverrides: Record<string, unknown> = {
    host: {
      dataRoot: process.env.HOST_DATA_ROOT,
    },
    services: {
      comfyui: {
        endpoint: process.env.COMFYUI_ENDPOINT,
        healthPath: process.env.COMFYUI_HEALTH_PATH,
        timeout: parseIntEnv('COMFYUI_TIMEOUT_MS'),
        maxConcurrent: parseIntEnv('COMFYUI_MAX_CONCURRENT'),
      },
      assistentePessoal: {
        baseUrl: process.env.ASSISTENTE_PESSOAL_BASE_URL,
        timeout: parseIntEnv('ASSISTENTE_PESSOAL_TIMEOUT_MS'),
      },
      ffmpeg: {
        binary: process.env.FFMPEG_BINARY,
        tempDir: process.env.FFMPEG_TEMP_PATH,
        preset: process.env.FFMPEG_PRESET,
        crf: parseIntEnv('FFMPEG_CRF'),
      },
    },
    storage: {
      basePath: process.env.SKILL_DATA_PATH,
      maxFileSize: parseIntEnv('STORAGE_MAX_FILE_SIZE'),
      cleanupTempHours: parseFloatEnv('STORAGE_CLEANUP_TEMP_HOURS'),
    },
    pipeline: {
      defaultImageModel: process.env.DEFAULT_IMAGE_MODEL,
      defaultVideoModel: process.env.DEFAULT_VIDEO_MODEL,
      defaultWidth: parseIntEnv('DEFAULT_WIDTH'),
      defaultHeight: parseIntEnv('DEFAULT_HEIGHT'),
      defaultVideoWidth: parseIntEnv('DEFAULT_VIDEO_WIDTH'),
      defaultVideoHeight: parseIntEnv('DEFAULT_VIDEO_HEIGHT'),
      defaultFps: parseIntEnv('DEFAULT_FPS'),
      defaultDuration: parseFloatEnv('DEFAULT_DURATION'),
      defaultSteps: parseIntEnv('DEFAULT_STEPS'),
      defaultCfg: parseFloatEnv('DEFAULT_CFG'),
      defaultSampler: process.env.DEFAULT_SAMPLER,
      defaultScheduler: process.env.DEFAULT_SCHEDULER,
    },
    social: {
      defaultAspectRatio: process.env.SOCIAL_DEFAULT_ASPECT_RATIO,
      defaultResolution: process.env.SOCIAL_DEFAULT_RESOLUTION,
      maxCaptionLength: parseIntEnv('SOCIAL_MAX_CAPTION_LENGTH'),
    },
    discovery: {
      scanIntervalMs: parseIntEnv('DISCOVERY_SCAN_INTERVAL_MS'),
      healthCheckIntervalMs: parseIntEnv('DISCOVERY_HEALTH_CHECK_INTERVAL_MS'),
    },
  };

  merged = deepMerge(merged, envOverrides);
  if (options?.overrides) {
    merged = deepMerge(merged, options.overrides);
  }

  return SkillConfigSchema.parse(merged);
}
