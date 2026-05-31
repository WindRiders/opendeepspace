import { fetchConversations, deleteConversation, renameConversation } from '../lib/conversations-api';

const API_URL = 'http://localhost:3001';

describe('Conversations API', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchConversations', () => {
    it('should fetch conversations with token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { id: '1', title: 'Chat 1', updatedAt: 'now' },
          { id: '2', title: 'Chat 2', updatedAt: 'now' },
        ]),
      } as any);

      const result = await fetchConversations('token-123');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('1');
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations`, {
        headers: { Authorization: 'Bearer token-123' },
      });
    });

    it('should fetch without token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      } as any);

      const result = await fetchConversations();

      expect(result).toEqual([]);
      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations`, { headers: {} });
    });

    it('should return empty array on error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchConversations('token');

      expect(result).toEqual([]);
    });
  });

  describe('deleteConversation', () => {
    it('should delete with token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await deleteConversation('conv-1', 'token');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations/conv-1`, {
        method: 'DELETE',
        headers: { Authorization: 'Bearer token' },
      });
    });

    it('should delete without token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await deleteConversation('conv-1');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations/conv-1`, {
        method: 'DELETE',
        headers: {},
      });
    });
  });

  describe('renameConversation', () => {
    it('should rename with token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await renameConversation('conv-1', 'New Title', 'token');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations/conv-1/title`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({ title: 'New Title' }),
      });
    });

    it('should rename without token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);

      await renameConversation('conv-1', 'New Title');

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/conversations/conv-1/title`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'New Title' }),
      });
    });
  });
});
