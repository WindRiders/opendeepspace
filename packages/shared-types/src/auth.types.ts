export type UserRole = 'admin' | 'user';

export interface UserProfile {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  user: UserProfile;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
}

export interface RegisterResponse {
  access_token: string;
  user: UserProfile;
}

export interface UpdateProfileRequest {
  username?: string;
  avatarUrl?: string;
  currentPassword?: string;
  newPassword?: string;
}

export interface JwtPayload {
  sub: string;
  username: string;
  email: string;
  role: UserRole;
  iat?: number;
  exp?: number;
}
