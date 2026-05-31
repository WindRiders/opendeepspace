import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import type { ShareLink, ShareType } from '@deepspace/shared-types';
import { randomUUID } from 'crypto';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class ShareService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;
  private readonly logger = new Logger(ShareService.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const dbPath = this.configService.get<string>(
      'SHARE_DB_PATH',
      './data/shares.db',
    );
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS shares (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER,
        view_count INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_shares_type ON shares(type);
      CREATE INDEX IF NOT EXISTS idx_shares_created_by ON shares(created_by);
    `);

    this.logger.log('Share store initialized (SQLite)');
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  createShare(
    type: ShareType,
    title: string,
    payload: string,
    userId: string,
    ttlDays?: number,
  ): ShareLink {
    const id = randomUUID().substring(0, 8);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = ttlDays ? now + ttlDays * 86400 : null;

    this.db
      .prepare(
        `INSERT INTO shares (id, type, title, payload, created_by, created_at, expires_at, view_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(id, type, title, payload, userId, now, expiresAt);

    return {
      id,
      type,
      title,
      payload,
      createdBy: userId,
      createdAt: now,
      expiresAt: expiresAt || undefined,
      viewCount: 0,
    };
  }

  getShare(id: string): ShareLink | null {
    const now = Math.floor(Date.now() / 1000);
    const row = this.db
      .prepare(
        'SELECT * FROM shares WHERE id = ? AND (expires_at IS NULL OR expires_at > ?)',
      )
      .get(id, now) as any;

    if (!row) return null;

    // Increment view count
    this.db
      .prepare('UPDATE shares SET view_count = view_count + 1 WHERE id = ?')
      .run(id);

    // Return with incremented view count
    return { ...this.rowToShare(row), viewCount: row.view_count + 1 };
  }

  listShares(userId: string): ShareLink[] {
    const now = Math.floor(Date.now() / 1000);
    const rows = this.db
      .prepare(
        `SELECT * FROM shares
         WHERE created_by = ? AND (expires_at IS NULL OR expires_at > ?)
         ORDER BY created_at DESC LIMIT 50`,
      )
      .all(userId, now) as any[];

    return rows.map((r) => this.rowToShare(r));
  }

  deleteShare(id: string, userId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM shares WHERE id = ? AND created_by = ?')
      .run(id, userId);
    return result.changes > 0;
  }

  private rowToShare(row: any): ShareLink {
    return {
      id: row.id,
      type: row.type,
      title: row.title,
      payload: row.payload,
      createdBy: row.created_by,
      createdAt: row.created_at,
      expiresAt: row.expires_at || undefined,
      viewCount: row.view_count,
    };
  }
}
