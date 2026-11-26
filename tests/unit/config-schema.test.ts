import { describe, expect, it } from 'vitest';
import { deepMerge, loadConfig } from '../../src/config/schema.js';

describe('config/schema', () => {
  it('loads default and development configuration cleanly', () => {
    const config = loadConfig({ env: 'development' });

    expect(config.skill.name).toBe('claude-skill-media-studio');
    expect(config.services.comfyui.endpoint).toBe('http://localhost:8188');
    expect(config.pipeline.defaultSteps).toBe(15);
    expect(config.social.platforms).toContain('instagram');
  });

  it('applies custom overrides with deepMerge', () => {
    const merged = deepMerge(
      { a: { x: 1, y: 2 }, b: 'keep' },
      { a: { y: 99 }, c: true },
    );

    expect(merged).toEqual({ a: { x: 1, y: 99 }, b: 'keep', c: true });
  });

  it('validates invalid override via Zod', () => {
    expect(() =>
      loadConfig({
        env: 'development',
        overrides: {
          services: {
            comfyui: { endpoint: 'not-a-valid-url' },
          },
        },
      }),
    ).toThrow();
  });
});
