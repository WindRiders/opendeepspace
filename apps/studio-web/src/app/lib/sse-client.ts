import type { SSEEvent } from '@deepspace/shared-types';
import { API_URL } from './constants';

export interface StreamInteractParams {
  message: string;
  dna?: string;
  sessionId?: string;
  modelId?: string;
}

/**
 * POST-based SSE stream client for /agent/interact/stream.
 * Parses `data: {...}\n\n` lines from the response body.
 */
export async function streamInteract(
  params: StreamInteractParams,
  onEvent: (event: SSEEvent) => void,
  options?: { signal?: AbortSignal; token?: string },
): Promise<void> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options?.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }

  const response = await fetch(`${API_URL}/agent/interact/stream`, {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
    signal: options?.signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`SSE request failed (${response.status}): ${text}`);
  }

  if (!response.body) {
    throw new Error('Response body is not readable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by \n\n)
      const parts = buffer.split('\n\n');
      // Keep the last incomplete part in the buffer
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;
              onEvent(event);
            } catch {
              // Ignore malformed JSON
            }
          }
        }
      }
    }

    // Process any remaining data in buffer
    if (buffer.trim()) {
      const lines = buffer.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6)) as SSEEvent;
            onEvent(event);
          } catch {
            // Ignore malformed JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
