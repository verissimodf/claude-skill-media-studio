import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import axios from 'axios';
import type { SkillConfig } from '../config/schema.js';
import type {
  DiscoveredService,
  DiscoveredVolume,
  HostScanResult,
  ServiceType,
} from '../types/index.js';

const execFileAsync = promisify(execFile);

export interface ServiceDiscoveryOptions {
  scriptPath?: string;
  preferNativeProbe?: boolean;
}

export class ServiceDiscovery {
  private readonly config: SkillConfig;
  private readonly scriptPath: string;
  private readonly preferNativeProbe: boolean;
  private lastScan: HostScanResult | null = null;

  constructor(config: SkillConfig, options?: ServiceDiscoveryOptions) {
    this.config = config;
    this.scriptPath =
      options?.scriptPath ?? path.resolve(process.cwd(), 'scripts/host-scan.sh');
    this.preferNativeProbe = options?.preferNativeProbe ?? process.platform === 'win32';
  }

  async scan(force = false): Promise<HostScanResult> {
    if (!force && this.lastScan) {
      const ageMs = Date.now() - Date.parse(this.lastScan.scannedAt);
      if (ageMs < this.config.discovery.scanIntervalMs) {
        return this.lastScan;
      }
    }

    if (!this.preferNativeProbe && fs.existsSync(this.scriptPath)) {
      try {
        const result = await this.scanViaScript();
        this.lastScan = result;
        return result;
      } catch {
        // Fallback to native Node/HTTP discovery if bash/jq is unavailable
      }
    }

    const result = await this.scanNative();
    this.lastScan = result;
    return result;
  }

  private async scanViaScript(): Promise<HostScanResult> {
    const { stdout } = await execFileAsync('bash', [this.scriptPath, '--json'], {
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
    return JSON.parse(stdout) as HostScanResult;
  }

  async scanNative(): Promise<HostScanResult> {
    const startedAt = Date.now();
    const scannedAt = new Date(startedAt).toISOString();

    const [comfyui, assistente, ffmpeg, volumes] = await Promise.all([
      this.probeComfyUI(scannedAt),
      this.probeAssistentePessoal(scannedAt),
      this.probeBinary(
        this.config.services.ffmpeg.binary,
        'ffmpeg',
        ['video-assembly', 'transcode', 'thumbnail', 'concat'],
        scannedAt,
      ),
      Promise.resolve(this.probeExpectedVolumes(scannedAt)),
    ]);

    const services: DiscoveredService[] = [comfyui, assistente, ffmpeg];
    const summary = {
      totalServices: services.length,
      healthyServices: services.filter((s) => s.status === 'healthy').length,
      degradedServices: services.filter((s) => s.status === 'degraded').length,
      unreachableServices: services.filter((s) => s.status === 'unreachable').length,
      totalVolumes: volumes.length,
      expectedVolumesExist: volumes.filter((v) => v.type === 'expected' && v.exists).length,
      expectedVolumesMissing: volumes.filter((v) => v.type === 'expected' && !v.exists).length,
    };

    return {
      hostname: os.hostname(),
      user: os.userInfo().username,
      scannedAt,
      scanDurationMs: Date.now() - startedAt,
      services,
      volumes,
      network: {
        internet: assistente.status === 'unreachable' ? 'unreachable' : 'reachable',
      },
      summary,
    };
  }

  private async probeComfyUI(timestamp: string): Promise<DiscoveredService> {
    const endpoint = this.config.services.comfyui.endpoint.replace(/\/$/, '');
    const healthEndpoint = `${endpoint}${this.config.services.comfyui.healthPath}`;
    try {
      const response = await axios.get<Record<string, unknown>>(healthEndpoint, {
        timeout: 5000,
      });
      return {
        id: 'native-comfyui',
        type: 'comfyui',
        name: 'ComfyUI',
        endpoint,
        healthEndpoint,
        capabilities: ['t2i', 'i2i', 't2v', 'i2v', 'controlnet', 'lora', 'upscale', 'inpainting'],
        status: 'healthy',
        metadata: { healthCheck: response.data },
        discoveredAt: timestamp,
      };
    } catch (err) {
      return {
        id: 'native-comfyui',
        type: 'comfyui',
        name: 'ComfyUI',
        endpoint,
        healthEndpoint,
        capabilities: [],
        status: 'unreachable',
        metadata: { error: err instanceof Error ? err.message : String(err) },
        discoveredAt: timestamp,
      };
    }
  }

  private async probeAssistentePessoal(timestamp: string): Promise<DiscoveredService> {
    const baseUrl = this.config.services.assistentePessoal.baseUrl.replace(/\/$/, '');
    const healthEndpoint = `${baseUrl}${this.config.services.assistentePessoal.healthPath}`;
    try {
      const response = await axios.get<{ status?: string; version?: string }>(healthEndpoint, {
        timeout: 8000,
      });
      const rawStatus = response.data?.status ?? 'unknown';
      const isHealthy = rawStatus === 'ok' || rawStatus === 'healthy';
      return {
        id: 'assistente-pessoal-jarvis',
        type: 'assistente-pessoal',
        name: `AssistentePessoal (${baseUrl})`,
        endpoint: baseUrl,
        healthEndpoint,
        capabilities: [
          'orchestration',
          'scheduling',
          'context',
          'notifications',
          'webhooks',
          'social-media',
          'api-gateway',
        ],
        status: isHealthy ? 'healthy' : 'degraded',
        metadata: {
          status: rawStatus,
          version: response.data?.version ?? 'unknown',
          response: response.data,
        },
        discoveredAt: timestamp,
      };
    } catch (err) {
      return {
        id: 'assistente-pessoal-jarvis',
        type: 'assistente-pessoal',
        name: `AssistentePessoal (${baseUrl})`,
        endpoint: baseUrl,
        healthEndpoint,
        capabilities: [],
        status: 'unreachable',
        metadata: { error: err instanceof Error ? err.message : String(err) },
        discoveredAt: timestamp,
      };
    }
  }

  private async probeBinary(
    binary: string,
    type: ServiceType,
    capabilities: string[],
    timestamp: string,
  ): Promise<DiscoveredService> {
    try {
      const { stdout } = await execFileAsync(binary, ['-version'], { timeout: 5000 });
      const firstLine = stdout.split(/\r?\n/)[0]?.trim() || 'installed';
      return {
        id: `binary-${binary}`,
        type,
        name: binary,
        endpoint: 'local-binary',
        capabilities,
        status: 'healthy',
        metadata: { version: firstLine },
        discoveredAt: timestamp,
      };
    } catch (err) {
      return {
        id: `binary-${binary}`,
        type,
        name: binary,
        endpoint: 'missing',
        capabilities: [],
        status: 'unreachable',
        metadata: { error: err instanceof Error ? err.message : String(err) },
        discoveredAt: timestamp,
      };
    }
  }

  private probeExpectedVolumes(timestamp: string): DiscoveredVolume[] {
    const root = this.config.host.dataRoot;
    const entries: Array<[string, string]> = [
      ['skill-data', this.config.storage.basePath],
      ['comfyui-models', path.join(root, this.config.host.volumes.comfyuiModels)],
      ['comfyui-output', path.join(root, this.config.host.volumes.comfyuiOutput)],
      ['comfyui-input', path.join(root, this.config.host.volumes.comfyuiInput)],
      ['ffmpeg-temp', this.config.services.ffmpeg.tempDir],
    ];

    return entries.map(([label, dirPath]) => ({
      label,
      path: dirPath,
      exists: fs.existsSync(dirPath),
      type: 'expected' as const,
      discoveredAt: timestamp,
    }));
  }

  getLastScan(): HostScanResult | null {
    return this.lastScan;
  }

  getServiceByType(type: ServiceType): DiscoveredService | undefined {
    return this.lastScan?.services.find((s) => s.type === type);
  }
}
