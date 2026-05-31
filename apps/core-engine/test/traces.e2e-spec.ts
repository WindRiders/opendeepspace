import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Traces E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let tokenA: string;
  let tokenB: string;
  let sessionId: string;
  let traceId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-traces-'));
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

    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    tokenA = adminRes.body.access_token;

    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'traceb@test.com', username: 'traceb', password: 'password123' });
    tokenB = userRes.body.access_token;

    // User A sends a message to create a trace
    const interactRes = await request(app.getHttpServer())
      .post('/agent/interact')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ message: '你好，请简单回答', sessionId: 'e2e-trace-session' });
    sessionId = interactRes.body.sessionId;

    // Get the trace
    const tracesRes = await request(app.getHttpServer())
      .get(`/traces?sessionId=${sessionId}`)
      .set('Authorization', `Bearer ${tokenA}`);
    if (tracesRes.body.length > 0) {
      traceId = tracesRes.body[0].id;
    }
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /traces', () => {
    it('should list traces for a session', async () => {
      const res = await request(app.getHttpServer())
        .get(`/traces?sessionId=${sessionId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      if (traceId) {
        const found = res.body.find((t: any) => t.id === traceId);
        expect(found).toBeDefined();
      }
    });

    it('should list all traces for user', async () => {
      const res = await request(app.getHttpServer())
        .get('/traces')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer()).get('/traces').expect(401);
    });
  });

  describe('GET /traces/:id', () => {
    it('should get a specific trace', async () => {
      if (!traceId) return;

      const res = await request(app.getHttpServer())
        .get(`/traces/${traceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(traceId);
      expect(res.body.sessionId).toBe(sessionId);
      expect(Array.isArray(res.body.steps)).toBe(true);
    });

    it('should return 404 for non-existent trace', async () => {
      await request(app.getHttpServer())
        .get('/traces/nonexistent')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should reject for another user trace', async () => {
      if (!traceId) return;

      await request(app.getHttpServer())
        .get(`/traces/${traceId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('DELETE /traces/:id', () => {
    it('should delete a trace', async () => {
      if (!traceId) return;

      await request(app.getHttpServer())
        .delete(`/traces/${traceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/traces/${traceId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
