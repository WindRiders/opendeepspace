import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { HumanMessage } from '@langchain/core/messages';
import { TestAppModule as AppModule } from "./test.module";
import { SessionService } from '../src/session/session.service';

describe('Conversations E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-convos-'));
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

    // Login as admin
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    tokenA = adminRes.body.access_token;
    const userIdA = adminRes.body.user.id;

    // Register second user
    const userRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'userb@test.com', username: 'userb', password: 'password123' });
    tokenB = userRes.body.access_token;
    const userIdB = userRes.body.user.id;

    // 直接用 SessionService 创建会话数据，避免走 LLM API
    const sessionService = app.get(SessionService);
    for (let i = 0; i < 3; i++) {
      sessionService.saveSession(
        `conv-a-${i}`, userIdA,
        [new HumanMessage(`message from user A ${i}`)],
      );
    }
    sessionService.saveSession(
      'conv-b-0', userIdB,
      [new HumanMessage('message from user B')],
    );
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('GET /conversations', () => {
    it('should list conversations for user A', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      expect(res.body.length).toBe(3);
      expect(res.body[0].title).toBeDefined();
      expect(res.body[0].messageCount).toBeGreaterThan(0);
    });

    it('should list conversations for user B', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      expect(res.body.length).toBe(1);
    });

    it('should reject without token', async () => {
      await request(app.getHttpServer()).get('/conversations').expect(401);
    });
  });

  describe('PATCH /conversations/:id/title', () => {
    let conversationId: string;

    beforeAll(async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`);
      conversationId = res.body[0].id;
    });

    it('should update title', async () => {
      await request(app.getHttpServer())
        .patch(`/conversations/${conversationId}/title`)
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'New Title' })
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`);
      const updated = listRes.body.find((c: any) => c.id === conversationId);
      expect(updated.title).toBe('New Title');
    });

    it('should reject for non-existent conversation', async () => {
      await request(app.getHttpServer())
        .patch('/conversations/nonexistent/title')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ title: 'New Title' })
        .expect(404);
    });

    it('should reject when updating another user conversation', async () => {
      await request(app.getHttpServer())
        .patch(`/conversations/${conversationId}/title`)
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ title: 'Hacked' })
        .expect(404);
    });
  });

  describe('DELETE /conversations/:id', () => {
    it('should delete a conversation', async () => {
      const res = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`);
      const countBefore = res.body.length;

      await request(app.getHttpServer())
        .delete(`/conversations/${res.body[0].id}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      const listRes = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`);
      expect(listRes.body.length).toBe(countBefore - 1);
    });

    it('should not delete another user conversation', async () => {
      const resB = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenB}`);
      const convBId = resB.body[0].id;

      await request(app.getHttpServer())
        .delete(`/conversations/${convBId}`)
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);

      // User B should still have their conversation
      const listResB = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenB}`);
      expect(listResB.body.length).toBe(1);
    });
  });
});
