import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';

const MAX_RESPONSE_LEN = 10_000;
const TIMEOUT_MS = 15_000;

export const createHttpRequestTool = () => {
  return new DynamicStructuredTool({
    name: 'http_request',
    description:
      'Make an HTTP request to a URL. Supports GET, POST, PUT, DELETE. Useful for fetching data from APIs or web pages. Timeout: 15s.',
    schema: z.object({
      url: z.string().describe('The URL to request'),
      method: z
        .enum(['GET', 'POST', 'PUT', 'DELETE'])
        .optional()
        .describe('HTTP method (default: GET)'),
      body: z
        .string()
        .optional()
        .describe('Request body (for POST/PUT). JSON string.'),
      headers: z
        .record(z.string(), z.string())
        .optional()
        .describe('Additional request headers as key-value pairs.'),
    }),
    func: async ({ url, method = 'GET', body, headers = {} }) => {
      try {
        // Validate URL
        const parsed = new URL(url);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          return `Error: Only http and https protocols are allowed.`;
        }

        // Block private/internal networks
        const hostname = parsed.hostname;
        if (
          hostname === 'localhost' ||
          hostname === '127.0.0.1' ||
          hostname === '0.0.0.0' ||
          hostname.startsWith('192.168.') ||
          hostname.startsWith('10.') ||
          /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
        ) {
          return `Error: Requests to private/internal networks are not allowed.`;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

        const fetchHeaders: Record<string, string> = { ...headers };
        if (body && !fetchHeaders['Content-Type']) {
          fetchHeaders['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
          method,
          headers: fetchHeaders,
          body: body || undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const contentType = response.headers.get('content-type') || '';
        let responseBody: string;

        if (contentType.includes('application/json')) {
          const json = await response.json();
          responseBody = JSON.stringify(json, null, 2);
        } else {
          responseBody = await response.text();
        }

        if (responseBody.length > MAX_RESPONSE_LEN) {
          responseBody =
            responseBody.substring(0, MAX_RESPONSE_LEN) +
            '\n... (response truncated)';
        }

        return `HTTP ${response.status} ${response.statusText}\n\n${responseBody}`;
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return `Error: Request timed out after ${TIMEOUT_MS / 1000}s`;
        }
        return `Error: ${err.message}`;
      }
    },
  });
};
