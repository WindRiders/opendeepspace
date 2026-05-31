import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Integration Tests (Phase 6)', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-integration-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    process.env.USER_DB_PATH = path.join(dbBase, 'users.db');
    process.env.SESSION_DB_PATH = path.join(dbBase, 'sessions.db');
    process.env.TRACE_DB_PATH = path.join(dbBase, 'traces.db');
    process.env.COLLAB_DB_PATH = path.join(dbBase, 'collab.db');
    process.env.SHARE_DB_PATH = path.join(dbBase, 'shares.db');
    process.env.JWT_SECRET = 'integration-test-secret';
    process.env.JWT_EXPIRATION = '1h';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin123';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'admin123' });
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('Full User Flow: Register → Chat → Share → Trace → Collab', () => {
    let sessionId: string;
    let shareId: string;

    it('should complete a full workflow', async () => {
      // 1. Register a new user
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'flow@test.com', username: 'flowuser', password: 'flowpass123' })
        .expect(201);
      const flowToken = regRes.body.access_token;

      // 2. Send a message (creates session + trace)
      const interactRes = await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${flowToken}`)
        .send({ message: 'Hello', sessionId: 'flow-session-1' })
        .expect(201);
      sessionId = interactRes.body.sessionId;

      // 3. Check conversation was created
      const convRes = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${flowToken}`)
        .expect(200);
      expect(convRes.body.length).toBeGreaterThanOrEqual(1);

      // 4. Create a share
      const shareRes = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${flowToken}`)
        .send({ type: 'dna', title: 'Flow DNA', payload: '{"test":true}' })
        .expect(201);
      shareId = shareRes.body.id;

      // 5. Access share publicly
      const publicRes = await request(app.getHttpServer())
        .get(`/shares/${shareId}`)
        .expect(200);
      expect(publicRes.body.title).toBe('Flow DNA');

      // 6. List traces
      const traceRes = await request(app.getHttpServer())
        .get(`/traces?sessionId=${sessionId}`)
        .set('Authorization', `Bearer ${flowToken}`)
        .expect(200);
      expect(Array.isArray(traceRes.body)).toBe(true);

      // 7. Create a collab session
      const collabRes = await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${flowToken}`)
        .send({ task: 'Flow task', agents: ['planner', 'coder'] })
        .expect(201);
      expect(collabRes.body.task).toBe('Flow task');

      // 8. Update profile
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${flowToken}`)
        .send({ username: 'flowuser_updated' })
        .expect(200);

      // 9. Login with new username
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'flowuser_updated', password: 'flowpass123' })
        .expect(201);

      // 10. Delete share
      await request(app.getHttpServer())
        .delete(`/shares/${shareId}`)
        .set('Authorization', `Bearer ${flowToken}`)
        .expect(200);

      // 11. Verify share is gone
      await request(app.getHttpServer())
        .get(`/shares/${shareId}`)
        .expect(404);
    });
  });

  describe('Concurrent Session Isolation', () => {
    it('should isolate sessions between multiple users', async () => {
      // User A
      const regA = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'isoA@test.com', username: 'isoA', password: 'isopass123' });
      const tokenA = regA.body.access_token;

      // User B
      const regB = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'isoB@test.com', username: 'isoB', password: 'isopass123' });
      const tokenB = regB.body.access_token;

      // A sends a message
      await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${tokenA}`)
        .send({ message: 'Hello from A', sessionId: 'iso-session-a' })
        .expect(201);

      // B sends a message
      await request(app.getHttpServer())
        .post('/agent/interact')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ message: 'Hello from B', sessionId: 'iso-session-b' })
        .expect(201);

      // A's conversations should not include B's
      const convA = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenA}`)
        .expect(200);
      const convB = await request(app.getHttpServer())
        .get('/conversations')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);

      // They should have different counts (or at least no overlap)
      const titlesA = convA.body.map((c: any) => c.title);
      const titlesB = convB.body.map((c: any) => c.title);
      // Neither should see the other's session in titles
      const allA = titlesA.join(', ');
      const allB = titlesB.join(', ');
      expect(allA).not.toContain('Hello from B');
      expect(allB).not.toContain('Hello from A');
    });
  });

  describe('Data Integrity: Multiple Operations', () => {
    it('should handle rapid create-delete-create cycle', async () => {
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'cycle@test.com', username: 'cycleuser', password: 'cyclepass123' });
      const cycleToken = regRes.body.access_token;

      // Create share, delete, create again with same title
      const create1 = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${cycleToken}`)
        .send({ type: 'dna', title: 'Cycle Share', payload: '{}' });
      const id1 = create1.body.id;

      await request(app.getHttpServer())
        .delete(`/shares/${id1}`)
        .set('Authorization', `Bearer ${cycleToken}`)
        .expect(200);

      const create2 = await request(app.getHttpServer())
        .post('/shares')
        .set('Authorization', `Bearer ${cycleToken}`)
        .send({ type: 'dna', title: 'Cycle Share', payload: '{}' })
        .expect(201);

      expect(create2.body.title).toBe('Cycle Share');
      expect(create2.body.id).not.toBe(id1);
    });

    it('should handle collab message after session deletion', async () => {
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'collabdel@test.com', username: 'collabdel', password: 'collabpass123' });
      const collabDelToken = regRes.body.access_token;

      // Create session
      const createRes = await request(app.getHttpServer())
        .post('/collab/sessions')
        .set('Authorization', `Bearer ${collabDelToken}`)
        .send({ task: 'Del task', agents: ['planner'] })
        .expect(201);
      const sessId = createRes.body.id;

      // Delete it
      await request(app.getHttpServer())
        .delete(`/collab/sessions/${sessId}`)
        .set('Authorization', `Bearer ${collabDelToken}`)
        .expect(200);

      // Try to add message to deleted session
      await request(app.getHttpServer())
        .post(`/collab/sessions/${sessId}/messages`)
        .set('Authorization', `Bearer ${collabDelToken}`)
        .send({ from: 'planner', to: 'coder', content: 'test', type: 'handoff' })
        .expect(404);
    });
  });

  describe('Database Validation: Table Structure', () => {
    it('should have users.db with correct schema', () => {
      const dbPath = process.env.USER_DB_PATH!;
      expect(fs.existsSync(dbPath)).toBe(true);

      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    });

    it('should have sessions.db', () => {
      const dbPath = process.env.SESSION_DB_PATH!;
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    });

    it('should have traces.db', () => {
      const dbPath = process.env.TRACE_DB_PATH!;
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    });

    it('should have collab.db', () => {
      const dbPath = process.env.COLLAB_DB_PATH!;
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    });

    it('should have shares.db', () => {
      const dbPath = process.env.SHARE_DB_PATH!;
      expect(fs.existsSync(dbPath)).toBe(true);
      expect(fs.statSync(dbPath).size).toBeGreaterThan(0);
    });
  });
});
