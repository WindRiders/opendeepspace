"use client";

import { useState } from "react";

type AuthMode = "login" | "register";

interface LoginScreenProps {
  onLogin: (username: string, password: string) => void;
  onRegister: (email: string, username: string, password: string) => void;
  error: string;
  loading: boolean;
  onClearError: () => void;
}

export function LoginScreen({ onLogin, onRegister, error, loading, onClearError }: LoginScreenProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [localError, setLocalError] = useState("");

  const switchMode = (newMode: AuthMode) => {
    setMode(newMode);
    setLocalError("");
    onClearError();
    setEmail("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError("");

    if (mode === "login") {
      if (username.trim() && password.trim()) {
        onLogin(username.trim(), password.trim());
      }
    } else {
      if (!email.trim() || !username.trim() || !password.trim()) {
        setLocalError("Please fill in all fields");
        return;
      }
      if (password !== confirmPassword) {
        setLocalError("Passwords do not match");
        return;
      }
      if (password.length < 8) {
        setLocalError("Password must be at least 8 characters");
        return;
      }
      onRegister(email.trim(), username.trim(), password);
    }
  };

  const displayError = localError || error;
  const isLogin = mode === "login";

  const canSubmit = isLogin
    ? username.trim() && password.trim()
    : email.trim() && username.trim() && password.trim() && confirmPassword.trim();

  return (
    <div className="flex items-center justify-center h-screen bg-[#08080c] text-zinc-100">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm p-8 rounded-2xl bg-zinc-900/80 border border-zinc-800/60 shadow-2xl space-y-6"
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
            DeepSpace
          </h1>
          <p className="text-xs text-zinc-500">
            {isLogin ? "Sign in to continue" : "Create your account"}
          </p>
        </div>

        {displayError && (
          <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center">
            {displayError}
          </div>
        )}

        <div className="space-y-4">
          {!isLogin && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              placeholder="Enter username"
              autoFocus
              autoComplete="username"
            />
          </div>
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              placeholder="Enter password"
              autoComplete={isLogin ? "current-password" : "new-password"}
            />
          </div>
          {!isLogin && (
            <div>
              <label className="block text-xs text-zinc-400 mb-1.5">Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
                placeholder="Confirm password"
                autoComplete="new-password"
              />
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className="w-full py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-sm font-medium text-white hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
        >
          {loading
            ? isLogin ? "Signing in..." : "Creating account..."
            : isLogin ? "Sign in" : "Create account"}
        </button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => switchMode(isLogin ? "register" : "login")}
            className="text-xs text-zinc-500 hover:text-violet-400 transition-colors"
          >
            {isLogin
              ? "Don't have an account? Sign up"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </form>
    </div>
  );
}
