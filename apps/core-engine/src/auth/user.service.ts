import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as bcrypt from 'bcryptjs';
import { UserProfile, UserRole } from '@deepspace/shared-types';

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  avatar_url: string | null;
  role: UserRole;
  created_at: string;
  last_login_at: string | null;
}

@Injectable()
export class UserService implements OnModuleInit, OnModuleDestroy {
  private db!: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const dbPath = this.configService.get<string>('USER_DB_PATH', './data/users.db');
    const dir = require('path').dirname(dbPath);
    require('fs').mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar_url TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    `);

    this.seedAdmin();
  }

  onModuleDestroy() {
    this.db?.close();
  }

  private seedAdmin() {
    const adminUsername = this.configService.get<string>('ADMIN_USERNAME', 'admin');
    const adminPassword = this.configService.get<string>('ADMIN_PASSWORD', 'admin123');
    const adminEmail = this.configService.get<string>('ADMIN_EMAIL', 'admin@deepspace.local');

    const existing = this.db.prepare('SELECT id FROM users WHERE id = ?').get('admin-001');
    if (!existing) {
      const hash = bcrypt.hashSync(adminPassword, 10);
      this.db.prepare(
        'INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      ).run('admin-001', adminEmail, adminUsername, hash, 'admin');
    }
  }

  findByEmail(email: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  }

  findByUsername(username: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE username = ?').get(username) as
      | UserRow
      | undefined;
  }

  findById(id: string): UserRow | undefined {
    return this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  findByIdentifier(identifier: string): UserRow | undefined {
    return this.findByEmail(identifier) ?? this.findByUsername(identifier);
  }

  async createUser(
    email: string,
    username: string,
    password: string,
  ): Promise<UserRow> {
    const id = this.generateId();
    const hash = await bcrypt.hash(password, 10);
    this.db
      .prepare(
        'INSERT INTO users (id, email, username, password_hash, role) VALUES (?, ?, ?, ?, ?)',
      )
      .run(id, email, username, hash, 'user');
    return this.findById(id)!;
  }

  async validatePassword(user: UserRow, password: string): Promise<boolean> {
    return bcrypt.compare(password, user.password_hash);
  }

  updateLastLogin(id: string): void {
    this.db
      .prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?")
      .run(id);
  }

  updateProfile(
    id: string,
    updates: { username?: string; avatar_url?: string },
  ): UserRow | undefined {
    const fields: string[] = [];
    const values: unknown[] = [];

    if (updates.username !== undefined) {
      fields.push('username = ?');
      values.push(updates.username);
    }
    if (updates.avatar_url !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatar_url);
    }

    if (fields.length === 0) return this.findById(id);

    values.push(id);
    this.db
      .prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`)
      .run(...values);
    return this.findById(id);
  }

  async updatePassword(id: string, newPassword: string): Promise<void> {
    const hash = await bcrypt.hash(newPassword, 10);
    this.db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  toProfile(row: UserRow): UserProfile {
    return {
      id: row.id,
      email: row.email,
      username: row.username,
      avatarUrl: row.avatar_url,
      role: row.role,
      createdAt: row.created_at,
      lastLoginAt: row.last_login_at,
    };
  }

  private generateId(): string {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
