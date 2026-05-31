import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Agent E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let authToken: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-agent-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    process.env.USER_DB_PATH = path.join(dbBase, 'users.db');
    process.env.SESSION_DB_PATH = path.join(dbBase, 'sessions.db');
    process.env.TRACE_DB_PATH = path.join(dbBase, 'traces.db');
    process.env.COLLAB_DB_PATH = path.join(dbBase, 'collab.db');
    process.env.SHARE_DB_PATH = path.join(dbBase, 'shares.db');
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.JWT_EXPIRATION = '1h';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin123';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Login to get auth token
    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    authToken = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /agent/status', () => {
    it('should return agent status', async () => {
      const res = await request(app.getHttpServer())
        .get('/agent/status')
        .expect(200);

      expect(res.body.status).toBe('online');
      expect(res.body.core).toBe('DeepSpace Genesis');
      expect(res.body.phase).toBe(2);
      expect(Array.isArray(res.body.tools)).toBe(true);
      expect(Array.isArray(res.body.models)).toBe(true);
    });
  });

  describe('GET /agent/models', () => {
    it('should return available models', async () => {
      const res = await request(app.getHttpServer())
        .get('/agent/models')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      // Should include qwen models since DASHSCOPE_API_KEY is configured
      const modelIds = res.body.map((m: any) => m.id);
      expect(modelIds).toContain('qwen-plus');
    });
  });

  describe('POST /agent/interact', () => {
    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/agent/interact')
        .send({ message: 'hello' })
        .expect(401);
    });

    it('should interact with agent', async () => {
      const res = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: '你好' })
        .expect(201);

      expect(res.body.sessionId).toBeDefined();
      expect(res.body.reply).toBeDefined();
      expect(res.body.agentDna).toBeDefined();
      expect(res.body.totalSteps).toBeDefined();
      expect(Array.isArray(res.body.toolCalls)).toBe(true);
    });

    it('should maintain session context', async () => {
      // First message
      const res1 = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: '记住这个关键词：DEEPSPACE2026',
          sessionId: 'e2e-context-test',
        })
        .expect(201);

      const sessionId = res1.body.sessionId;

      // Second message referencing first
      const res2 = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          message: '刚才我说的关键词是什么？',
          sessionId,
        })
        .expect(201);

      expect(res2.body.reply).toBeDefined();
      expect(res2.body.sessionId).toBe(sessionId);
    });
  });

  describe('POST /agent/interact/stream', () => {
    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/agent/interact/stream')
        .send({ message: 'hello' })
        .expect(401);
    });

    it('should stream response with SSE', async () => {
      const res = await request(app.getHttpServer())
        .post('/agent/interact/stream')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: '写一句简短的话' })
        .expect(201);

      expect(res.headers['content-type']).toContain('text/event-stream');
      // Response body contains SSE events
      expect(res.text).toContain('session_start');
      expect(res.text).toContain('done');
    });
  });

  describe('DELETE /agent/session/:id', () => {
    it('should clear a session', async () => {
      // Create a session first
      const interactRes = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ message: 'test' });

      const sessionId = interactRes.body.sessionId;

      // Delete it
      await request(app.getHttpServer())
        .delete(`/agent/session/${sessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
    });
  });
});
