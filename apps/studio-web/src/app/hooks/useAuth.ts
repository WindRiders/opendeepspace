"use client";

import { useState, useCallback, useEffect } from "react";
import { API_URL } from "../lib/constants";

const TOKEN_KEY = "ds_token";

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchProfile = useCallback(async (accessToken: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        return false;
      }
      const profile = await res.json();
      setUser(profile);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      fetchProfile(stored).then((ok) => {
        if (ok) {
          setToken(stored);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [fetchProfile]);

  const login = useCallback(async (username: string, password: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
      setUser(data.user);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, username: string, password: string) => {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Registration failed");
      }
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.access_token);
      setToken(data.access_token);
      setUser(data.user);
    } catch (err: any) {
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }, []);

  const updateProfile = useCallback(async (updates: {
    username?: string;
    avatarUrl?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => {
    const currentToken = localStorage.getItem(TOKEN_KEY);
    if (!currentToken) return;
    setError("");
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${currentToken}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || "Update failed");
      }
      const profile = await res.json();
      setUser(profile);
    } catch (err: any) {
      setError(err.message || "Update failed");
      throw err;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return {
    token,
    user,
    isAuthenticated: !!token,
    loading,
    error,
    login,
    register,
    updateProfile,
    logout,
    clearError,
  };
}
