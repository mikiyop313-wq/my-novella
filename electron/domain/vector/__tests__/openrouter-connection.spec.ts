import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({ safeStorage: {} }));
vi.mock('../../../../db/repositories/app-settings.repository', () => ({
  appSettingsRepository: { get: vi.fn(), set: vi.fn(), delete: vi.fn() },
}));

import { testOpenRouterConnection } from '../openrouter-connection';

describe('testOpenRouterConnection', () => {
  const keys = { getApiKey: vi.fn() };
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('tests the saved key without choosing an embedding model', async () => {
    keys.getApiKey.mockResolvedValue('openrouter-key');
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { label: 'key' } }), {
      status: 200,
    }));

    await expect(testOpenRouterConnection(keys as any)).resolves.toBeUndefined();

    expect(keys.getApiKey).toHaveBeenCalledWith('openrouter');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({ headers: { Authorization: 'Bearer openrouter-key' } }),
    );
  });

  it('rejects missing keys and malformed connection responses', async () => {
    keys.getApiKey.mockResolvedValueOnce(null);
    await expect(testOpenRouterConnection(keys as any)).rejects.toThrow('requires an API key');

    keys.getApiKey.mockResolvedValueOnce('key');
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ data: null }), { status: 200 }));
    await expect(testOpenRouterConnection(keys as any)).rejects.toThrow(
      'malformed connection response',
    );
  });
});
