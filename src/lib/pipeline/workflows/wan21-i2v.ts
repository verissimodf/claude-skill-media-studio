import type { GenerateVideoParams } from '../../../types/index.js';

export interface Wan21I2vWorkflowOptions {
  unetName?: string;
  clipName?: string;
  clipVisionName?: string;
  vaeName?: string;
  inputImageFilename: string;
  projectId?: string;
}

/**
 * Workflow Wan 2.1 I2V 14B 720p GGUF (i2v) validado contra ComfyUI 0.46.2 no host 100.87.104.126.
 * Usa UnetLoaderGGUF + CLIPLoader (umt5_xxl) + CLIPVisionLoader (clip_vision_h)
 * + WanImageToVideo + wan_2.1_vae + VHS_VideoCombine (h264-mp4).
 */
export function buildWan21I2vWorkflow(
  params: GenerateVideoParams,
  options: Wan21I2vWorkflowOptions,
): Record<string, unknown> {
  const unetName = params.model ?? options.unetName ?? 'wan2.1-i2v-14b-720p-Q4_K_M.gguf';
  const clipName = options.clipName ?? 'umt5_xxl_fp8_e4m3fn_scaled.safetensors';
  const clipVisionName = options.clipVisionName ?? 'clip_vision_h.safetensors';
  const vaeName = options.vaeName ?? 'wan_2.1_vae.safetensors';
  const projectId = options.projectId ?? 'default';

  const width = params.width ?? 832;
  const height = params.height ?? 480;
  const fps = params.fps ?? 16;
  const duration = params.duration ?? 3;
  // WanImageToVideo expects length = 4*k + 1 (e.g. 17, 33, 49, 81)
  const rawFrames = Math.max(17, Math.round(duration * fps));
  const length = Math.floor((rawFrames - 1) / 4) * 4 + 1;
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
      class_type: 'CLIPLoader',
      inputs: {
        clip_name: clipName,
        type: 'wan',
      },
    },
    '3': {
      class_type: 'VAELoader',
      inputs: {
        vae_name: vaeName,
      },
    },
    '4': {
      class_type: 'CLIPVisionLoader',
      inputs: {
        clip_name: clipVisionName,
      },
    },
    '5': {
      class_type: 'LoadImage',
      inputs: {
        image: options.inputImageFilename,
      },
    },
    '6': {
      class_type: 'CLIPVisionEncode',
      inputs: {
        clip_vision: ['4', 0],
        image: ['5', 0],
        crop: 'center',
      },
    },
    '7': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text: params.prompt,
        clip: ['2', 0],
      },
    },
    '8': {
      class_type: 'CLIPTextEncode',
      inputs: {
        text:
          params.negativePrompt ??
          'blurry, static, distorted, low quality, watermark, text, artifacts',
        clip: ['2', 0],
      },
    },
    '9': {
      class_type: 'WanImageToVideo',
      inputs: {
        positive: ['7', 0],
        negative: ['8', 0],
        vae: ['3', 0],
        clip_vision_output: ['6', 0],
        start_image: ['5', 0],
        width,
        height,
        length,
        batch_size: 1,
      },
    },
    '10': {
      class_type: 'KSampler',
      inputs: {
        seed,
        steps,
        cfg: params.cfg ?? 6.0,
        sampler_name: params.sampler ?? 'uni_pc',
        scheduler: params.scheduler ?? 'simple',
        denoise: 1.0,
        model: ['1', 0],
        positive: ['9', 0],
        negative: ['9', 1],
        latent_image: ['9', 2],
      },
    },
    '11': {
      class_type: 'VAEDecode',
      inputs: {
        samples: ['10', 0],
        vae: ['3', 0],
      },
    },
    '12': {
      class_type: 'VHS_VideoCombine',
      inputs: {
        images: ['11', 0],
        frame_rate: fps,
        loop_count: 0,
        filename_prefix: `skill_wan21_${projectId}`,
        format: 'video/h264-mp4',
        pix_fmt: 'yuv420p',
        crf: 19,
        save_metadata: true,
        trim_to_audio: false,
        pingpong: false,
        save_output: true,
      },
    },
  };
}
