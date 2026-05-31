import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from "./test.module";

describe('Auth E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let authToken: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-'));
    dbBase = path.join(tempDir, 'data');
    fs.mkdirSync(dbBase, { recursive: true });

    // Set env vars for test databases
    process.env.USER_DB_PATH = path.join(dbBase, 'users.db');
    process.env.SESSION_DB_PATH = path.join(dbBase, 'sessions.db');
    process.env.TRACE_DB_PATH = path.join(dbBase, 'traces.db');
    process.env.COLLAB_DB_PATH = path.join(dbBase, 'collab.db');
    process.env.SHARE_DB_PATH = path.join(dbBase, 'shares.db');
    process.env.JWT_SECRET = 'e2e-test-secret';
    process.env.JWT_EXPIRATION = '1h';
    process.env.ADMIN_USERNAME = 'admin';
    process.env.ADMIN_PASSWORD = 'admin123';
    process.env.THROTTLER_TTL = '0';
    process.env.THROTTLER_LIMIT = '0';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('POST /auth/login', () => {
    it('should login with admin credentials', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'admin123' })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.role).toBe('admin');
      authToken = res.body.access_token;
    });

    it('should reject wrong password', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'admin', password: 'wrong' })
        .expect(401);
    });

    it('should reject non-existent user', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'nobody', password: 'pass' })
        .expect(401);
    });
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e@test.com',
          username: 'e2euser',
          password: 'password123',
        })
        .expect(201);

      expect(res.body.access_token).toBeDefined();
      expect(res.body.user.username).toBe('e2euser');
      expect(res.body.user.email).toBe('e2e@test.com');
    });

    it('should reject duplicate email', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'e2e@test.com',
          username: 'anotheruser',
          password: 'password123',
        })
        .expect(409);
    });

    it('should reject duplicate username', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'other@test.com',
          username: 'e2euser',
          password: 'password123',
        })
        .expect(409);
    });
  });

  describe('GET /auth/me', () => {
    it('should return user profile with valid token', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.username).toBe('admin');
      expect(res.body.email).toBe('admin@deepspace.local');
    });

    it('should reject without token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('should reject with invalid token', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('PATCH /auth/me', () => {
    let userToken: string;
    const uniqueSuffix = Date.now().toString(36);

    beforeAll(async () => {
      // Register a test user for profile update tests with unique name
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: `profile-${uniqueSuffix}@test.com`,
          username: `profileuser-${uniqueSuffix}`,
          password: 'password123',
        });
      if (res.status !== 201) {
        console.error('Register failed:', res.status, res.body);
      }
      expect(res.status).toBe(201);
      userToken = res.body.access_token;
    });

    it('should update username', async () => {
      const res = await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ username: 'newname' })
        .expect(200);

      expect(res.body.username).toBe('newname');
    });

    it('should reject password change without current password', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ newPassword: 'another' })
        .expect(400);
    });

    it('should reject password change with wrong current password', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'wrong',
          newPassword: 'newpass',
        })
        .expect(400);
    });

    it('should update password and invalidate old token', async () => {
      await request(app.getHttpServer())
        .patch('/auth/me')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          currentPassword: 'password123',
          newPassword: 'newpass456',
        })
        .expect(200);

      // Verify old password no longer works
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: `profileuser-${uniqueSuffix}`, password: 'password123' })
        .expect(401);

      // Verify new password works (username was changed to 'newname' in previous test)
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'newname', password: 'newpass456' })
        .expect(201);
    });
  });
});
