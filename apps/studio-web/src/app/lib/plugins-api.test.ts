import { fetchPlugins, reloadPlugin, togglePlugin, installPlugin } from '../lib/plugins-api';

const API_URL = 'http://localhost:3001';

describe('Plugins API', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchPlugins', () => {
    it('should fetch plugin list', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve([
            {
              id: 'example-plugin',
              name: 'Example Plugin',
              version: '1.0.0',
              description: 'An example plugin',
              enabled: true,
              toolCount: 1,
            },
          ]),
      } as any);

      const result = await fetchPlugins();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Example Plugin');
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/plugins`, { headers: {} });
    });

    it('should return empty array on error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchPlugins();

      expect(result).toEqual([]);
    });

    it('should return empty array on network failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await fetchPlugins();

      expect(result).toEqual([]);
    });
  });

  describe('reloadPlugin', () => {
    it('should reload a plugin by id', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            pluginId: 'example-plugin',
            toolCount: 2,
          }),
      } as any);

      const result = await reloadPlugin('example-plugin');

      expect(result.success).toBe(true);
      expect(result.pluginId).toBe('example-plugin');
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/plugins/example-plugin/reload`,
        { method: 'POST', headers: {} },
      );
    });

    it('should return error when plugin not found', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ error: 'Plugin not found' }),
      } as any);

      const result = await reloadPlugin('nonexistent');

      expect(result.error).toBe('Plugin not found');
    });
  });

  describe('togglePlugin', () => {
    it('should enable a plugin', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            pluginId: 'example-plugin',
            enabled: true,
            toolCount: 2,
          }),
      } as any);

      const result = await togglePlugin('example-plugin', true);

      expect(result.success).toBe(true);
      expect(result.enabled).toBe(true);
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/plugins/example-plugin/toggle`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled: true }),
        },
      );
    });

    it('should disable a plugin', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            pluginId: 'example-plugin',
            enabled: false,
            toolCount: 0,
          }),
      } as any);

      const result = await togglePlugin('example-plugin', false);

      expect(result.enabled).toBe(false);
      expect(result.toolCount).toBe(0);
    });
  });

  describe('installPlugin', () => {
    it('should install a plugin from dirPath', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            success: true,
            id: 'new-plugin',
            name: 'New Plugin',
            toolCount: 3,
          }),
      } as any);

      const result = await installPlugin('/path/to/plugin');

      expect(result.success).toBe(true);
      expect(result.name).toBe('New Plugin');
      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/plugins/install`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: '/path/to/plugin' }),
        },
      );
    });
  });
});
