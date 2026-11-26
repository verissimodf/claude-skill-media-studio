import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/schema.js';
import { AssistentePessoalClient } from '../../src/lib/assistente-pessoal-client.js';
import { PipelineOrchestrator } from '../../src/lib/pipeline/orchestrator.js';
import { LocalStorageAdapter } from '../../src/lib/storage-adapter.js';

describe('PipelineOrchestrator', () => {
  const config = loadConfig({ env: 'development' });
  const storage = new LocalStorageAdapter(config.storage);
  const assistente = new AssistentePessoalClient(config);
  const orchestrator = new PipelineOrchestrator(config, storage, assistente);

  it('builds a valid default SDXL t2i ComfyUI workflow', () => {
    const wf = orchestrator.buildImageWorkflow(
      {
        prompt: 'cyberpunk cityscape at night',
        width: 768,
        height: 1024,
        steps: 20,
        seed: 42,
      },
      'proj_alpha',
    );

    const positiveNode = wf['2'] as { inputs: { text: string } };
    const latentNode = wf['4'] as { inputs: { width: number; height: number } };
    const samplerNode = wf['5'] as { inputs: { seed: number; steps: number } };
    const saveNode = wf['7'] as { inputs: { filename_prefix: string } };

    expect(positiveNode.inputs.text).toBe('cyberpunk cityscape at night');
    expect(latentNode.inputs.width).toBe(768);
    expect(latentNode.inputs.height).toBe(1024);
    expect(samplerNode.inputs.seed).toBe(42);
    expect(samplerNode.inputs.steps).toBe(20);
    expect(saveNode.inputs.filename_prefix).toBe('skill_proj_alpha');
  });

  it('builds a FLUX.1-dev GGUF workflow when .gguf model is selected', () => {
    const wf = orchestrator.buildImageWorkflow(
      {
        prompt: 'studio portrait, dramatic rim light',
        model: 'flux1-dev-q4_k_m.gguf',
        width: 512,
        height: 512,
        steps: 12,
        seed: 123,
      },
      'proj_flux',
    );

    const unetNode = wf['1'] as { class_type: string; inputs: { unet_name: string } };
    const guidanceNode = wf['5'] as { class_type: string; inputs: { guidance: number } };
    const saveNode = wf['10'] as { inputs: { filename_prefix: string } };

    expect(unetNode.class_type).toBe('UnetLoaderGGUF');
    expect(unetNode.inputs.unet_name).toBe('flux1-dev-q4_k_m.gguf');
    expect(guidanceNode.class_type).toBe('FluxGuidance');
    expect(guidanceNode.inputs.guidance).toBe(3.5);
    expect(saveNode.inputs.filename_prefix).toBe('skill_flux_proj_flux');
  });

  it('builds a Wan 2.1 I2V GGUF workflow when wan model and input image are provided', () => {
    const wf = orchestrator.buildVideoWorkflow(
      {
        prompt: 'slow cinematic push-in, gentle wind',
        model: 'wan2.1-i2v-14b-720p-Q4_K_M.gguf',
        width: 832,
        height: 480,
        fps: 16,
        duration: 2,
        seed: 7,
      },
      'frame_01.png',
      'proj_wan',
    );

    const unetNode = wf['1'] as { class_type: string; inputs: { unet_name: string } };
    const loadNode = wf['5'] as { class_type: string; inputs: { image: string } };
    const wanNode = wf['9'] as { class_type: string; inputs: { length: number } };
    const combineNode = wf['12'] as { class_type: string; inputs: { format: string; frame_rate: number } };

    expect(unetNode.class_type).toBe('UnetLoaderGGUF');
    expect(unetNode.inputs.unet_name).toBe('wan2.1-i2v-14b-720p-Q4_K_M.gguf');
    expect(loadNode.class_type).toBe('LoadImage');
    expect(loadNode.inputs.image).toBe('frame_01.png');
    expect(wanNode.class_type).toBe('WanImageToVideo');
    expect((wanNode.inputs.length - 1) % 4).toBe(0);
    expect(combineNode.class_type).toBe('VHS_VideoCombine');
    expect(combineNode.inputs.format).toBe('video/h264-mp4');
    expect(combineNode.inputs.frame_rate).toBe(16);
  });
});
