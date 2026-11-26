import fs from 'node:fs';
import axios, { type AxiosInstance } from 'axios';
import FormData from 'form-data';
import type { SkillConfig } from '../config/schema.js';
import type {
  AssistenteHealthResponse,
  AssistentePublishResult,
  MediaAsset,
  PublishParams,
} from '../types/index.js';

export interface NotificationPayload {
  title: string;
  message: string;
  level?: 'info' | 'warning' | 'error' | 'success';
  metadata?: Record<string, unknown>;
}

export class AssistentePessoalClient {
  private readonly http: AxiosInstance;
  private readonly healthPath: string;
  private readonly maxCaptionLength: number;

  constructor(config: SkillConfig) {
    const svc = config.services.assistentePessoal;
    const apiKey = process.env[svc.apiKeyEnv] ?? '';

    this.healthPath = svc.healthPath;
    this.maxCaptionLength = config.social.maxCaptionLength;

    this.http = axios.create({
      baseURL: svc.baseUrl.replace(/\/$/, ''),
      timeout: svc.timeout,
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    });
  }

  async checkHealth(): Promise<AssistenteHealthResponse> {
    const response = await this.http.get<AssistenteHealthResponse>(this.healthPath);
    return response.data;
  }

  async getContext(userId?: string): Promise<Record<string, unknown>> {
    const response = await this.http.get<Record<string, unknown>>('/api/context', {
      params: userId ? { userId } : undefined,
    });
    return response.data;
  }

  async sendNotification(payload: NotificationPayload): Promise<{ delivered: boolean }> {
    const response = await this.http.post<{ delivered: boolean }>('/api/notifications', payload);
    return response.data;
  }

  async publishSocial(
    asset: MediaAsset,
    params: PublishParams,
  ): Promise<AssistentePublishResult> {
    const captionWithTags =
      params.hashtags && params.hashtags.length > 0
        ? `${params.caption}\n\n${params.hashtags.map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ')}`
        : params.caption;

    if (captionWithTags.length > this.maxCaptionLength) {
      throw new Error(
        `Caption length (${captionWithTags.length}) exceeds maximum allowed (${this.maxCaptionLength})`,
      );
    }

    const form = new FormData();
    form.append('file', fs.createReadStream(asset.absolutePath), {
      filename: asset.originalName ?? asset.filename,
      contentType: asset.mimeType,
    });
    form.append('platforms', JSON.stringify(params.platforms));
    form.append('caption', captionWithTags);
    if (params.title) form.append('title', params.title);
    if (params.scheduledAt) form.append('scheduledAt', params.scheduledAt);
    form.append('assetId', asset.id);

    const response = await this.http.post<AssistentePublishResult>('/api/social/publish', form, {
      headers: form.getHeaders(),
    });
    return response.data;
  }
}
