import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TestAppModule as AppModule } from './test.module';

describe('Plugins E2E', () => {
  let app: INestApplication;
  let tempDir: string;
  let dbBase: string;
  let pluginDir: string;
  let installedPluginId: string;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-e2e-plugins-'));
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

    // Create a minimal test plugin directory
    pluginDir = path.join(tempDir, 'test-plugin');
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.writeFileSync(
      path.join(pluginDir, 'plugin.json'),
      JSON.stringify({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin for E2E',
        author: 'e2e-tester',
        enabled: true,
        tools: [],
      }),
    );

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

  describe('GET /plugins', () => {
    it('should return plugin list as array', async () => {
      const res = await request(app.getHttpServer())
        .get('/plugins')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('POST /plugins/install', () => {
    it('should install a plugin from directory', async () => {
      const res = await request(app.getHttpServer())
        .post('/plugins/install')
        .send({ dirPath: pluginDir })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.id).toBe('test-plugin');
      expect(res.body.name).toBe('Test Plugin');
      expect(res.body.toolCount).toBe(0);
      installedPluginId = res.body.id;
    });

    it('should return error for missing dirPath', async () => {
      const res = await request(app.getHttpServer())
        .post('/plugins/install')
        .send({})
        .expect(201);

      expect(res.body.error).toBe('dirPath is required');
    });

    it('should return error for invalid plugin directory', async () => {
      const res = await request(app.getHttpServer())
        .post('/plugins/install')
        .send({ dirPath: '/nonexistent/path' })
        .expect(201);

      expect(res.body.error).toContain('Failed to install plugin');
    });
  });

  describe('POST /plugins/:pluginId/reload', () => {
    it('should reload an installed plugin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/plugins/${installedPluginId}/reload`)
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.pluginId).toBe(installedPluginId);
    });

    it('should return error for non-existent plugin', async () => {
      const res = await request(app.getHttpServer())
        .post('/plugins/nonexistent/reload')
        .expect(201);

      expect(res.body.error).toBe('Plugin not found');
    });
  });

  describe('POST /plugins/:pluginId/toggle', () => {
    it('should disable a plugin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/plugins/${installedPluginId}/toggle`)
        .send({ enabled: false })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.enabled).toBe(false);
    });

    it('should re-enable a plugin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/plugins/${installedPluginId}/toggle`)
        .send({ enabled: true })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.enabled).toBe(true);
    });

    it('should return error for non-existent plugin', async () => {
      const res = await request(app.getHttpServer())
        .post('/plugins/nonexistent/toggle')
        .send({ enabled: false })
        .expect(201);

      expect(res.body.error).toBe('Plugin not found');
    });
  });

  describe('plugin appears in list after install', () => {
    it('should include installed plugin in list', async () => {
      const res = await request(app.getHttpServer())
        .get('/plugins')
        .expect(200);

      const found = res.body.find((p: any) => p.id === installedPluginId);
      expect(found).toBeDefined();
      expect(found.name).toBe('Test Plugin');
      expect(found.enabled).toBe(true);
    });
  });
});