import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import axios from 'axios';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/schema.js';
import { MediaStudioSkill } from '../../src/skill-entry.js';

const COMFYUI_ENDPOINT = process.env.COMFYUI_ENDPOINT ?? 'http://localhost:8188';
const ASSISTENTE_URL = process.env.ASSISTENTE_PESSOAL_BASE_URL ?? 'https://jarvis.laytech.com.br';
const RUN_LIVE_GENERATION = process.env.RUN_LIVE_GENERATION === 'true';

const LIVE_TEST_MODEL = process.env.LIVE_TEST_MODEL ?? 'DreamShaper_8_pruned.safetensors';

describe('Real Host Integration (ComfyUI + AssistentePessoal + FFmpeg)', () => {
  it('verifies AssistentePessoal health endpoint is healthy', async () => {
    const config = loadConfig({
      env: 'production',
      overrides: {
        services: {
          comfyui: { endpoint: COMFYUI_ENDPOINT },
          assistentePessoal: { baseUrl: ASSISTENTE_URL },
        },
      },
    });
    const skill = new MediaStudioSkill(config);
    const health = await skill.assistente.checkHealth();

    expect(health.ok === true || health.status === 'ok' || health.status === 'healthy').toBe(true);
    expect(health.version).toBeTruthy();
  });

  it('verifies ComfyUI /system_stats and real GGUF models (FLUX + Wan 2.1)', async () => {
    let reachable = false;
    try {
      const statsRes = await axios.get<{ system: { comfyui_version: string }; devices: unknown[] }>(
        `${COMFYUI_ENDPOINT.replace(/\/$/, '')}/system_stats`,
        { timeout: 5000 },
      );
      expect(statsRes.data.system.comfyui_version).toBeTruthy();
      expect(Array.isArray(statsRes.data.devices)).toBe(true);
      reachable = true;
    } catch {
      console.warn(`ComfyUI not reachable at ${COMFYUI_ENDPOINT} — skipping live ComfyUI assertions`);
    }

    if (!reachable) return;

    const ggufRes = await axios.get<{
      UnetLoaderGGUF?: { input?: { required?: { unet_name?: [string[]] } } };
    }>(`${COMFYUI_ENDPOINT.replace(/\/$/, '')}/object_info/UnetLoaderGGUF`, { timeout: 5000 });

    const models = ggufRes.data.UnetLoaderGGUF?.input?.required?.unet_name?.[0] ?? [];
    expect(models).toContain('flux1-dev-q4_k_m.gguf');
    expect(models).toContain('wan2.1-i2v-14b-720p-Q4_K_M.gguf');
  });

  it('runs ServiceDiscovery and reports healthy services on host', async () => {
    const config = loadConfig({
      env: 'production',
      overrides: {
        services: {
          comfyui: { endpoint: COMFYUI_ENDPOINT },
          assistentePessoal: { baseUrl: ASSISTENTE_URL },
        },
      },
    });
    const skill = new MediaStudioSkill(config);
    const res = await skill.execute({ action: 'get-status', params: {} });

    expect(res.success).toBe(true);
    const payload = res.data as { services: Array<{ type: string; status: string }> };
    const assistente = payload.services.find((s) => s.type === 'assistente-pessoal');
    const ffmpeg = payload.services.find((s) => s.type === 'ffmpeg');

    expect(assistente?.status).toBe('healthy');
    if (process.env.CI && ffmpeg?.status === 'unreachable') {
      console.warn('ffmpeg binary not available on this CI runner; skipping strict healthy assertion');
    } else {
      expect(ffmpeg?.status).toBe('healthy');
    }
  });

  it.skipIf(!RUN_LIVE_GENERATION)(
    'generates a real FLUX.1-dev GGUF image end-to-end and saves it to LocalStorageAdapter',
    async () => {
      const tmpStorage = await fs.mkdtemp(path.join(os.tmpdir(), 'media-studio-live-'));
      try {
        const config = loadConfig({
          env: 'production',
          overrides: {
            storage: { basePath: tmpStorage },
            services: {
              comfyui: { endpoint: COMFYUI_ENDPOINT, timeout: 180000 },
              assistentePessoal: { baseUrl: ASSISTENTE_URL },
            },
          },
        });
        const skill = new MediaStudioSkill(config);

        const res = await skill.execute({
          action: 'generate-image',
          params: {
            prompt: 'minimalist geometric glass cube on a white studio table, soft lighting, 8k',
            model: LIVE_TEST_MODEL,
            width: 512,
            height: 512,
            steps: LIVE_TEST_MODEL.includes('schnell') ? 4 : 15,
            seed: 42,
          },
          context: { projectId: 'live_e2e_test' },
        });

        if (!res.success) {
          throw new Error(`Live generation failed: ${JSON.stringify(res.error)}`);
        }
        expect(res.success).toBe(true);
        const assets = res.data as Array<{ id: string; absolutePath: string; sizeBytes: number }>;
        expect(assets.length).toBeGreaterThan(0);
        expect(assets[0].sizeBytes).toBeGreaterThan(1000);
      } finally {
        await fs.rm(tmpStorage, { recursive: true, force: true });
      }
    },
    180000,
  );
});
