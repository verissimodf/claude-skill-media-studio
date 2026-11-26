import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mime from 'mime-types';
import type { SkillConfig } from '../config/schema.js';
import type { AssetCategory, AssetIndex, AssetKind, MediaAsset } from '../types/index.js';

const CATEGORIES: AssetCategory[] = ['assets', 'gallery', 'projects', 'temp'];
const INDEX_FILENAME = '.asset-index.json';

export interface SaveAssetInput {
  buffer?: Buffer;
  sourcePath?: string;
  filename: string;
  category?: AssetCategory;
  projectId?: string;
  userId?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

export interface ListAssetsFilter {
  category?: AssetCategory;
  kind?: AssetKind;
  projectId?: string;
  tag?: string;
}

export class LocalStorageAdapter {
  private readonly basePath: string;
  private readonly maxFileSize: number;
  private readonly allowedExtensions: Set<string>;
  private readonly cleanupTempHours: number;
  private initialized = false;

  constructor(config: SkillConfig['storage']) {
    this.basePath = path.resolve(config.basePath);
    this.maxFileSize = config.maxFileSize;
    this.allowedExtensions = new Set(config.allowedExtensions.map((e) => e.toLowerCase()));
    this.cleanupTempHours = config.cleanupTempHours;
  }

  getBasePath(): string {
    return this.basePath;
  }

  getIndexPath(): string {
    return path.join(this.basePath, INDEX_FILENAME);
  }

  async init(): Promise<void> {
    await fs.mkdir(this.basePath, { recursive: true });
    for (const category of CATEGORIES) {
      await fs.mkdir(path.join(this.basePath, category), { recursive: true });
    }

    const indexPath = this.getIndexPath();
    try {
      await fs.access(indexPath);
    } catch {
      const emptyIndex: AssetIndex = {
        version: 1,
        updatedAt: new Date().toISOString(),
        assets: {},
      };
      await this.writeIndex(emptyIndex);
    }
    this.initialized = true;
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  private async readIndex(): Promise<AssetIndex> {
    await this.ensureInit();
    const raw = await fs.readFile(this.getIndexPath(), 'utf-8');
    return JSON.parse(raw) as AssetIndex;
  }

  private async writeIndex(index: AssetIndex): Promise<void> {
    index.updatedAt = new Date().toISOString();
    const tmpPath = `${this.getIndexPath()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(index, null, 2), 'utf-8');
    await fs.rename(tmpPath, this.getIndexPath());
  }

  private detectKind(mimeType: string): AssetKind {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    if (mimeType.startsWith('audio/')) return 'audio';
    return 'other';
  }

  private sanitizeFilename(filename: string): string {
    const base = path.basename(filename);
    return base.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  async saveAsset(input: SaveAssetInput): Promise<MediaAsset> {
    await this.ensureInit();

    if (!input.buffer && !input.sourcePath) {
      throw new Error('Either buffer or sourcePath must be provided');
    }

    const safeName = this.sanitizeFilename(input.filename);
    const ext = path.extname(safeName).toLowerCase();
    if (!ext || !this.allowedExtensions.has(ext)) {
      throw new Error(`Extension "${ext || '(none)'}" is not allowed`);
    }

    const category: AssetCategory = input.category ?? 'gallery';
    const id = `asset_${crypto.randomBytes(6).toString('hex')}`;
    const storedName = `${id}_${safeName}`;
    const relativePath = path.join(category, storedName);
    const absolutePath = path.resolve(this.basePath, relativePath);

    const relCheck = path.relative(this.basePath, absolutePath);
    if (relCheck.startsWith('..') || path.isAbsolute(relCheck)) {
      throw new Error('Path traversal attempt blocked');
    }

    let sizeBytes: number;
    if (input.buffer) {
      sizeBytes = input.buffer.byteLength;
      if (sizeBytes > this.maxFileSize) {
        throw new Error(`File size (${sizeBytes}) exceeds maxFileSize (${this.maxFileSize})`);
      }
      await fs.writeFile(absolutePath, input.buffer);
    } else {
      const stat = await fs.stat(input.sourcePath!);
      sizeBytes = stat.size;
      if (sizeBytes > this.maxFileSize) {
        throw new Error(`File size (${sizeBytes}) exceeds maxFileSize (${this.maxFileSize})`);
      }
      await fs.copyFile(input.sourcePath!, absolutePath);
    }

    const mimeType = mime.lookup(ext) || 'application/octet-stream';
    const asset: MediaAsset = {
      id,
      filename: storedName,
      originalName: safeName,
      category,
      kind: this.detectKind(mimeType),
      mimeType,
      sizeBytes,
      relativePath: relativePath.replace(/\\/g, '/'),
      absolutePath,
      projectId: input.projectId,
      userId: input.userId,
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
      createdAt: new Date().toISOString(),
    };

    const index = await this.readIndex();
    index.assets[id] = asset;
    await this.writeIndex(index);

    return asset;
  }

  async getAsset(id: string): Promise<MediaAsset | null> {
    const index = await this.readIndex();
    return index.assets[id] ?? null;
  }

  async listAssets(filter?: ListAssetsFilter): Promise<MediaAsset[]> {
    const index = await this.readIndex();
    let items = Object.values(index.assets);

    if (filter?.category) {
      items = items.filter((a) => a.category === filter.category);
    }
    if (filter?.kind) {
      items = items.filter((a) => a.kind === filter.kind);
    }
    if (filter?.projectId) {
      items = items.filter((a) => a.projectId === filter.projectId);
    }
    if (filter?.tag) {
      items = items.filter((a) => a.tags.includes(filter.tag!));
    }

    return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async deleteAsset(id: string): Promise<boolean> {
    const index = await this.readIndex();
    const asset = index.assets[id];
    if (!asset) return false;

    try {
      await fs.unlink(asset.absolutePath);
    } catch {
      // Ignore if file already removed on disk
    }

    delete index.assets[id];
    await this.writeIndex(index);
    return true;
  }

  async cleanupTemp(maxAgeHours = this.cleanupTempHours): Promise<{ removed: number }> {
    await this.ensureInit();
    const tempDir = path.join(this.basePath, 'temp');
    const cutoffMs = Date.now() - maxAgeHours * 60 * 60 * 1000;
    const entries = await fs.readdir(tempDir);
    let removed = 0;

    for (const entry of entries) {
      if (entry === '.gitkeep') continue;
      const fullPath = path.join(tempDir, entry);
      const stat = await fs.stat(fullPath);
      if (stat.isFile() && stat.mtimeMs < cutoffMs) {
        await fs.unlink(fullPath);
        removed += 1;
      }
    }

    const index = await this.readIndex();
    let indexChanged = false;
    for (const [id, asset] of Object.entries(index.assets)) {
      if (asset.category === 'temp' && Date.parse(asset.createdAt) < cutoffMs) {
        delete index.assets[id];
        indexChanged = true;
      }
    }
    if (indexChanged) {
      await this.writeIndex(index);
    }

    return { removed };
  }
}
