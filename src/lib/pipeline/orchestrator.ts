import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { SkillConfig } from '../../config/schema.js';
import type {
  AssembleVideoParams,
  AssistentePublishResult,
  GenerateImageParams,
  GenerateVideoParams,
  MediaAsset,
  PublishParams,
  SkillContext,
} from '../../types/index.js';
import type { AssistentePessoalClient } from '../assistente-pessoal-client.js';
import type { LocalStorageAdapter } from '../storage-adapter.js';
import { buildFluxGgufT2iWorkflow } from './workflows/flux-t2i.js';
import { buildWan21I2vWorkflow } from './workflows/wan21-i2v.js';

const execFileAsync = promisify(execFile);

interface ComfyPromptResponse {
  prompt_id: string;
}

interface ComfyHistoryOutputItem {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface ComfyHistoryEntry {
  status?: {
    completed?: boolean;
    status_str?: string;
    messages?: Array<[string, Record<string, unknown>]>;
  };
  outputs?: Record<
    string,
    {
      images?: ComfyHistoryOutputItem[];
      gifs?: ComfyHistoryOutputItem[];
      videos?: ComfyHistoryOutputItem[];
    }
  >;
}

export class PipelineOrchestrator {
  private readonly config: SkillConfig;
  private readonly storage: LocalStorageAdapter;
  private readonly assistente: AssistentePessoalClient;
  private readonly comfyHttp: AxiosInstance;

  constructor(
    config: SkillConfig,
    storage: LocalStorageAdapter,
    assistente: AssistentePessoalClient,
  ) {
    this.config = config;
    this.storage = storage;
    this.assistente = assistente;
    this.comfyHttp = axios.create({
      baseURL: config.services.comfyui.endpoint.replace(/\/$/, ''),
      timeout: config.services.comfyui.timeout,
    });
  }

  buildImageWorkflow(params: GenerateImageParams, projectId = 'default'): Record<string, unknown> {
    if (params.workflow) return params.workflow;

    const p = this.config.pipeline;
    const model = params.model ?? p.defaultImageModel;
    if (model.toLowerCase().endsWith('.gguf') || model.toLowerCase().includes('flux')) {
      return buildFluxGgufT2iWorkflow({ ...params, model }, { projectId });
    }

    const seed = params.seed ?? Math.floor(Math.random() * 2_147_483_647);

    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: model },
      },
      '2': {
        class_type: 'CLIPTextEncode',
        inputs: { text: params.prompt, clip: ['1', 1] },
      },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: { text: params.negativePrompt ?? 'blurry, low quality, distorted', clip: ['1', 1] },
      },
      '4': {
        class_type: 'EmptyLatentImage',
        inputs: {
          width: params.width ?? p.defaultWidth,
          height: params.height ?? p.defaultHeight,
          batch_size: params.batchSize ?? 1,
        },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: params.steps ?? p.defaultSteps,
          cfg: params.cfg ?? p.defaultCfg,
          sampler_name: params.sampler ?? p.defaultSampler,
          scheduler: params.scheduler ?? p.defaultScheduler,
          denoise: params.denoise ?? 1,
          model: ['1', 0],
          positive: ['2', 0],
          negative: ['3', 0],
          latent_image: ['4', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: { samples: ['5', 0], vae: ['1', 2] },
      },
      '7': {
        class_type: 'SaveImage',
        inputs: { filename_prefix: `skill_${projectId}`, images: ['6', 0] },
      },
    };
  }

  buildVideoWorkflow(
    params: GenerateVideoParams,
    inputFilename?: string,
    projectId = 'default',
  ): Record<string, unknown> {
    if (params.workflow) return params.workflow;

    const p = this.config.pipeline;
    const model = params.model ?? p.defaultVideoModel;
    if (
      inputFilename &&
      (model.toLowerCase().includes('wan') || model.toLowerCase().endsWith('.gguf'))
    ) {
      return buildWan21I2vWorkflow(
        { ...params, model },
        { inputImageFilename: inputFilename, projectId },
      );
    }

    const seed = params.seed ?? Math.floor(Math.random() * 2_147_483_647);

    return {
      '1': {
        class_type: 'CheckpointLoaderSimple',
        inputs: { ckpt_name: model },
      },
      '2': inputFilename
        ? {
            class_type: 'LoadImage',
            inputs: { image: inputFilename },
          }
        : {
            class_type: 'EmptyLatentImage',
            inputs: {
              width: params.width ?? p.defaultVideoWidth,
              height: params.height ?? p.defaultVideoHeight,
              batch_size: Math.max(1, Math.round((params.duration ?? p.defaultDuration) * (params.fps ?? p.defaultFps))),
            },
          },
      '3': {
        class_type: 'CLIPTextEncode',
        inputs: { text: params.prompt, clip: ['1', 1] },
      },
      '4': {
        class_type: 'CLIPTextEncode',
        inputs: { text: params.negativePrompt ?? 'flicker, artifacts, low quality', clip: ['1', 1] },
      },
      '5': {
        class_type: 'KSampler',
        inputs: {
          seed,
          steps: params.steps ?? p.defaultSteps,
          cfg: params.cfg ?? p.defaultCfg,
          sampler_name: params.sampler ?? p.defaultSampler,
          scheduler: params.scheduler ?? p.defaultScheduler,
          denoise: 1,
          model: ['1', 0],
          positive: ['3', 0],
          negative: ['4', 0],
          latent_image: ['2', 0],
        },
      },
      '6': {
        class_type: 'VAEDecode',
        inputs: { samples: ['5', 0], vae: ['1', 2] },
      },
      '7': {
        class_type: 'SaveVideo',
        inputs: {
          filename_prefix: `skill_vid_${projectId}`,
          fps: params.fps ?? p.defaultFps,
          images: ['6', 0],
        },
      },
    };
  }

  async generateImage(
    params: GenerateImageParams,
    context?: SkillContext,
  ): Promise<MediaAsset[]> {
    const workflow = this.buildImageWorkflow(params, context?.projectId);
    const outputs = await this.executeComfyWorkflow(workflow);
    const saved: MediaAsset[] = [];

    for (const item of outputs) {
      const buffer = await this.downloadComfyOutput(item);
      const asset = await this.storage.saveAsset({
        buffer,
        filename: item.filename,
        category: 'gallery',
        projectId: context?.projectId,
        userId: context?.userId,
        tags: ['comfyui', 'image', params.inputAssetId ? 'i2i' : 't2i'],
        metadata: { prompt: params.prompt, model: params.model ?? this.config.pipeline.defaultImageModel },
      });
      saved.push(asset);
    }

    return saved;
  }

  async uploadImageToComfyUI(asset: MediaAsset): Promise<string> {
    const form = new FormData();
    form.append('image', fsSync.createReadStream(asset.absolutePath), {
      filename: asset.filename,
      contentType: asset.mimeType,
    });
    form.append('overwrite', 'true');
    const response = await this.comfyHttp.post<{ name: string }>('/upload/image', form, {
      headers: form.getHeaders(),
    });
    return response.data.name;
  }

  async generateVideo(
    params: GenerateVideoParams,
    context?: SkillContext,
  ): Promise<MediaAsset[]> {
    let inputFilename: string | undefined;
    if (params.inputAssetId) {
      const inputAsset = await this.storage.getAsset(params.inputAssetId);
      if (!inputAsset) {
        throw new Error(`Input asset not found: ${params.inputAssetId}`);
      }
      inputFilename = await this.uploadImageToComfyUI(inputAsset);
    }

    const workflow = this.buildVideoWorkflow(params, inputFilename, context?.projectId);
    const outputs = await this.executeComfyWorkflow(workflow);
    const saved: MediaAsset[] = [];

    for (const item of outputs) {
      const buffer = await this.downloadComfyOutput(item);
      const asset = await this.storage.saveAsset({
        buffer,
        filename: item.filename,
        category: 'gallery',
        projectId: context?.projectId,
        userId: context?.userId,
        tags: ['comfyui', 'video', inputFilename ? 'i2v' : 't2v'],
        metadata: {
          prompt: params.prompt,
          model: params.model ?? this.config.pipeline.defaultVideoModel,
          fps: params.fps ?? this.config.pipeline.defaultFps,
          duration: params.duration ?? this.config.pipeline.defaultDuration,
        },
      });
      saved.push(asset);
    }

    return saved;
  }

  async assembleVideo(
    params: AssembleVideoParams,
    context?: SkillContext,
  ): Promise<MediaAsset> {
    if (!params.clips || params.clips.length === 0) {
      throw new Error('At least one clip is required to assemble video');
    }

    const clipAssets: MediaAsset[] = [];
    for (const clip of params.clips) {
      const asset = await this.storage.getAsset(clip.assetId);
      if (!asset) {
        throw new Error(`Clip asset not found: ${clip.assetId}`);
      }
      clipAssets.push(asset);
    }

    const tempDir = this.config.services.ffmpeg.tempDir;
    await fs.mkdir(tempDir, { recursive: true });

    const jobId = crypto.randomBytes(6).toString('hex');
    const concatListPath = path.join(tempDir, `concat_${jobId}.txt`);
    const outputFile = path.join(tempDir, params.outputFilename ?? `assembled_${jobId}.mp4`);

    const concatLines = clipAssets.map(
      (a) => `file '${a.absolutePath.replace(/'/g, "'\\''")}'`,
    );
    await fs.writeFile(concatListPath, concatLines.join('\n'), 'utf-8');

    const resolution = params.resolution ?? this.config.social.defaultResolution;
    const [width, height] = resolution.split('x');
    const vf = `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`;

    const args = [
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatListPath,
      '-vf',
      vf,
      '-c:v',
      'libx264',
      '-preset',
      this.config.services.ffmpeg.preset,
      '-crf',
      String(this.config.services.ffmpeg.crf),
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      '-y',
      outputFile,
    ];

    try {
      await execFileAsync(this.config.services.ffmpeg.binary, args, {
        timeout: 300000,
      });

      return await this.storage.saveAsset({
        sourcePath: outputFile,
        filename: path.basename(outputFile),
        category: 'projects',
        projectId: context?.projectId,
        userId: context?.userId,
        tags: ['ffmpeg', params.type ?? 'shorts', params.aspectRatio ?? this.config.social.defaultAspectRatio],
        metadata: {
          clips: params.clips,
          resolution,
          aspectRatio: params.aspectRatio ?? this.config.social.defaultAspectRatio,
        },
      });
    } finally {
      await fs.unlink(concatListPath).catch(() => undefined);
      await fs.unlink(outputFile).catch(() => undefined);
    }
  }

  async publish(params: PublishParams): Promise<AssistentePublishResult> {
    const asset = await this.storage.getAsset(params.assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${params.assetId}`);
    }
    return this.assistente.publishSocial(asset, params);
  }

  private async executeComfyWorkflow(
    workflow: Record<string, unknown>,
  ): Promise<ComfyHistoryOutputItem[]> {
    const clientId = `skill_${crypto.randomBytes(4).toString('hex')}`;
    const queueRes = await this.comfyHttp.post<ComfyPromptResponse>('/prompt', {
      prompt: workflow,
      client_id: clientId,
    });
    const promptId = queueRes.data.prompt_id;

    const deadline = Date.now() + this.config.services.comfyui.timeout;
    while (Date.now() < deadline) {
      const historyRes = await this.comfyHttp.get<Record<string, ComfyHistoryEntry>>(
        `/history/${promptId}`,
      );
      const entry = historyRes.data[promptId];
      if (entry?.status?.status_str === 'error') {
        const errMsg = entry.status.messages?.find(([kind]) => kind === 'execution_error')?.[1];
        const detail = errMsg
          ? `${String(errMsg.node_type ?? 'node')}: ${String(errMsg.exception_message ?? 'unknown error').trim()}`
          : 'ComfyUI execution_error';
        throw new Error(`ComfyUI workflow failed (prompt_id=${promptId}): ${detail}`);
      }
      if (entry?.outputs) {
        const items: ComfyHistoryOutputItem[] = [];
        for (const nodeOut of Object.values(entry.outputs)) {
          if (nodeOut.images) items.push(...nodeOut.images);
          if (nodeOut.videos) items.push(...nodeOut.videos);
          if (nodeOut.gifs) items.push(...nodeOut.gifs);
        }
        if (items.length > 0 || entry.status?.completed) {
          return items;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new Error(`ComfyUI workflow timed out for prompt_id=${promptId}`);
  }

  private async downloadComfyOutput(item: ComfyHistoryOutputItem): Promise<Buffer> {
    const response = await this.comfyHttp.get<ArrayBuffer>('/view', {
      params: {
        filename: item.filename,
        subfolder: item.subfolder ?? '',
        type: item.type ?? 'output',
      },
      responseType: 'arraybuffer',
    });
    return Buffer.from(response.data);
  }
}
