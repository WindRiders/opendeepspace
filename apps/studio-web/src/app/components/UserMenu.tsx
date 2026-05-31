"use client";

import { useState, useRef, useEffect } from "react";
import { LogOut, Settings, User, X } from "lucide-react";
import type { UserProfile } from "../hooks/useAuth";

interface UserMenuProps {
  user: UserProfile;
  onLogout: () => void;
  onUpdateProfile: (updates: {
    username?: string;
    avatarUrl?: string;
    currentPassword?: string;
    newPassword?: string;
  }) => Promise<void>;
  error: string;
  onClearError: () => void;
}

export function UserMenu({ user, onLogout, onUpdateProfile, error, onClearError }: UserMenuProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [menuOpen]);

  const initials = user.username.slice(0, 2).toUpperCase();

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(!menuOpen)}
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-zinc-800/50 transition-colors"
        >
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-[10px] font-bold text-white">
            {initials}
          </div>
          <span className="text-xs text-zinc-400 hidden sm:inline max-w-[80px] truncate">
            {user.username}
          </span>
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-48 rounded-xl bg-zinc-900 border border-zinc-800/60 shadow-xl py-1 z-50">
            <div className="px-3 py-2 border-b border-zinc-800/60">
              <p className="text-xs font-medium text-zinc-200 truncate">{user.username}</p>
              <p className="text-[10px] text-zinc-500 truncate">{user.email}</p>
              <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] bg-violet-500/10 text-violet-400 border border-violet-500/20">
                {user.role}
              </span>
            </div>
            <button
              onClick={() => {
                setMenuOpen(false);
                setProfileOpen(true);
                onClearError();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Profile Settings
            </button>
            <button
              onClick={() => {
                setMenuOpen(false);
                onLogout();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-xs text-red-400 hover:text-red-300 hover:bg-zinc-800/50 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        )}
      </div>

      {profileOpen && (
        <ProfileDialog
          user={user}
          error={error}
          onUpdate={onUpdateProfile}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </>
  );
}

function ProfileDialog({
  user,
  error,
  onUpdate,
  onClose,
}: {
  user: UserProfile;
  error: string;
  onUpdate: UserMenuProps["onUpdateProfile"];
  onClose: () => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [localError, setLocalError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSave = async () => {
    setLocalError("");
    setSuccess("");

    const updates: Record<string, string> = {};
    if (username !== user.username) {
      updates.username = username;
    }

    if (newPassword) {
      if (!currentPassword) {
        setLocalError("Current password is required to change password");
        return;
      }
      if (newPassword !== confirmPassword) {
        setLocalError("New passwords do not match");
        return;
      }
      if (newPassword.length < 8) {
        setLocalError("New password must be at least 8 characters");
        return;
      }
      updates.currentPassword = currentPassword;
      updates.newPassword = newPassword;
    }

    if (Object.keys(updates).length === 0) {
      setLocalError("No changes to save");
      return;
    }

    setSaving(true);
    try {
      await onUpdate(updates);
      setSuccess("Profile updated successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      // error handled by parent
    } finally {
      setSaving(false);
    }
  };

  const displayError = localError || error;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-full max-w-md mx-4 bg-zinc-900 rounded-2xl border border-zinc-800/60 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/60">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-zinc-200">Profile Settings</h3>
          </div>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Avatar & Info */}
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center text-lg font-bold text-white shrink-0">
              {user.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-200 truncate">{user.email}</p>
              <p className="text-[10px] text-zinc-500">
                Joined {new Date(user.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>

          {displayError && (
            <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {displayError}
            </div>
          )}
          {success && (
            <div className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs">
              {success}
            </div>
          )}

          {/* Username */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1.5">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
            />
          </div>

          {/* Change Password */}
          <div className="space-y-3">
            <p className="text-xs text-zinc-400 font-medium">Change Password</p>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              placeholder="Current password"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              placeholder="New password (min 8 characters)"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-colors"
              placeholder="Confirm new password"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-zinc-800/60">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-gradient-to-r from-violet-600 to-cyan-600 text-xs font-medium text-white hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 transition-all"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
