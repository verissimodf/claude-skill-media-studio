import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LocalStorageAdapter } from '../../src/lib/storage-adapter.js';

describe('LocalStorageAdapter', () => {
  let tmpDir: string;
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'media-studio-storage-'));
    adapter = new LocalStorageAdapter({
      basePath: tmpDir,
      maxFileSize: 1024 * 1024,
      allowedExtensions: ['.png', '.mp4', '.jpg'],
      cleanupTempHours: 24,
    });
    await adapter.init();
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('saves, retrieves, lists, and deletes an asset', async () => {
    const saved = await adapter.saveAsset({
      buffer: Buffer.from('fake-png-bytes'),
      filename: 'sunset.png',
      category: 'gallery',
      projectId: 'proj_1',
      tags: ['t2i', 'sunset'],
    });

    expect(saved.id).toMatch(/^asset_/);
    expect(saved.kind).toBe('image');
    expect(saved.mimeType).toBe('image/png');

    const fetched = await adapter.getAsset(saved.id);
    expect(fetched?.filename).toBe(saved.filename);

    const listed = await adapter.listAssets({ projectId: 'proj_1', tag: 't2i' });
    expect(listed).toHaveLength(1);

    const deleted = await adapter.deleteAsset(saved.id);
    expect(deleted).toBe(true);
    expect(await adapter.getAsset(saved.id)).toBeNull();
  });

  it('rejects disallowed extensions and oversized files', async () => {
    await expect(
      adapter.saveAsset({
        buffer: Buffer.from('script'),
        filename: 'evil.exe',
      }),
    ).rejects.toThrow(/not allowed/i);

    await expect(
      adapter.saveAsset({
        buffer: Buffer.alloc(1024 * 1024 + 10),
        filename: 'huge.png',
      }),
    ).rejects.toThrow(/exceeds maxFileSize/i);
  });

  it('cleans up expired temp files', async () => {
    const tempAsset = await adapter.saveAsset({
      buffer: Buffer.from('temp-data'),
      filename: 'clip.mp4',
      category: 'temp',
    });

    const oldTime = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await fs.utimes(tempAsset.absolutePath, oldTime, oldTime);

    const result = await adapter.cleanupTemp(24);
    expect(result.removed).toBe(1);
  });
});
