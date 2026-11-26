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

  it('builds a valid default t2i ComfyUI workflow', () => {
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

  it('builds a valid i2v ComfyUI workflow when input filename is provided', () => {
    const wf = orchestrator.buildVideoWorkflow(
      { prompt: 'slow camera zoom', fps: 12, duration: 3, seed: 7 },
      'frame_01.png',
      'proj_vid',
    );

    const loadNode = wf['2'] as { class_type: string; inputs: { image: string } };
    const saveNode = wf['7'] as { inputs: { fps: number; filename_prefix: string } };

    expect(loadNode.class_type).toBe('LoadImage');
    expect(loadNode.inputs.image).toBe('frame_01.png');
    expect(saveNode.inputs.fps).toBe(12);
    expect(saveNode.inputs.filename_prefix).toBe('skill_vid_proj_vid');
  });
});
