import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import {
  serializeMessages,
  deserializeMessages,
} from './session.serializer';
import type { ConversationSummary } from '@deepspace/shared-types';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;
  private cleanupInterval: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(SessionService.name);
  private readonly ttlHours: number;
  private readonly maxSessionsPerUser: number;

  constructor(private readonly configService: ConfigService) {
    this.ttlHours = parseInt(
      this.configService.get<string>('SESSION_TTL_HOURS', '24'),
      10,
    );
    this.maxSessionsPerUser = parseInt(
      this.configService.get<string>('MAX_SESSIONS_PER_USER', '10'),
      10,
    );
  }

  onModuleInit() {
    const dbPath = this.configService.get<string>(
      'SESSION_DB_PATH',
      './data/sessions.db',
    );
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '',
        messages TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `);

    this.cleanupInterval = setInterval(
      () => this.cleanExpiredSessions(),
      5 * 60 * 1000,
    );
    this.logger.log('Session store initialized (SQLite)');
  }

  onModuleDestroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    if (this.db) {
      this.db.close();
    }
  }

  getSession(sessionId: string, userId: string): BaseMessage[] | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db
      .prepare(
        'SELECT messages FROM sessions WHERE id = ? AND user_id = ? AND expires_at > ?',
      )
      .get(sessionId, userId, now) as { messages: string } | undefined;

    if (!row) return null;
    return deserializeMessages(row.messages);
  }

  saveSession(
    sessionId: string,
    userId: string,
    messages: BaseMessage[],
  ): void {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + this.ttlHours * 3600;
    const serialized = serializeMessages(messages);
    const autoTitle = this.generateTitle(messages);

    this.db
      .prepare(
        `INSERT INTO sessions (id, user_id, title, messages, created_at, updated_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           messages = excluded.messages,
           title = CASE WHEN sessions.title = '' THEN excluded.title ELSE sessions.title END,
           updated_at = excluded.updated_at,
           expires_at = excluded.expires_at`,
      )
      .run(sessionId, userId, autoTitle, serialized, now, now, expiresAt);
  }

  private generateTitle(messages: BaseMessage[]): string {
    for (const msg of messages) {
      if (msg instanceof HumanMessage) {
        const content = String(msg.content).trim();
        return content.length > 50
          ? content.substring(0, 50) + '...'
          : content;
      }
    }
    return '';
  }

  deleteSession(sessionId: string, userId: string): void {
    this.db
      .prepare('DELETE FROM sessions WHERE id = ? AND user_id = ?')
      .run(sessionId, userId);
  }

  countUserSessions(userId: string): number {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as count FROM sessions WHERE user_id = ? AND expires_at > ?',
      )
      .get(userId, now) as { count: number };
    return row.count;
  }

  isSessionLimitReached(userId: string): boolean {
    return this.countUserSessions(userId) >= this.maxSessionsPerUser;
  }

  cleanExpiredSessions(): number {
    const now = Math.floor(Date.now() / 1000);
    const result = this.db
      .prepare('DELETE FROM sessions WHERE expires_at <= ?')
      .run(now);
    if (result.changes > 0) {
      this.logger.log(`Cleaned ${result.changes} expired sessions`);
    }
    return result.changes;
  }

  listConversations(userId: string): ConversationSummary[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = this.db
      .prepare(
        `SELECT id, title, messages, created_at, updated_at
         FROM sessions
         WHERE user_id = ? AND expires_at > ?
         ORDER BY updated_at DESC`,
      )
      .all(userId, now) as Array<{
      id: string;
      title: string;
      messages: string;
      created_at: number;
      updated_at: number;
    }>;

    return rows.map((row) => {
      let messageCount = 0;
      try {
        const parsed = JSON.parse(row.messages);
        messageCount = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        this.logger.warn(`Failed to parse messages JSON for session ${row.id}`);
      }
      return {
        id: row.id,
        title: row.title || '未命名对话',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        messageCount,
      };
    });
  }

  updateConversationTitle(
    sessionId: string,
    userId: string,
    title: string,
  ): boolean {
    const result = this.db
      .prepare(
        'UPDATE sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?',
      )
      .run(title, Math.floor(Date.now() / 1000), sessionId, userId);
    return result.changes > 0;
  }
}
