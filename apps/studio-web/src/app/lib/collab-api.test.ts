import { fetchRoles, fetchCollabSessions, fetchCollabSession, createCollabSession, addCollabMessage } from '../lib/collab-api';

const API_BASE = 'http://localhost:3001';

describe('Collab API', () => {
  const mockLocalStorage = { getItem: vi.fn() };
  Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
    mockLocalStorage.getItem.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('fetchRoles', () => {
    it('should fetch agent roles', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([
          { role: 'planner', description: 'Plan tasks' },
          { role: 'coder', description: 'Write code' },
        ]),
      } as any);

      const result = await fetchRoles();

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('planner');
    });

    it('should return empty array on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchRoles();

      expect(result).toEqual([]);
    });
  });

  describe('fetchCollabSessions', () => {
    it('should list sessions', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([{ id: 'sess-1', task: 'Build API' }]),
      } as any);

      const result = await fetchCollabSessions();

      expect(result).toHaveLength(1);
      expect(result[0].task).toBe('Build API');
    });

    it('should return empty array on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchCollabSessions();

      expect(result).toEqual([]);
    });
  });

  describe('fetchCollabSession', () => {
    it('should get a single session', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'sess-1', task: 'Build API', messages: [] }),
      } as any);

      const result = await fetchCollabSession('sess-1');

      expect(result?.id).toBe('sess-1');
    });

    it('should return null for non-existent session', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await fetchCollabSession('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createCollabSession', () => {
    it('should create a session', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'new-sess', task: 'Build API', agents: ['planner', 'coder'] }),
      } as any);

      const result = await createCollabSession('Build API', ['planner', 'coder']);

      expect(result?.id).toBe('new-sess');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/collab/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({ task: 'Build API', agents: ['planner', 'coder'] }),
      });
    });

    it('should return null on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await createCollabSession('Test', ['planner']);

      expect(result).toBeNull();
    });
  });

  describe('addCollabMessage', () => {
    it('should add a message', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'msg-1', from: 'planner', to: 'coder', content: 'Hello' }),
      } as any);

      const result = await addCollabMessage('sess-1', 'planner', 'coder', 'Hello', 'handoff');

      expect(result?.id).toBe('msg-1');
      expect(fetch).toHaveBeenCalledWith(`${API_BASE}/collab/sessions/sess-1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer token',
        },
        body: JSON.stringify({ from: 'planner', to: 'coder', content: 'Hello', type: 'handoff' }),
      });
    });

    it('should return null on error', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

      const result = await addCollabMessage('sess-1', 'planner', 'coder', 'Hello', 'handoff');

      expect(result).toBeNull();
    });
  });
});
