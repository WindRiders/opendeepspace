import { createHttpRequestTool } from './http_request.tool';

describe('createHttpRequestTool', () => {
  let tool: ReturnType<typeof createHttpRequestTool>;
  let originalFetch: typeof global.fetch;

  beforeAll(() => {
    originalFetch = global.fetch;
  });

  beforeEach(() => {
    jest.useFakeTimers();
    tool = createHttpRequestTool();
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('http_request');
      expect(tool.description).toContain('HTTP request');
    });

    it('should have schema with url, method, body, headers', () => {
      const shape = tool.schema;
      expect(shape).toBeDefined();
    });
  });

  describe('execute', () => {
    it('should make GET request and return status + response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue('Hello World'),
        json: jest.fn(),
      } as any);

      const result = await tool.func({ url: 'https://example.com/api' });
      expect(result).toContain('HTTP 200 OK');
      expect(result).toContain('Hello World');
    });

    it('should return JSON response parsed and formatted', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'application/json']]),
        text: jest.fn(),
        json: jest.fn().mockResolvedValue({ key: 'value' }),
      } as any);

      const result = await tool.func({ url: 'https://example.com/api' });
      expect(result).toContain('HTTP 200 OK');
      expect(result).toContain('"key"');
    });

    it('should default to GET method', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue(''),
      } as any);

      await tool.func({ url: 'https://example.com' });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should use provided method', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 201,
        statusText: 'Created',
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue(''),
      } as any);

      await tool.func({
        url: 'https://example.com',
        method: 'POST',
        body: JSON.stringify({ name: 'test' }),
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should add Content-Type header for POST with body', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Map([['content-type', 'text/plain']]),
        text: jest.fn().mockResolvedValue(''),
      } as any);

      await tool.func({
        url: 'https://example.com',
        method: 'POST',
        body: '{"key":"value"}',
      });
      expect(global.fetch).toHaveBeenCalledWith(
        'https://example.com',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    describe('SSRF protection', () => {
      it('should block localhost', async () => {
        const result = await tool.func({ url: 'http://localhost:3000/api' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 127.0.0.1', async () => {
        const result = await tool.func({ url: 'http://127.0.0.1:8080' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 0.0.0.0', async () => {
        const result = await tool.func({ url: 'http://0.0.0.0:8080' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 192.168.x.x', async () => {
        const result = await tool.func({ url: 'http://192.168.1.1/admin' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 10.x.x.x', async () => {
        const result = await tool.func({ url: 'http://10.0.0.1/api' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 172.16.x.x (private B range)', async () => {
        const result = await tool.func({ url: 'http://172.16.0.1/api' });
        expect(result).toContain('private/internal networks');
      });

      it('should block 172.31.x.x (top of private B range)', async () => {
        const result = await tool.func({ url: 'http://172.31.255.255/api' });
        expect(result).toContain('private/internal networks');
      });

      it('should allow 172.15.x.x (below private B range)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/plain']]),
          text: jest.fn().mockResolvedValue('ok'),
        } as any);

        const result = await tool.func({ url: 'http://172.15.0.1/api' });
        expect(result).toContain('HTTP 200');
      });

      it('should allow 172.32.x.x (above private B range)', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/plain']]),
          text: jest.fn().mockResolvedValue('ok'),
        } as any);

        const result = await tool.func({ url: 'http://172.32.0.1/api' });
        expect(result).toContain('HTTP 200');
      });

      it('should block non-http protocols', async () => {
        const result = await tool.func({ url: 'ftp://example.com/file' });
        expect(result).toContain('Only http and https protocols');
      });
    });

    describe('response handling', () => {
      it('should truncate responses longer than 10000 chars', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/plain']]),
          text: jest.fn().mockResolvedValue('x'.repeat(15000)),
        } as any);

        const result = (await tool.func({ url: 'https://example.com/large' })) as string;
        expect(result).toContain('response truncated');
        expect(result.length).toBeLessThan(15000);
      });

      it('should not truncate short responses', async () => {
        global.fetch = jest.fn().mockResolvedValue({
          status: 200,
          statusText: 'OK',
          headers: new Map([['content-type', 'text/plain']]),
          text: jest.fn().mockResolvedValue('Short response'),
        } as any);

        const result = await tool.func({ url: 'https://example.com' });
        expect(result).not.toContain('truncated');
      });
    });

    describe('error handling', () => {
      it('should return timeout error on AbortError', async () => {
        global.fetch = jest.fn().mockRejectedValue(
          Object.assign(new Error('The operation was aborted'), {
            name: 'AbortError',
          }),
        );

        const result = await tool.func({ url: 'https://slow.example.com' });
        expect(result).toContain('Request timed out');
        expect(result).toContain('15s');
      });

      it('should return error message on fetch failure', async () => {
        global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

        const result = await tool.func({ url: 'https://down.example.com' });
        expect(result).toContain('Error: Network error');
      });
    });
  });
});
