import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { MarketplaceAgent } from '@deepspace/shared-types';

@Injectable()
export class MarketplaceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MarketplaceService.name);
  private db!: Database.Database;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const dbPath = this.configService.get<string>(
      'MARKETPLACE_DB_PATH',
      './data/marketplace.db',
    );
    const dir = require('path').dirname(dbPath);
    require('fs').mkdirSync(dir, { recursive: true });

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS marketplace_agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        dna TEXT NOT NULL,
        author TEXT NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        stars INTEGER NOT NULL DEFAULT 0,
        downloads INTEGER NOT NULL DEFAULT 0,
        model_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_stars ON marketplace_agents(stars DESC);
      CREATE INDEX IF NOT EXISTS idx_marketplace_agents_author ON marketplace_agents(author);
    `);
  }

  onModuleDestroy() {
    this.db?.close();
  }

  listAgents(search?: string, tag?: string, limit = 50, offset = 0): MarketplaceAgent[] {
    let query = 'SELECT * FROM marketplace_agents';
    const conditions: string[] = [];
    const params: any[] = [];

    if (search) {
      conditions.push('(name LIKE ? OR description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`);
    }

    if (tag) {
      conditions.push("tags LIKE ?");
      params.push(`%"${tag}"%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY stars DESC, created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const rows = this.db.prepare(query).all(...params) as any[];
    return rows.map((row) => this.rowToAgent(row));
  }

  getAgent(id: string): MarketplaceAgent | null {
    const row = this.db
      .prepare('SELECT * FROM marketplace_agents WHERE id = ?')
      .get(id) as any;
    if (!row) return null;
    return this.rowToAgent(row);
  }

  publishAgent(
    name: string,
    description: string,
    dna: string,
    author: string,
    tags: string[] = [],
    modelId?: string,
  ): MarketplaceAgent {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    this.db
      .prepare(
        'INSERT INTO marketplace_agents (id, name, description, dna, author, tags, stars, downloads, model_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?)',
      )
      .run(id, name, description, dna, author, JSON.stringify(tags), modelId || null, now, now);

    this.logger.log(`Agent published: "${name}" by ${author}`);

    return {
      id,
      name,
      description,
      dna,
      author,
      tags,
      stars: 0,
      downloads: 0,
      modelId,
      createdAt: now,
      updatedAt: now,
    };
  }

  starAgent(id: string): MarketplaceAgent | null {
    const result = this.db
      .prepare(
        'UPDATE marketplace_agents SET stars = stars + 1, updated_at = ? WHERE id = ?',
      )
      .run(Math.floor(Date.now() / 1000), id);

    if (result.changes === 0) return null;

    return this.getAgent(id);
  }

  downloadAgent(id: string): MarketplaceAgent | null {
    const result = this.db
      .prepare(
        'UPDATE marketplace_agents SET downloads = downloads + 1 WHERE id = ?',
      )
      .run(id);

    if (result.changes === 0) return null;

    return this.getAgent(id);
  }

  deleteAgent(id: string, userId: string): boolean {
    const result = this.db
      .prepare('DELETE FROM marketplace_agents WHERE id = ? AND author = ?')
      .run(id, userId);
    return result.changes > 0;
  }

  private rowToAgent(row: any): MarketplaceAgent {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      dna: row.dna,
      author: row.author,
      tags: JSON.parse(row.tags),
      stars: row.stars,
      downloads: row.downloads ?? 0,
      modelId: row.model_id || undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}