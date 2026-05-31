import { fetchTemplates } from '../lib/templates-api';

const API_URL = 'http://localhost:3001';

describe('Templates API', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch').mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch templates', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([
        { id: 'tpl-1', name: 'REST API Builder' },
        { id: 'tpl-2', name: 'Data Analyst' },
      ]),
    } as any);

    const result = await fetchTemplates();

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('REST API Builder');
    expect(fetch).toHaveBeenCalledWith(`${API_URL}/templates`);
  });

  it('should return empty array on error', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as any);

    const result = await fetchTemplates();

    expect(result).toEqual([]);
  });

  it('should return empty array on network failure', async () => {
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

    const result = await fetchTemplates();

    expect(result).toEqual([]);
  });
});
