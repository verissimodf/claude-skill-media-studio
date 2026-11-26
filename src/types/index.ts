export type ServiceType =
  | 'comfyui'
  | 'ollama'
  | 'assistente-pessoal'
  | 'ffmpeg'
  | 'database'
  | 'redis'
  | 'reverse-proxy'
  | 'binary'
  | 'unknown';

export type ServiceHealthStatus = 'healthy' | 'degraded' | 'unreachable';

export interface DiscoveredService {
  id: string;
  type: ServiceType;
  name: string;
  endpoint: string;
  healthEndpoint?: string;
  capabilities: string[];
  status: ServiceHealthStatus;
  metadata: Record<string, unknown>;
  discoveredAt: string;
}

export interface DiscoveredVolume {
  name?: string;
  path?: string;
  label?: string;
  source?: string;
  target?: string;
  fstype?: string;
  size?: string;
  used?: string;
  available?: string;
  availableSpace?: string;
  usagePercent?: string;
  permissions?: string;
  exists?: boolean;
  driver?: string;
  mountpoint?: string;
  type: 'docker' | 'host' | 'expected';
  discoveredAt: string;
}

export interface GpuInfo {
  name?: string;
  vendor?: string;
  type?: string;
  memoryTotalMB?: number;
  memoryFreeMB?: number;
  driverVersion?: string;
}

export interface NetworkInfo {
  docker_networks?: string[];
  listening_ports?: string[];
  interfaces?: Array<{
    name: string;
    ipv4: string[];
    ipv6: string[];
  }>;
  internet?: 'reachable' | 'unreachable';
  dns?: string[];
  gpu?: GpuInfo[];
}

export interface HostScanSummary {
  totalServices: number;
  healthyServices: number;
  degradedServices: number;
  unreachableServices: number;
  totalVolumes: number;
  expectedVolumesExist: number;
  expectedVolumesMissing: number;
}

export interface HostScanResult {
  hostname: string;
  user: string;
  scannedAt: string;
  scanDurationMs: number;
  services: DiscoveredService[];
  volumes: DiscoveredVolume[];
  network: NetworkInfo;
  summary: HostScanSummary;
}

export type AssetCategory = 'assets' | 'gallery' | 'projects' | 'temp';
export type AssetKind = 'image' | 'video' | 'audio' | 'other';

export interface MediaAsset {
  id: string;
  filename: string;
  originalName?: string;
  category: AssetCategory;
  kind: AssetKind;
  mimeType: string;
  sizeBytes: number;
  relativePath: string;
  absolutePath: string;
  projectId?: string;
  userId?: string;
  tags: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface AssetIndex {
  version: number;
  updatedAt: string;
  assets: Record<string, MediaAsset>;
}

export type SocialPlatform = 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';

export interface GenerateImageParams {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  batchSize?: number;
  sampler?: string;
  scheduler?: string;
  inputAssetId?: string;
  denoise?: number;
  workflow?: Record<string, unknown>;
}

export interface GenerateVideoParams {
  prompt: string;
  negativePrompt?: string;
  model?: string;
  inputAssetId?: string;
  width?: number;
  height?: number;
  fps?: number;
  duration?: number;
  steps?: number;
  cfg?: number;
  seed?: number;
  sampler?: string;
  scheduler?: string;
  workflow?: Record<string, unknown>;
}

export interface VideoClipInput {
  assetId: string;
  startSec?: number;
  durationSec?: number;
}

export interface AssembleVideoParams {
  type?: 'shorts' | 'reels' | 'tiktok' | 'standard';
  clips: VideoClipInput[];
  aspectRatio?: string;
  resolution?: string;
  fps?: number;
  audioAssetId?: string;
  subtitleText?: string;
  outputFilename?: string;
}

export interface PublishParams {
  assetId: string;
  platforms: SocialPlatform[];
  caption: string;
  hashtags?: string[];
  scheduledAt?: string;
  title?: string;
}

export interface SkillContext {
  userId?: string;
  projectId?: string;
  correlationId?: string;
}

export type SkillAction =
  | 'discover'
  | 'get-status'
  | 'generate-image'
  | 'generate-video'
  | 'assemble-video'
  | 'publish'
  | 'list-assets'
  | 'get-asset'
  | 'delete-asset'
  | 'cleanup-temp';

export interface SkillRequest<TParams = Record<string, unknown>> {
  action: SkillAction;
  params?: TParams;
  context?: SkillContext;
}

export interface SkillResponse<TData = unknown> {
  success: boolean;
  action: SkillAction;
  data?: TData;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
  durationMs: number;
}

export interface AssistenteHealthResponse {
  ok?: boolean;
  status?: string;
  version?: string;
  uptime?: number;
  [key: string]: unknown;
}

export interface AssistentePublishResult {
  jobId: string;
  status: 'queued' | 'scheduled' | 'published' | 'failed';
  platforms: SocialPlatform[];
  urls?: Partial<Record<SocialPlatform, string>>;
  scheduledAt?: string;
}
