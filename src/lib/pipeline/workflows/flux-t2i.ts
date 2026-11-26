import type { GenerateImageParams } from '../../../types/index.js';

export interface FluxT2iWorkflowOptions {
  unetName?: string;
  clipName1?: string;
  clipName2?: string;
  vaeName?: string;
  guidance?: number;
  projectId?: string;
}

/**
 * Workflow FLUX.1-dev GGUF (t2i) validado contra ComfyUI 0.46.2 no host 100.87.104.126.
 * Usa UnetLoaderGGUF + DualCLIPLoader (clip_l + t5xxl_fp8) + FluxGuidance + ae.safetensors.
 */
export function buildFluxGgufT2iWorkflow(
  params: GenerateImageParams,
  options?: FluxT2iWorkflowOptions,
): Record<string, unknown> {
  const unetName = params.model ?? options?.unetName ?? 'flux1-dev-q4_k_m.gguf';
  const clipName1 = options?.clipName1 ?? 'clip_l.safetensors';
  const clipName2 = options?.clipName2 ?? 't5xxl_fp8_e4m3fn.safetensors';
  const vaeName = options?.vaeName ?? 'ae.safetensors';
  const guidance = options?.guidance ?? 3.5;
  const projectId = options?.projectId ?? 'default';

  const width = params.width ?? 1024;
  const height = params.height ?? 1024;
  const batchSize = params.batchSize ?? 1;
  const steps = params.steps ?? 20;
  const seed = params.seed ?? Math.floor(Math.random() * 2_147_483_647);

  return {
    '1': {
      class_type: 'UnetLoaderGGUF',
      inputs: {
        unet_name: unetName,
      },
    },
    '2': {
      class_type: 'DualCLIPLoader',
      inputs: {
        clip_name1: clipName1,
        clip_name2: clipName2,
        type: 'flux',
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: vaeName,
      },
    },
    '4': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: params.prompt,
        clip: ['2', 0],
      },
    },
    '5': {
      class_type: 'FluxGuidance',
      inputs: {
        conditioning: ['4', 0],
        guidance,
      },
    },
    '6': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: params.negativePrompt ?? '',
        clip: ['2', 0],
      },
    },
    '7': {
      class_type: 'EmptySD3LatentImage',
      inputs: {
        width,
        height,
        batch_size: batchSize,
      },
    },
    '8': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: params.cfg ?? 1.0,
        sampler_name: params.sampler ?? 'euler',
        scheduler: params.scheduler ?? 'simple',
        denoise: params.denoise ?? 1.0,
        model: ['1', 0],
        positive: ['5', 0],
        negative: ['6', 0],
        latent_image: ['7', 0],
      },
    },
    '9': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['8', 0],
        vae: ['3', 0],
      },
    },
    '10': {
      class_type: 'SaveImage',
      inputs: {
        filename_prefix: `skill_flux_${projectId}`,
        images: ['9', 0],
      },
    },
  };
}
