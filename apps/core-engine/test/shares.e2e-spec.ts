import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Shares E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let tokenA: string;
  let tokenB: string;
  let shareId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-shares-'));
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
      .send({ email: 'shareb@test.com', username: 'shareb', password: 'password123' });
    tokenB = userRes.body.access_token;

    // User A creates a share
    const createRes = await request(app.getHttpServer())
      .post('/shares')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ type: 'dna', title: 'Test DNA Share', payload: '{"role":"coder"}' });
    shareId = createRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('POST /shares', () => {
    it('should create a DNA share', async () => {
      const res = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ type: 'dna', title: 'My DNA', payload: 'test' })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.type).toBe('dna');
    });

    it('should create a template share', async () => {
      const res = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ type: 'template', title: 'My Template', payload: '{}' })
        .expect(201);

      expect(res.body.type).toBe('template');
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .send({ type: 'dna', title: 'Test', payload: '' })
        .expect(401);
    });
  });

  describe('GET /shares/:id', () => {
    it('should return share publicly', async () => {
      const res = await request(app.getHttpServer())
        .get(`/shares/${shareId}`)
        .expect(200);

      expect(res.body.id).toBe(shareId);
      expect(res.body.title).toBe('Test DNA Share');
    });

    it('should increment view count', async () => {
      // First, get current count without incrementing (use list endpoint)
      const listRes = await request(app.getHttpServer())
        .get('/shares')
        .set('Authorization', `Bearer ${tokenA}`);
      const shareInList = listRes.body.find((s: any) => s.id === shareId);
      const count1 = shareInList ? shareInList.viewCount : 0;

      // Access the share publicly (increments view count)
      await request(app.getHttpServer())
        .get(`/shares/${shareId}`)
        .expect(200);

      // Check that view count increased
      const listRes2 = await request(app.getHttpServer())
        .get('/shares')
        .set('Authorization', `Bearer ${tokenA}`);
      const shareInList2 = listRes2.body.find((s: any) => s.id === shareId);
      expect(shareInList2.viewCount).toBe(count1 + 1);
    });

    it('should return 404 for non-existent share', async () => {
      await request(app.getHttpServer())
        .get('/shares/nonexistent')
        .expect(404);
    });
  });

  describe('GET /shares', () => {
    it('should list my shares', async () => {
      const res = await request(app.getHttpServer())
        .get('/shares')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      const found = res.body.find((s: any) => s.id === shareId);
      expect(found).toBeDefined();
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer()).get('/shares').expect(401);
    });
  });

  describe('DELETE /shares/:id', () => {
    it('should delete own share', async () => {
      await request(app.getHttpServer())
        .delete(`/shares/${shareId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // Verify it's gone
      await request(app.getHttpServer())
        .get(`/shares/${shareId}`)
        .expect(404);
    });

    it('should not delete another user share', async () => {
      // User B creates a share
      const createRes = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ type: 'dna', title: 'User B Share', payload: 'test' });
      const userBShareId = createRes.body.id;

      // User A tries to delete it
      await request(app.getHttpServer())
        .delete(`/shares/${userBShareId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      // User B should still have it
      await request(app.getHttpServer())
        .get(`/shares/${userBShareId}`)
        .expect(200);
    });
  });
});
