import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { CollabMessage, CollabSession } from '@deepspace/shared-types';

@Injectable()
export class CollabSessionStore implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CollabSessionStore.name);
  private db!: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const dbPath = this.configService.get<string>('COLLAB_DB_PATH', './data/collab.db');
    const dir = require('path').dirname(dbPath);
    require('fs').mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collab_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        task TEXT NOT NULL,
        agents TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planning',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_collab_sessions_user ON collab_sessions(user_id);

      CREATE TABLE IF NOT EXISTS collab_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        from_agent TEXT NOT NULL,
        to_agent TEXT NOT NULL,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        FOREIGN KEY (session_id) REFERENCES collab_sessions(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_collab_messages_session ON collab_messages(session_id);
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  createSession(task: string, agents: string[], userId: string): CollabSession {
    const id = randomUUID();
    const createdAt = Date.now();

    this.db
      .prepare(
        'INSERT INTO collab_sessions (id, user_id, task, agents, status, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run(id, userId, task, JSON.stringify(agents), 'planning', createdAt);

    this.logger.log(`Collab session created: ${id}`);
    return { id, task, agents: agents as any, messages: [], status: 'planning', createdAt };
  }

  getSession(sessionId: string, userId: string): CollabSession | null {
    const row = this.db
      .prepare('SELECT * FROM collab_sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as any;
    if (!row) return null;
    return this.rowToSession(row);
  }

  listSessions(userId: string): CollabSession[] {
    const rows = this.db
      .prepare('SELECT * FROM collab_sessions WHERE user_id = ? ORDER BY created_at DESC')
      .all(userId) as any[];
    return rows.map((row) => this.rowToSession(row));
  }

  deleteSession(sessionId: string, userId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM collab_sessions WHERE id = ? AND user_id = ?')
      .run(sessionId, userId);
    return result.changes > 0;
  }

  addMessage(
    sessionId: string,
    userId: string,
    from: CollabMessage['from'],
    to: CollabMessage['to'],
    content: string,
    type: CollabMessage['type'],
  ): CollabMessage | null {
    const session = this.db
      .prepare('SELECT id FROM collab_sessions WHERE id = ? AND user_id = ?')
      .get(sessionId, userId) as any;
    if (!session) return null;

    const msg: CollabMessage = {
      id: randomUUID(),
      from, to, content,
      timestamp: Date.now(),
      type,
    };

    this.db
      .prepare(
        'INSERT INTO collab_messages (id, session_id, from_agent, to_agent, content, type, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(msg.id, sessionId, msg.from, msg.to, msg.content, msg.type, msg.timestamp);

    return msg;
  }

  updateStatus(sessionId: string, userId: string, status: CollabSession['status']): boolean {
    const result = this.db
      .prepare('UPDATE collab_sessions SET status = ? WHERE id = ? AND user_id = ?')
      .run(status, sessionId, userId);
    return result.changes > 0;
  }

  getLastMessage(sessionId: string, fromAgent: string): { content: string } | undefined {
    return this.db
      .prepare(
        'SELECT content FROM collab_messages WHERE session_id = ? AND from_agent = ? ORDER BY timestamp DESC LIMIT 1',
      )
      .get(sessionId, fromAgent) as { content: string } | undefined;
  }

  private rowToSession(row: any): CollabSession {
    const messages = this.db
      .prepare('SELECT * FROM collab_messages WHERE session_id = ? ORDER BY timestamp ASC')
      .all(row.id) as any[];

    return {
      id: row.id,
      task: row.task,
      agents: JSON.parse(row.agents),
      messages: messages.map((m) => ({
        id: m.id,
        from: m.from_agent,
        to: m.to_agent,
        content: m.content,
        timestamp: m.timestamp,
        type: m.type,
      })),
      status: row.status,
      createdAt: row.created_at,
    };
  }
}