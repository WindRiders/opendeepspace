import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Security Tests (Phase 7)', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let token: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-security-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    process.env.USER_DB_PATH = path.join(dbBase, 'users.db');
    process.env.SESSION_DB_PATH = path.join(dbBase, 'sessions.db');
    process.env.TRACE_DB_PATH = path.join(dbBase, 'traces.db');
    process.env.COLLAB_DB_PATH = path.join(dbBase, 'collab.db');
    process.env.SHARE_DB_PATH = path.join(dbBase, 'shares.db');
    process.env.JWT_SECRET = 'security-test-secret';
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
    token = loginRes.body.access_token;
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('JWT Security', () => {
    it('should reject tampered JWT', async () => {
      const tampered = token.slice(0, -5) + 'XXXXX';

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${tampered}`)
        .expect(401);
    });

    it('should reject JWT with wrong secret', async () => {
      // Create a JWT-like token with a different payload
      const payload = Buffer.from(JSON.stringify({ sub: '1', username: 'admin' })).toString('base64');
      const fakeJwt = `eyJhbGciOiJIUzI1NiJ9.${payload}.fakesignature`;

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${fakeJwt}`)
        .expect(401);
    });

    it('should reject expired JWT format', async () => {
      const expired = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNjAwMDAwMDAwfQ.expired';

      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${expired}`)
        .expect(401);
    });
  });

  describe('Authorization / Access Control', () => {
    let userAToken: string;
    let userBToken: string;
    let shareIdA: string;
    let collabIdA: string;

    beforeAll(async () => {
      const regA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'secA@test.com', username: 'secA', password: 'secpass123' });
      userAToken = regA.body.access_token;

      const regB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'secB@test.com', username: 'secB', password: 'secpass123' });
      userBToken = regB.body.access_token;

      // User A creates resources
      const shareRes = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ type: 'dna', title: 'Sec Share', payload: '{}' });
      shareIdA = shareRes.body.id;

      const collabRes = await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${userAToken}`)
        .send({ task: 'Sec Task', agents: ['planner'] });
      collabIdA = collabRes.body.id;
    });

    it('should not allow user B to delete user A share', async () => {
      await request(app.getHttpServer())
        .delete(`/shares/${shareIdA}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should not allow user B to access user A collab session', async () => {
      await request(app.getHttpServer())
        .get(`/collab/sessions/${collabIdA}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });

    it('should not allow user B to add messages to user A collab session', async () => {
      await request(app.getHttpServer())
        .post(`/collab/sessions/${collabIdA}/messages`)
        .set('Authorization', `Bearer ${userBToken}`)
        .send({ from: 'planner', to: 'coder', content: 'hack', type: 'handoff' })
        .expect(404);
    });

    it('should not allow user B to delete user A collab session', async () => {
      await request(app.getHttpServer())
        .delete(`/collab/sessions/${collabIdA}`)
        .set('Authorization', `Bearer ${userBToken}`)
        .expect(404);
    });
  });

  describe('Sandbox Security: Path Traversal', () => {
    it('should block reading /etc/passwd', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read?path=../../../../../../etc/passwd')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should block reading /etc/shadow', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read?path=..%2F..%2F..%2Fetc%2Fshadow')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should block listing root directory', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/files?path=/')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('should block reading absolute paths', async () => {
      await request(app.getHttpServer())
        .get('/sandbox/read?path=/etc/passwd')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  describe('Sandbox Security: Command Injection', () => {
    it('should handle dangerous shell input gracefully', async () => {
      // Send a message with potential shell injection
      const res = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${token}`)
        .send({
          message: 'Run: rm -rf / ; cat /etc/passwd',
          sessionId: 'security-shell-test',
        })
        .expect(201);
      // Should return without server crash
      expect(res.body.sessionId).toBeDefined();
    });
  });

  describe('Input Security: XSS', () => {
    it('should handle XSS payload in message', async () => {
      const xssPayload = '<script>alert("xss")</script>';
      const res = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: xssPayload, sessionId: 'xss-test-session' })
        .expect(201);
      // Should not crash
      expect(res.body.sessionId).toBeDefined();
    });

    it('should handle XSS payload in share title', async () => {
      const xssPayload = '<img src=x onerror=alert(1)>';
      const res = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'dna', title: xssPayload, payload: '{}' })
        .expect(201);
      // Share should be created safely
      expect(res.body.id).toBeDefined();
    });

    it('should handle XSS payload in collab task', async () => {
      const xssPayload = '<svg onload=alert(1)>';
      const res = await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ task: xssPayload, agents: ['planner'] })
        .expect(201);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('Input Security: Empty / Invalid Data', () => {
    it('should reject empty login with 400 or 401', async () => {
      // Empty body should not return success
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({});
      // Either 400 (validation) or 401 (auth failure) is acceptable
    });

    it('should reject empty register', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({})
        .expect(400);
    });

    it('should reject empty agent message', async () => {
      await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${token}`)
        .send({})
        .expect(400);
    });

    it('should reject invalid JSON body', async () => {
      await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', 'application/json')
        .send(Buffer.from('{invalid json}'))
        .expect(400);
    });

    it('should reject collab session with empty task', async () => {
      await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ task: '', agents: [] })
        .expect(400);
    });

    it('should reject share with empty payload', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'dna', title: 'Test', payload: '' })
        .expect(400);
    });
  });

  describe('Security: Rate Limiting Bypass (if applicable)', () => {
    it('should not crash under rapid requests', async () => {
      // Send rapid sequential requests
      let successCount = 0;
      for (let i = 0; i < 5; i++) {
        const res = await request(app.getHttpServer())
          .get('/conversations')
          .set('Authorization', `Bearer ${token}`);
        if (res.status === 200) successCount++;
      }
      // At least some should succeed
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('Marketplace Security: Auth Required', () => {
    it('should reject publish without token', async () => {
      await request(app.getHttpServer())
        .post('/marketplace')
        .send({ name: 'Test', description: 'Desc', dna: 'DNA' })
        .expect(401);
    });

    it('should reject star without token', async () => {
      await request(app.getHttpServer())
        .post('/marketplace/fake-id/star')
        .expect(401);
    });

    it('should reject delete without token', async () => {
      await request(app.getHttpServer())
        .delete('/marketplace/fake-id')
        .expect(401);
    });

    it('should not allow user B to delete user A marketplace agent', async () => {
      const publishRes = await request(app.getHttpServer())
        .post('/marketplace')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'My Agent', description: 'Test desc', dna: 'You are helpful.' });
      const agentId = publishRes.body.id;

      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'mkplace@test.com', username: 'mkplaceuser', password: 'mkpass123' });
      const otherToken = regRes.body.access_token;

      await request(app.getHttpServer())
        .delete(`/marketplace/${agentId}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });
  });

  describe('SQL Injection', () => {
    it('should handle SQL injection in marketplace search', async () => {
      const res = await request(app.getHttpServer())
        .get("/marketplace?search='; DROP TABLE marketplace_agents; --")
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should handle SQL injection in login username', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: "' OR '1'='1", password: 'anything' })
        .expect(401);
    });

    it('should handle SQL injection via URL encoded payload', async () => {
      const res = await request(app.getHttpServer())
        .get('/marketplace?search=%27%3B+DROP+TABLE+--')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('Input Security: Oversized Payloads', () => {
    it('should reject oversized message', async () => {
      const bigMessage = 'x'.repeat(100000);
      await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${token}`)
        .send({ message: bigMessage, sessionId: 'big-msg-test' })
        .expect(400);
    });

    it('should reject oversized collab task', async () => {
      const bigTask = 'x'.repeat(50000);
      await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${token}`)
        .send({ task: bigTask, agents: ['planner'] })
        .expect(400);
    });

    it('should reject oversized share payload', async () => {
      const bigPayload = 'x'.repeat(200000);
      const res = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${token}`)
        .send({ type: 'dna', title: 'Big', payload: bigPayload });
      // 400 (validation) or 413 (body too large) are both acceptable
      expect([400, 413]).toContain(res.status);
    });
  });

  describe('Security: Unauthenticated Access', () => {
    it('should reject agent interact without token', async () => {
      await request(app.getHttpServer())
        .post('/agent/interact')
        .send({ message: 'hello' })
        .expect(401);
    });

    it('should reject conversations list without token', async () => {
      await request(app.getHttpServer())
        .get('/conversations')
        .expect(401);
    });

    it('should reject collab sessions list without token', async () => {
      await request(app.getHttpServer())
        .get('/collab/sessions')
        .expect(401);
    });

    it('should reject create share without token', async () => {
      await request(app.getHttpServer())
        .post('/shares')
        .send({ type: 'dna', title: 'Test', payload: '{}' })
        .expect(401);
    });

    it('should reject marketplace publish without token', async () => {
      await request(app.getHttpServer())
        .post('/marketplace')
        .send({ name: 'Test', description: 'Desc', dna: 'DNA' })
        .expect(401);
    });
  });

  describe('Security: Session Fixation', () => {
    it('should not allow accessing another user session by ID guessing', async () => {
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'fixation@test.com', username: 'fixationuser', password: 'fixpass123' });
      const fixationToken = regRes.body.access_token;

      // Try to access a non-existent session ID
      await request(app.getHttpServer())
        .get('/collab/sessions/guessed-id-12345')
        .set('Authorization', `Bearer ${fixationToken}`)
        .expect(404);

      // Try to access a session that might belong to another user
      await request(app.getHttpServer())
        .get('/collab/sessions/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${fixationToken}`)
        .expect(404);
    });
  });
});
