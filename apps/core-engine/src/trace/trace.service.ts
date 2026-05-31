import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import type {
  ExecutionTrace,
  TraceSummary,
  TraceStep,
} from '@deepspace/shared-types';
import * as path from 'path';
import * as fs from 'fs';

@Injectable()
export class TraceService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database;
  private readonly logger = new Logger(TraceService.name);
  private readonly maxTracesPerSession: number;

  constructor(private readonly configService: ConfigService) {
    this.maxTracesPerSession = parseInt(
      this.configService.get<string>('MAX_TRACES_PER_SESSION', '50'),
      10,
    );
  }

  onModuleInit() {
    const dbPath = this.configService.get<string>(
      'TRACE_DB_PATH',
      './data/traces.db',
    );
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS traces (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        user_message TEXT NOT NULL,
        agent_reply TEXT NOT NULL DEFAULT '',
        steps TEXT NOT NULL DEFAULT '[]',
        total_steps INTEGER NOT NULL DEFAULT 0,
        model_id TEXT,
        dna TEXT,
        created_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0
      )
    `);

    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_traces_session ON traces(session_id);
      CREATE INDEX IF NOT EXISTS idx_traces_user ON traces(user_id);
      CREATE INDEX IF NOT EXISTS idx_traces_created ON traces(created_at DESC);
    `);

    this.logger.log('Trace store initialized (SQLite)');
  }

  onModuleDestroy() {
    if (this.db) {
      this.db.close();
    }
  }

  saveTrace(
    traceId: string,
    userId: string,
    sessionId: string,
    userMessage: string,
    agentReply: string,
    steps: TraceStep[],
    totalSteps: number,
    durationMs: number,
    modelId?: string,
    dna?: string,
  ): void {
    const now = Math.floor(Date.now() / 1000);
    this.db
      .prepare(
        `INSERT OR REPLACE INTO traces
         (id, session_id, user_id, user_message, agent_reply, steps, total_steps, model_id, dna, created_at, duration_ms)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        traceId,
        sessionId,
        userId,
        userMessage,
        agentReply,
        JSON.stringify(steps),
        totalSteps,
        modelId || null,
        dna || null,
        now,
        durationMs,
      );
  }

  getTrace(traceId: string, userId: string): ExecutionTrace | null {
    const row = this.db
      .prepare('SELECT * FROM traces WHERE id = ? AND user_id = ?')
      .get(traceId, userId) as any;

    if (!row) return null;
    return this.rowToTrace(row);
  }

  listTraces(userId: string, sessionId?: string): TraceSummary[] {
    let rows: any[];
    if (sessionId) {
      rows = this.db
        .prepare(
          `SELECT id, session_id, user_message, steps, total_steps, created_at, duration_ms
           FROM traces WHERE user_id = ? AND session_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, sessionId, this.maxTracesPerSession);
    } else {
      rows = this.db
        .prepare(
          `SELECT id, session_id, user_message, steps, total_steps, created_at, duration_ms
           FROM traces WHERE user_id = ?
           ORDER BY created_at DESC LIMIT ?`,
        )
        .all(userId, this.maxTracesPerSession);
    }

    return rows.map((row) => {
      let toolCount = 0;
      try {
        const steps: TraceStep[] = JSON.parse(row.steps);
        toolCount = steps.filter((s) => s.type === 'tool_call').length;
      } catch {
        this.logger.warn(`Failed to parse steps JSON for trace ${row.id}`);
      }
      return {
        id: row.id,
        sessionId: row.session_id,
        userMessage:
          row.user_message.length > 100
            ? row.user_message.substring(0, 100) + '...'
            : row.user_message,
        totalSteps: row.total_steps,
        toolCount,
        createdAt: row.created_at,
        durationMs: row.duration_ms,
      };
    });
  }

  deleteTrace(traceId: string, userId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM traces WHERE id = ? AND user_id = ?')
      .run(traceId, userId);
    return result.changes > 0;
  }

  private rowToTrace(row: any): ExecutionTrace {
    let steps: TraceStep[] = [];
    try {
      steps = JSON.parse(row.steps);
    } catch {
      this.logger.warn(`Failed to parse steps JSON for trace ${row.id}`);
    }
    return {
      id: row.id,
      sessionId: row.session_id,
      userMessage: row.user_message,
      agentReply: row.agent_reply,
      steps,
      totalSteps: row.total_steps,
      modelId: row.model_id || undefined,
      dna: row.dna || undefined,
      createdAt: row.created_at,
      durationMs: row.duration_ms,
    };
  }
}
