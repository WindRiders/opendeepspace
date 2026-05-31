import { renderHook, act } from '@testing-library/react';
import { useAuth } from './useAuth';

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: mockLocalStorage });

// Mock API_URL to avoid real network calls
vi.mock('../lib/constants', () => ({
  API_URL: 'http://localhost:3001',
}));

const API_URL = 'http://localhost:3001';

beforeEach(() => {
  mockFetch.mockReset();
  mockLocalStorage.getItem.mockReset();
  mockLocalStorage.setItem.mockReset();
  mockLocalStorage.removeItem.mockReset();
});

describe('useAuth', () => {
  describe('initial state', () => {
    it('should start unauthenticated when no token in storage', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const { result } = renderHook(() => useAuth());

      // useEffect runs synchronously for the no-token case, setting loading=false
      expect(result.current.loading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });

    it('should be authenticated when token is valid', async () => {
      mockLocalStorage.getItem.mockReturnValue('valid-token');
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ id: '1', username: 'testuser', email: 'test@test.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null }),
      });

      const { result } = renderHook(() => useAuth());

      // Initial state is loading
      expect(result.current.loading).toBe(true);

      // Wait for profile fetch
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.username).toBe('testuser');
      expect(result.current.token).toBe('valid-token');
    });

    it('should remove token from storage when profile fetch fails', async () => {
      mockLocalStorage.getItem.mockReturnValue('expired-token');
      mockFetch.mockResolvedValueOnce({ ok: false });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ds_token');
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should remove token from storage when fetch throws', async () => {
      mockLocalStorage.getItem.mockReturnValue('bad-token');
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ds_token');
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('login', () => {
    it('should login successfully', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'new-token',
          user: { id: '1', username: 'loginuser', email: 'login@test.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null },
        }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('loginuser', 'password');
      });

      expect(mockFetch).toHaveBeenCalledWith(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'loginuser', password: 'password' }),
      });
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('ds_token', 'new-token');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.username).toBe('loginuser');
    });

    it('should set error on login failure', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Invalid credentials' }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('baduser', 'wrong');
      });

      expect(result.current.error).toBe('Invalid credentials');
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('should set generic error when response has no message', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({}),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('user', 'pass');
      });

      expect(result.current.error).toBe('Login failed');
    });

    it('should set generic error when JSON parse fails', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('user', 'pass');
      });

      expect(result.current.error).toBe('Login failed');
    });
  });

  describe('register', () => {
    it('should register successfully', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'reg-token',
          user: { id: '2', username: 'newuser', email: 'new@test.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null },
        }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.register('new@test.com', 'newuser', 'password');
      });

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('ds_token', 'reg-token');
      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user?.email).toBe('new@test.com');
    });

    it('should set error on registration failure', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Email already registered' }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.register('dup@test.com', 'dupuser', 'password');
      });

      expect(result.current.error).toBe('Email already registered');
    });
  });

  describe('logout', () => {
    it('should clear token and user', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'token',
          user: { id: '1', username: 'u', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null },
        }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('u', 'p');
      });

      expect(result.current.isAuthenticated).toBe(true);

      act(() => {
        result.current.logout();
      });

      expect(mockLocalStorage.removeItem).toHaveBeenCalledWith('ds_token');
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.user).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update profile successfully', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      // 1. fetchProfile on mount, 2. login, 3. updateProfile
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: '1', username: 'orig', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'token',
            user: { id: '1', username: 'orig', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null },
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            id: '1', username: 'newname', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null,
          }),
        });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('orig', 'p');
      });

      await act(async () => {
        await result.current.updateProfile({ username: 'newname' });
      });

      expect(result.current.user?.username).toBe('newname');
    });

    it('should throw error when update fails', async () => {
      mockLocalStorage.getItem.mockReturnValue('token');
      // 1. fetchProfile on mount, 2. login, 3. updateProfile (fails)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ id: '1', username: 'u', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'token',
            user: { id: '1', username: 'u', email: 'u@t.com', role: 'user', avatarUrl: null, createdAt: 'now', lastLoginAt: null },
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ message: 'Current password is incorrect' }),
        });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('u', 'p');
      });

      await act(async () => {
        await expect(result.current.updateProfile({ currentPassword: 'wrong', newPassword: 'new' }))
          .rejects.toThrow('Current password is incorrect');
      });
    });

    it('should do nothing when no token', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.updateProfile({ username: 'new' });
      });

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('clearError', () => {
    it('should clear the error message', async () => {
      mockLocalStorage.getItem.mockReturnValue(null);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ message: 'Some error' }),
      });

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.login('u', 'p');
      });

      expect(result.current.error).toBe('Some error');

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBe('');
    });
  });
});
