import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Collab E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let tokenA: string;
  let tokenB: string;
  let collabSessionId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-collab-'));
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
      .send({ email: 'collabb@test.com', username: 'collabb', password: 'password123' });
    tokenB = userRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /collab/roles', () => {
    it('should return agent roles', async () => {
      const res = await request(app.getHttpServer())
        .get('/collab/roles')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.length).toBe(4);
      const roleNames = res.body.map((r: any) => r.role);
      expect(roleNames).toContain('planner');
      expect(roleNames).toContain('coder');
      expect(roleNames).toContain('reviewer');
      expect(roleNames).toContain('researcher');
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer()).get('/collab/roles').expect(401);
    });
  });

  describe('POST /collab/sessions', () => {
    it('should create a collaboration session', async () => {
      const res = await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          task: 'Build a REST API',
          agents: ['planner', 'coder', 'reviewer'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.task).toBe('Build a REST API');
      expect(res.body.status).toBe('planning');
      expect(res.body.agents).toEqual(['planner', 'coder', 'reviewer']);
      expect(res.body.messages.length).toBeGreaterThan(0);
      collabSessionId = res.body.id;
    });

    it('should reject without auth', async () => {
      await request(app.getHttpServer())
        .post('/collab/sessions')
        .send({ task: 'test', agents: ['planner'] })
        .expect(401);
    });
  });

  describe('GET /collab/sessions', () => {
    it('should list sessions', async () => {
      const res = await request(app.getHttpServer())
        .get('/collab/sessions')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.length).toBeGreaterThanOrEqual(1);
    });

    it('should not show other user sessions', async () => {
      const resB = await request(app.getHttpServer())
        .get('/collab/sessions')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(resB.body.length).toBe(0);
    });
  });

  describe('GET /collab/sessions/:id', () => {
    it('should get session details', async () => {
      const res = await request(app.getHttpServer())
        .get(`/collab/sessions/${collabSessionId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.id).toBe(collabSessionId);
      expect(res.body.messages).toBeDefined();
    });

    it('should return 404 for non-existent session', async () => {
      await request(app.getHttpServer())
        .get('/collab/sessions/nonexistent')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });

    it('should reject for another user session', async () => {
      await request(app.getHttpServer())
        .get(`/collab/sessions/${collabSessionId}`)
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(404);
    });
  });

  describe('POST /collab/sessions/:id/messages', () => {
    it('should add a message to session', async () => {
      const res = await request(app.getHttpServer())
        .post(`/collab/sessions/${collabSessionId}/messages`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          from: 'planner',
          to: 'coder',
          content: 'Please implement the endpoint',
          type: 'handoff',
        })
        .expect(201);

      expect(res.body.content).toBe('Please implement the endpoint');
    });

    it('should reject for non-existent session', async () => {
      await request(app.getHttpServer())
        .post('/collab/sessions/nonexistent/messages')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({
          from: 'planner',
          to: 'coder',
          content: 'test',
          type: 'handoff',
        })
        .expect(404);
    });

    it('should reject for another user session', async () => {
      await request(app.getHttpServer())
        .post(`/collab/sessions/${collabSessionId}/messages`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({
          from: 'planner',
          to: 'coder',
          content: 'test',
          type: 'handoff',
        })
        .expect(404);
    });
  });

  describe('DELETE /collab/sessions/:id', () => {
    it('should delete a session', async () => {
      await request(app.getHttpServer())
        .delete(`/collab/sessions/${collabSessionId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/collab/sessions/${collabSessionId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(404);
    });
  });
});
