import { renderHook, act } from '@testing-library/react';
import { useModelStatus } from './useModelStatus';
import axios from 'axios';

vi.mock('axios');
vi.mock('../lib/constants', () => ({ API_URL: 'http://localhost:3001' }));

const mockedAxios = vi.mocked(axios);

describe('useModelStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with empty providers array', () => {
    mockedAxios.get.mockResolvedValue({ data: { providers: [] } });

    const { result } = renderHook(() => useModelStatus(null));

    expect(result.current.providers).toEqual([]);
  });

  it('should not fetch when token is null', () => {
    const { result } = renderHook(() => useModelStatus(null));

    expect(result.current.providers).toEqual([]);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('should fetch providers with authorization header', async () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0.1, totalCalls: 100, consecutiveFailures: 0 },
    ];
    mockedAxios.get.mockResolvedValue({ data: { providers } });

    renderHook(() => useModelStatus('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3001/memory/model-status', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('should update providers from response data', async () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0.05, totalCalls: 200, consecutiveFailures: 0 },
      { name: 'qwen-turbo', healthy: false, failureRate: 0.5, totalCalls: 50, consecutiveFailures: 5 },
    ];
    mockedAxios.get.mockResolvedValue({ data: { providers } });

    const { result } = renderHook(() => useModelStatus('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.providers).toEqual(providers);
    expect(result.current.providers[0].healthy).toBe(true);
    expect(result.current.providers[1].healthy).toBe(false);
  });

  it('should handle empty providers array in response', async () => {
    mockedAxios.get.mockResolvedValue({ data: { providers: [] } });

    const { result } = renderHook(() => useModelStatus('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.providers).toEqual([]);
  });

  it('should keep empty providers on fetch error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useModelStatus('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.providers).toEqual([]);
  });

  it('should poll at configured interval', async () => {
    mockedAxios.get.mockResolvedValue({ data: { providers: [] } });

    renderHook(() => useModelStatus('token-123', 5000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(3);
  });

  it('should expose refresh function for manual refetch', async () => {
    mockedAxios.get.mockResolvedValue({ data: { providers: [] } });

    const { result } = renderHook(() => useModelStatus('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refresh();
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should clear interval on unmount', async () => {
    mockedAxios.get.mockResolvedValue({ data: { providers: [] } });

    const { unmount } = renderHook(() => useModelStatus('token-123', 5000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});