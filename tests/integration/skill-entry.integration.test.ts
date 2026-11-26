import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config/schema.js';
import { MediaStudioSkill } from '../../src/skill-entry.js';

describe('MediaStudioSkill integration', () => {
  it('returns structured status via get-status action', async () => {
    const config = loadConfig({ env: 'development' });
    const skillInstance = new MediaStudioSkill(config);

    const response = await skillInstance.execute({
      action: 'get-status',
      params: {},
    });

    expect(response.success).toBe(true);
    expect(response.action).toBe('get-status');
    expect(response.durationMs).toBeGreaterThanOrEqual(0);
    expect(response.data).toBeDefined();
  });
});
