import { renderHook, act } from '@testing-library/react';
import { useAutonomous } from './useAutonomous';
import axios from 'axios';

vi.mock('axios');
vi.mock('../lib/constants', () => ({ API_URL: 'http://localhost:3001' }));

const mockedAxios = vi.mocked(axios);

describe('useAutonomous', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should start with default idle state', () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAutonomous(null));

    expect(result.current.isIdle).toBe(true);
    expect(result.current.pendingTasks).toEqual([]);
    expect(result.current.activeTask).toBeNull();
  });

  it('should not fetch when token is null', () => {
    renderHook(() => useAutonomous(null));
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('should fetch autonomous status with auth header', async () => {
    mockedAxios.get.mockResolvedValue({
      data: { isIdle: true, pendingTasks: [], activeTask: null, dailyCost: 0, dailyBudget: 1 },
    });

    renderHook(() => useAutonomous('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3001/memory/autonomous-status', {
      headers: { Authorization: 'Bearer token-123' },
    });
  });

  it('should update state with response data', async () => {
    const tasks = [
      { id: 't1', topic: 'Learn React patterns', priority: 0.8, status: 'pending' },
      { id: 't2', topic: 'Optimize DB queries', priority: 0.5, status: 'pending' },
    ];
    const activeTask = { id: 't3', topic: 'Refactor auth module', priority: 0.9, status: 'researching' };

    mockedAxios.get.mockResolvedValue({
      data: {
        isIdle: false,
        pendingTasks: tasks,
        activeTask,
        dailyCost: 0.123,
        dailyBudget: 2.0,
      },
    });

    const { result } = renderHook(() => useAutonomous('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isIdle).toBe(false);
    expect(result.current.pendingTasks).toHaveLength(2);
    expect(result.current.activeTask).toEqual(activeTask);
    expect(result.current.dailyCost).toBe(0.123);
    expect(result.current.dailyBudget).toBe(2.0);
  });

  it('should use defaults for missing fields in response', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAutonomous('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.pendingTasks).toEqual([]);
    expect(result.current.activeTask).toBeNull();
    expect(result.current.dailyCost).toBe(0);
    expect(result.current.dailyBudget).toBe(1);
  });

  it('should keep defaults on fetch error', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => useAutonomous('token-123'));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.isIdle).toBe(true);
    expect(result.current.pendingTasks).toEqual([]);
    expect(result.current.activeTask).toBeNull();
  });

  it('should poll at configured interval', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    renderHook(() => useAutonomous('token-123', 10000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
  });

  it('should expose refresh function', async () => {
    mockedAxios.get.mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAutonomous('token-123'));

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
    mockedAxios.get.mockResolvedValue({ data: {} });

    const { unmount } = renderHook(() => useAutonomous('token-123', 5000));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);

    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
    });
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});