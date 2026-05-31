import { fetchTraces, fetchTrace, deleteTrace } from '../lib/trace-api';

const API_BASE = 'http://localhost:3001';

describe('Trace API', () => {
  const mockLocalStorage = { getItem: vi.fn() };
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
    mockLocalStorage.getItem.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchTraces', () => {
    it('should fetch all traces', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: 'trace-1', sessionId: 'sess-1', createdAt: 'now' },
        ]),
      } as any);

      const result = await fetchTraces();

      expect(result).toHaveLength(1);
    });

    it('should fetch traces by sessionId', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);

      await fetchTraces('sess-123');

      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/traces?sessionId=sess-123`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
      });
    });

    it('should return empty array on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchTraces();

      expect(result).toEqual([]);
    });
  });

  describe('fetchTrace', () => {
    it('should fetch a single trace', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'trace-1', sessionId: 'sess-1', steps: [] }),
      } as any);

      const result = await fetchTrace('trace-1');

      expect(result?.id).toBe('trace-1');
      expect(result?.steps).toEqual([]);
    });

    it('should return null for non-existent trace', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchTrace('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteTrace', () => {
    it('should return true when deleted', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      const result = await deleteTrace('trace-1');

      expect(result).toBe(true);
    });

    it('should return false when deletion fails', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await deleteTrace('trace-1');

      expect(result).toBe(false);
    });
  });
});
