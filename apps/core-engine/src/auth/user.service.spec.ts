import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const config: Record<string, string> = {
      USER_DB_PATH: ':memory:',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin123',
      ADMIN_EMAIL: 'admin@test.local',
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) => config[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('seeding', () => {
    it('should seed admin user on init', () => {
      const admin = service.findByUsername('admin');
      expect(admin).toBeDefined();
      expect(admin?.role).toBe('admin');
      expect(admin?.email).toBe('admin@test.local');
    });

    it('should not duplicate admin on second init', () => {
      const first = service.findByUsername('admin');
      service.onModuleInit();
      const second = service.findByUsername('admin');
      expect(second?.id).toBe(first?.id);
    });
  });

  describe('createUser', () => {
    it('should create a new user', async () => {
      const user = await service.createUser('alice@test.com', 'alice', 'password123');
      expect(user.email).toBe('alice@test.com');
      expect(user.username).toBe('alice');
      expect(user.role).toBe('user');
      expect(user.id).toMatch(/^user-/);
    });

    it('should hash the password', async () => {
      const user = await service.createUser('bob@test.com', 'bob', 'secret');
      expect(user.password_hash).not.toBe('secret');
      expect(user.password_hash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('findByEmail', () => {
    it('should find user by email', async () => {
      await service.createUser('eve@test.com', 'eve', 'pass');
      expect(service.findByEmail('eve@test.com')?.username).toBe('eve');
    });

    it('should return undefined for unknown email', () => {
      expect(service.findByEmail('nobody@test.com')).toBeUndefined();
    });
  });

  describe('findByUsername', () => {
    it('should find user by username', async () => {
      await service.createUser('test@test.com', 'testuser', 'pass');
      expect(service.findByUsername('testuser')?.email).toBe('test@test.com');
    });
  });

  describe('findById', () => {
    it('should find user by id', async () => {
      const created = await service.createUser('id@test.com', 'iduser', 'pass');
      expect(service.findById(created.id)?.username).toBe('iduser');
    });
  });

  describe('findByIdentifier', () => {
    it('should find by email', async () => {
      await service.createUser('dual@test.com', 'dual', 'pass');
      expect(service.findByIdentifier('dual@test.com')?.username).toBe('dual');
    });

    it('should find by username', async () => {
      await service.createUser('name@test.com', 'nameonly', 'pass');
      expect(service.findByIdentifier('nameonly')?.email).toBe('name@test.com');
    });
  });

  describe('validatePassword', () => {
    it('should return true for correct password', async () => {
      const user = await service.createUser('pw@test.com', 'pwuser', 'mypassword');
      expect(await service.validatePassword(user, 'mypassword')).toBe(true);
    });

    it('should return false for wrong password', async () => {
      const user = await service.createUser('wrong@test.com', 'wronguser', 'correct');
      expect(await service.validatePassword(user, 'wrongpass')).toBe(false);
    });
  });

  describe('updateLastLogin', () => {
    it('should set last_login_at', async () => {
      const user = await service.createUser('login@test.com', 'loginuser', 'pass');
      expect(user.last_login_at).toBeNull();
      service.updateLastLogin(user.id);
      expect(service.findById(user.id)?.last_login_at).not.toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should update username', async () => {
      const user = await service.createUser('prof@test.com', 'oldname', 'pass');
      const updated = service.updateProfile(user.id, { username: 'newname' });
      expect(updated?.username).toBe('newname');
    });

    it('should update avatar_url', async () => {
      const user = await service.createUser('av@test.com', 'avuser', 'pass');
      const updated = service.updateProfile(user.id, { avatar_url: 'https://example.com/av.jpg' });
      expect(updated?.avatar_url).toBe('https://example.com/av.jpg');
    });

    it('should return user unchanged when no fields provided', async () => {
      const user = await service.createUser('unch@test.com', 'unch', 'pass');
      const updated = service.updateProfile(user.id, {});
      expect(updated?.username).toBe('unch');
    });
  });

  describe('updatePassword', () => {
    it('should change password hash', async () => {
      const user = await service.createUser('cp@test.com', 'cpuser', 'oldpass');
      await service.updatePassword(user.id, 'newpass');
      const updated = service.findById(user.id)!;
      expect(await service.validatePassword(updated, 'oldpass')).toBe(false);
      expect(await service.validatePassword(updated, 'newpass')).toBe(true);
    });
  });

  describe('toProfile', () => {
    it('should convert UserRow to UserProfile', async () => {
      const user = await service.createUser('profile@test.com', 'profileuser', 'pass');
      const profile = service.toProfile(user);
      expect(profile.id).toBe(user.id);
      expect(profile.email).toBe(user.email);
      expect(profile.role).toBe(user.role);
    });
  });
});