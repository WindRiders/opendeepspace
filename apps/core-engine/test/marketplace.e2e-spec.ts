import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from './test.module';

describe('Marketplace E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let tokenA: string;
  let tokenB: string;
  let agentId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-marketplace-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    process.env.USER_DB_PATH = path.join(dbBase, 'users.db');
    process.env.SESSION_DB_PATH = path.join(dbBase, 'sessions.db');
    process.env.TRACE_DB_PATH = path.join(dbBase, 'traces.db');
    process.env.COLLAB_DB_PATH = path.join(dbBase, 'collab.db');
    process.env.SHARE_DB_PATH = path.join(dbBase, 'shares.db');
    process.env.MARKETPLACE_DB_PATH = path.join(dbBase, 'marketplace.db');
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
      .send({ email: 'mktb@test.com', username: 'mktb', password: 'password123' });
    tokenB = userRes.body.access_token;

    // User A publishes an agent for subsequent tests
    const createRes = await request(app.getHttpServer())
      .post('/marketplace')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({
        name: 'Test Agent',
        description: 'A test agent for E2E',
        dna: '{"role":"coder","model":"qwen"}',
        tags: ['coding', 'typescript'],
      });
    agentId = createRes.body.id;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('POST /marketplace', () => {
    it('should publish a new agent', async () => {
      const res = await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'My Agent',
          description: 'Description here',
          dna: '{"role":"planner"}',
          tags: ['planning'],
          modelId: 'qwen-plus',
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.name).toBe('My Agent');
      expect(res.body.author).toBeDefined();
      expect(res.body.author).not.toBe('');
      expect(res.body.tags).toEqual(['planning']);
      expect(res.body.stars).toBe(0);
      expect(res.body.downloads).toBe(0);
      expect(res.body.modelId).toBe('qwen-plus');
    });

    it('should publish agent without optional fields', async () => {
      const res = await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          name: 'Minimal',
          description: 'Minimal agent',
          dna: '{}',
        })
        .expect(201);

      expect(res.body.tags).toEqual([]);
      expect(res.body.modelId).toBeUndefined();
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/marketplace')
        .send({ name: 'X', description: 'X', dna: '{}' })
        .expect(401);
    });

    it('should reject invalid payload', async () => {
      await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: '', description: '', dna: '' })
        .expect(400);
    });
  });

  describe('GET /marketplace', () => {
    it('should list all agents', async () => {
      const res = await request(app.getHttpServer())
        .get('/marketplace')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(res.body[0].stars).toBeGreaterThanOrEqual(0);
    });

    it('should search by name', async () => {
      const res = await request(app.getHttpServer())
        .get('/marketplace?search=Minimal')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.every((a: any) => a.name.includes('Minimal'))).toBe(true);
    });

    it('should filter by tag', async () => {
      const res = await request(app.getHttpServer())
        .get('/marketplace?tag=coding')
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
      expect(res.body.every((a: any) => a.tags.includes('coding'))).toBe(true);
    });

    it('should respect limit and offset', async () => {
      const res = await request(app.getHttpServer())
        .get('/marketplace?limit=1&offset=0')
        .expect(200);

      expect(res.body.length).toBe(1);
    });
  });

  describe('GET /marketplace/:id', () => {
    it('should return agent by id', async () => {
      const res = await request(app.getHttpServer())
        .get(`/marketplace/${agentId}`)
        .expect(200);

      expect(res.body.id).toBe(agentId);
      expect(res.body.name).toBe('Test Agent');
    });

    it('should return 404 for non-existent agent', async () => {
      await request(app.getHttpServer())
        .get('/marketplace/nonexistent')
        .expect(404);
    });
  });

  describe('POST /marketplace/:id/star', () => {
    it('should increment stars', async () => {
      const before = await request(app.getHttpServer())
        .get(`/marketplace/${agentId}`);
      const starsBefore = before.body.stars;

      const res = await request(app.getHttpServer())
        .post(`/marketplace/${agentId}/star`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(201);

      expect(res.body.stars).toBe(starsBefore + 1);
    });

    it('should return 404 for non-existent agent', async () => {
      await request(app.getHttpServer())
        .post('/marketplace/nonexistent/star')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post(`/marketplace/${agentId}/star`)
        .expect(401);
    });
  });

  describe('POST /marketplace/:id/download', () => {
    it('should return download count', async () => {
      const before = await request(app.getHttpServer())
        .get(`/marketplace/${agentId}`);
      const downloadsBefore = before.body.downloads;

      const res = await request(app.getHttpServer())
        .post(`/marketplace/${agentId}/download`)
        .expect(201);

      expect(res.body.downloads).toBe(downloadsBefore + 1);
    });

    it('should return 404 for non-existent agent', async () => {
      await request(app.getHttpServer())
        .post('/marketplace/nonexistent/download')
        .expect(404);
    });
  });

  describe('DELETE /marketplace/:id', () => {
    it('should delete own agent', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ name: 'To Delete', description: 'Temp', dna: '{}' });
      const id = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/marketplace/${id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/marketplace/${id}`)
        .expect(404);
    });

    it('should not delete another user agent', async () => {
      const createRes = await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'User B Agent', description: 'B', dna: '{}' });
      const userBAgentId = createRes.body.id;

      await request(app.getHttpServer())
        .delete(`/marketplace/${userBAgentId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);

      await request(app.getHttpServer())
        .get(`/marketplace/${userBAgentId}`)
        .expect(200);
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .delete(`/marketplace/${agentId}`)
        .expect(401);
    });
  });
});