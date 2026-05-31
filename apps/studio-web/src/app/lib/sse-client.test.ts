import { streamInteract } from '../lib/sse-client';

const API_URL = 'http://localhost:3001';

describe('SSE Client', () => {
  let mockReader: { read: ReturnType<typeof vi.fn>; releaseLock: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockReader = {
      read: vi.fn(),
      releaseLock: vi.fn(),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setupSSEStream(chunks: string[]) {
    let callIndex = 0;
    mockReader.read.mockImplementation(async () => {
      if (callIndex < chunks.length) {
        const value = new TextEncoder().encode(chunks[callIndex]);
        callIndex++;
        return { done: false, value };
      }
      return { done: true, value: undefined };
    });

    const mockResponse = {
      ok: true,
      body: {
        getReader: () => mockReader,
      },
      text: () => Promise.resolve(''),
    };
    vi.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);
  }

  describe('streamInteract', () => {
    it('should parse SSE events from data lines', async () => {
      setupSSEStream([
        'data: {"type":"thinking","content":"Step 1: Thinking"}\n\n',
        'data: {"type":"text_chunk","content":"Hello"}\n\n',
        'data: {"type":"done","totalSteps":1}\n\n',
      ]);

      const events: any[] = [];
      await streamInteract(
        { message: 'test' },
        (event) => events.push(event),
      );

      expect(events).toHaveLength(3);
      expect(events[0].type).toBe('thinking');
      expect(events[1].type).toBe('text_chunk');
      expect(events[2].type).toBe('done');
    });

    it('should send auth token in Authorization header', async () => {
      setupSSEStream(['data: {"type":"done","totalSteps":0}\n\n']);

      await streamInteract(
        { message: 'test' },
        () => {},
        { token: 'my-token' },
      );

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/agent/interact/stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer my-token',
        },
        body: JSON.stringify({ message: 'test' }),
        signal: undefined,
      });
    });

    it('should send optional params (dna, sessionId, modelId)', async () => {
      setupSSEStream(['data: {"type":"done","totalSteps":0}\n\n']);

      await streamInteract(
        { message: 'test', dna: 'be helpful', sessionId: 'abc-123', modelId: 'qwen-plus' },
        () => {},
      );

      expect(fetch).toHaveBeenCalledWith(`${API_URL}/agent/interact/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test', dna: 'be helpful', sessionId: 'abc-123', modelId: 'qwen-plus' }),
        signal: undefined,
      });
    });

    it('should throw when response is not ok', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve('Unauthorized'),
        body: null,
      } as any);

      await expect(streamInteract({ message: 'test' }, () => {}))
        .rejects.toThrow('SSE request failed (401)');
    });

    it('should throw when response body is not readable', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        body: null,
        text: () => Promise.resolve(''),
      } as any);

      await expect(streamInteract({ message: 'test' }, () => {}))
        .rejects.toThrow('Response body is not readable');
    });

    it('should pass abort signal to fetch', async () => {
      const controller = new AbortController();

      // Make fetch reject with AbortError
      vi.spyOn(global, 'fetch').mockRejectedValue(new DOMException('Aborted', 'AbortError'));

      await expect(streamInteract(
        { message: 'test' },
        () => {},
        { signal: controller.signal },
      )).rejects.toThrow();

      expect(fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
        signal: controller.signal,
      }));
    });

    it('should handle fragmented SSE messages across chunks', async () => {
      // Send a message split across two chunks
      setupSSEStream([
        'data: {"type":"thinking","content":"Step 1"',
        '}\n\ndata: {"type":"done","totalSteps":1}\n\n',
      ]);

      const events: any[] = [];
      await streamInteract(
        { message: 'test' },
        (event) => events.push(event),
      );

      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('thinking');
      expect(events[1].type).toBe('done');
    });

    it('should ignore malformed JSON', async () => {
      setupSSEStream([
        'data: not-json\n\n',
        'data: {"type":"done","totalSteps":0}\n\n',
      ]);

      const events: any[] = [];
      await streamInteract({ message: 'test' }, (event) => events.push(event));

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('done');
    });

    it('should handle empty response gracefully', async () => {
      setupSSEStream(['\n\n']);

      const events: any[] = [];
      await streamInteract({ message: 'test' }, (event) => events.push(event));

      expect(events).toHaveLength(0);
    });
  });
});
