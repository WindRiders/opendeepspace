import { createShare, fetchShare, fetchMyShares, deleteShare } from '../lib/share-api';

const API_BASE = 'http://localhost:3001';

describe('Share API', () => {
  const mockLocalStorage = { getItem: vi.fn() };
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
    mockLocalStorage.getItem.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createShare', () => {
    it('should create a DNA share', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'share-1', type: 'dna', title: 'Test DNA' }),
      } as any);

      const result = await createShare('dna', 'Test DNA', '{"role":"coder"}');

      expect(result?.id).toBe('share-1');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/shares`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({ type: 'dna', title: 'Test DNA', payload: '{"role":"coder"}' }),
      });
    });

    it('should return null on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await createShare('dna', 'Test', '{}');

      expect(result).toBeNull();
    });
  });

  describe('fetchShare', () => {
    it('should fetch a share publicly', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'share-1', title: 'Public Share' }),
      } as any);

      const result = await fetchShare('share-1');

      expect(result?.title).toBe('Public Share');
    });

    it('should return null for non-existent share', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchShare('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('fetchMyShares', () => {
    it('should list user shares', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: 'share-1', type: 'dna', title: 'Share A' },
          { id: 'share-2', type: 'template', title: 'Share B' },
        ]),
      } as any);

      const result = await fetchMyShares();

      expect(result).toHaveLength(2);
    });

    it('should return empty array on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchMyShares();

      expect(result).toEqual([]);
    });
  });

  describe('deleteShare', () => {
    it('should return true when deleted', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      const result = await deleteShare('share-1');

      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/shares/share-1`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should return false when deletion fails', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await deleteShare('share-1');

      expect(result).toBe(false);
    });
  });
});
