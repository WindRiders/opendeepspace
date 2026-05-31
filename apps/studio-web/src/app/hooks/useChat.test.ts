import { renderHook, act, waitFor } from '@testing-library/react';
import { useChat } from '../hooks/useChat';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { online: true, phase: 'idle' } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
  },
}));

// Mock sse-client
vi.mock('../lib/sse-client', () => ({
  streamInteract: vi.fn(),
}));

// Mock uuid to get predictable session IDs
vi.mock('uuid', () => ({
  v4: vi.fn().mockReturnValue('mock-session-id'),
}));

// Mock localStorage
beforeEach(() => {
  vi.stubGlobal('localStorage', {
    getItem: vi.fn().mockReturnValue(null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useChat', () => {
  it('should initialize with welcome message', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('agent');
    expect(result.current.input).toBe('');
    expect(result.current.isLoading).toBe(false);
  });

  it('should initialize with a session ID', () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.sessionId).toBe('mock-session-id');
  });

  it('should update input via setInput', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.setInput('Hello world');
    });

    expect(result.current.input).toBe('Hello world');
  });

  it('should update dna via setDna', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.setDna('You are a coding expert');
    });

    expect(result.current.dna).toBe('You are a coding expert');
  });

  it('should update selectedModelId', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.setSelectedModelId('qwen-plus');
    });

    expect(result.current.selectedModelId).toBe('qwen-plus');
  });

  it('should create a new chat session', () => {
    const { result } = renderHook(() => useChat());

    act(() => {
      result.current.newChat();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('agent');
    expect(result.current.input).toBe('');
  });

  it('should clear chat and reset messages', async () => {
    const axios = (await import('axios')).default;
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.clearChat();
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].role).toBe('agent');
    expect(result.current.messages[0].content).toContain('已重置');
  });

  it('should not send empty message', async () => {
    const { streamInteract } = await import('../lib/sse-client');
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.doSend('  ');
    });

    expect(streamInteract).not.toHaveBeenCalled();
    expect(result.current.messages).toHaveLength(1);
  });
});