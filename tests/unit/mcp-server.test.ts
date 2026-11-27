import { describe, expect, it } from 'vitest';
import { handleMcpMessage, MCP_TOOLS } from '../../src/mcp-server.js';

describe('MCP stdio server', () => {
  it('handles initialize handshake', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {},
    });

    expect(res?.id).toBe(1);
    const result = res?.result as { protocolVersion: string; serverInfo: { name: string } };
    expect(result.protocolVersion).toBe('2024-11-05');
    expect(result.serverInfo.name).toBe('claude-skill-media-studio');
  });

  it('lists all 10 media_studio MCP tools', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    });

    const result = res?.result as { tools: Array<{ name: string }> };
    expect(result.tools).toHaveLength(MCP_TOOLS.length);
    expect(result.tools.map((t) => t.name)).toContain('media_studio_generate_image');
    expect(result.tools.map((t) => t.name)).toContain('media_studio_publish');
  });

  it('returns JSON-RPC error for unknown tool', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'non_existent_tool', arguments: {} },
    });

    expect(res?.error?.code).toBe(-32602);
  });
});
