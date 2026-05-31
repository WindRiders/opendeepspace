import {
  Injectable,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload, UserProfile } from '@deepspace/shared-types';
import { UserService, UserRow } from './user.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
  ) {}

  async validateUser(
    identifier: string,
    password: string,
  ): Promise<UserRow | null> {
    const user = this.userService.findByIdentifier(identifier);
    if (!user) return null;
    const valid = await this.userService.validatePassword(user, password);
    return valid ? user : null;
  }

  login(user: UserRow): { access_token: string; user: UserProfile } {
    this.userService.updateLastLogin(user.id);
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      user: this.userService.toProfile(user),
    };
  }

  async register(
    email: string,
    username: string,
    password: string,
  ): Promise<{ access_token: string; user: UserProfile }> {
    if (this.userService.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    if (this.userService.findByUsername(username)) {
      throw new ConflictException('Username already taken');
    }

    const user = await this.userService.createUser(email, username, password);
    return this.login(user);
  }

  getProfile(userId: string): UserProfile | null {
    const user = this.userService.findById(userId);
    return user ? this.userService.toProfile(user) : null;
  }

  async updateProfile(
    userId: string,
    updates: {
      username?: string;
      avatarUrl?: string;
      currentPassword?: string;
      newPassword?: string;
    },
  ): Promise<UserProfile> {
    const user = this.userService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (updates.newPassword) {
      if (!updates.currentPassword) {
        throw new BadRequestException(
          'Current password is required to set a new password',
        );
      }
      const valid = await this.userService.validatePassword(
        user,
        updates.currentPassword,
      );
      if (!valid) {
        throw new BadRequestException('Current password is incorrect');
      }
      await this.userService.updatePassword(userId, updates.newPassword);
    }

    if (
      updates.username &&
      updates.username !== user.username &&
      this.userService.findByUsername(updates.username)
    ) {
      throw new ConflictException('Username already taken');
    }

    const updated = this.userService.updateProfile(userId, {
      username: updates.username,
      avatar_url: updates.avatarUrl,
    });

    return this.userService.toProfile(updated!);
  }
}
