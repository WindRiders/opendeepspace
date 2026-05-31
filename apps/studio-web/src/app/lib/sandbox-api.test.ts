import { fetchSandboxFiles, readSandboxFile } from '../lib/sandbox-api';

const API_URL = 'http://localhost:3001';

describe('Sandbox API', () => {
  const mockLocalStorage = { getItem: vi.fn() };
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
    mockLocalStorage.getItem.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchSandboxFiles', () => {
    it('should fetch root directory with token', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { name: 'test.txt', path: 'test.txt', type: 'file', size: 100 },
        ]),
      } as any);

      const result = await fetchSandboxFiles();

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('test.txt');
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/sandbox/files`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should fetch subdirectory', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);

      await fetchSandboxFiles('deepspace-sandbox');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/sandbox/files?path=deepspace-sandbox`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should return empty array on error', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchSandboxFiles();

      expect(result).toEqual([]);
    });

    it('should return empty array on network failure', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await fetchSandboxFiles();

      expect(result).toEqual([]);
    });
  });

  describe('readSandboxFile', () => {
    it('should read file with token', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: 'hello', size: 5, language: 'text' }),
      } as any);

      const result = await readSandboxFile('test.txt');

      expect(result?.content).toBe('hello');
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/sandbox/read?path=test.txt`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should handle encoded paths', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ content: '', size: 0, language: 'text' }),
      } as any);

      await readSandboxFile('path/with spaces/file.txt');

      expect(fetch).toHaveBeenCalledWith(
        `${API_URL}/sandbox/read?path=path%2Fwith%20spaces%2Ffile.txt`,
        { headers: { 'Content-Type': 'application/json' } },
      );
    });

    it('should return null on error', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await readSandboxFile('missing.txt');

      expect(result).toBeNull();
    });

    it('should return null on network failure', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await readSandboxFile('test.txt');

      expect(result).toBeNull();
    });
  });
});
