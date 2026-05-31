import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Sandbox E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let authToken: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-sandbox-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    // Sandbox root for this test
    process.env.SANDBOX_ROOT = path.join(tempDir, 'sandbox');

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

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    authToken = loginRes.body.access_token;

    // Create some sandbox files via agent
    await request(app.getHttpServer())
      .post('/agent/interact')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        message: '创建一个文件 test.txt，内容为 "hello from sandbox"',
        sessionId: 'sandbox-test-session',
      });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /sandbox/files', () => {
    it('should list root directory', async () => {
      const res = await request(app.getHttpServer())
        .get('/sandbox/files')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should list subdirectory', async () => {
      const res = await request(app.getHttpServer())
        .get('/sandbox/files?path=deepspace-sandbox')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer()).get('/sandbox/files').expect(401);
    });
  });

  describe('GET /sandbox/read', () => {
    it('should reject without path parameter', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should reject for non-existent file', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read?path=nonexistent.txt')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read?path=test.txt')
        .expect(401);
    });
  });
});
