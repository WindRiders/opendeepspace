import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ShareService } from './share.service';

describe('ShareService', () => {
  let service: ShareService;
  const userId = 'user-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShareService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => {
              if (key === 'SHARE_DB_PATH') return ':memory:';
              return fallback;
            },
          },
        },
      ],
    }).compile();

    service = module.get<ShareService>(ShareService);
    service.onModuleInit();
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('createShare', () => {
    it('should create a share with correct fields', () => {
      const share = service.createShare('dna', 'My Chat', '{}', userId);

      expect(share.id).toHaveLength(8);
      expect(share.type).toBe('dna');
      expect(share.title).toBe('My Chat');
      expect(share.payload).toBe('{}');
      expect(share.createdBy).toBe(userId);
      expect(share.viewCount).toBe(0);
      expect(share.expiresAt).toBeUndefined();
    });

    it('should set expiresAt when ttlDays is provided', () => {
      const share = service.createShare('trace', 'Test', '{}', userId, 7);
      expect(share.expiresAt).toBeDefined();
      // Should be ~7 days from now
      expect(share.expiresAt! - share.createdAt).toBeCloseTo(7 * 86400, -2);
    });
  });

  describe('getShare', () => {
    it('should get a share by id', () => {
      const created = service.createShare('dna', 'Title', 'data', userId);
      const fetched = service.getShare(created.id);

      expect(fetched?.id).toBe(created.id);
      expect(fetched?.title).toBe('Title');
    });

    it('should increment view count on get', () => {
      const created = service.createShare('dna', 'Title', 'data', userId);

      const first = service.getShare(created.id);
      expect(first?.viewCount).toBe(1);

      const second = service.getShare(created.id);
      expect(second?.viewCount).toBe(2);
    });

    it('should return null for expired share', () => {
      const share = service.createShare('dna', 'Expired', '{}', userId, -1); // TTL -1 = expired immediately

      // Manually set expires_at in the past for reliable testing
      const now = Math.floor(Date.now() / 1000);
      (service as any).db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(now - 3600, share.id);

      const fetched = service.getShare(share.id);
      expect(fetched).toBeNull();
    });

    it('should return null for non-existent share', () => {
      expect(service.getShare('nonexist')).toBeNull();
    });
  });

  describe('listShares', () => {
    it('should list shares for user', () => {
      service.createShare('dna', 'Chat 1', '{}', userId);
      service.createShare('trace', 'Session 1', '{}', userId);

      const shares = service.listShares(userId);
      expect(shares).toHaveLength(2);
    });

    it('should filter expired shares', () => {
      const share = service.createShare('dna', 'Expired', '{}', userId);
      const now = Math.floor(Date.now() / 1000);
      (service as any).db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(now - 3600, share.id);

      const shares = service.listShares(userId);
      expect(shares).toHaveLength(0);
    });

    it('should isolate by user', () => {
      service.createShare('dna', 'Mine', '{}', userId);
      service.createShare('dna', 'Theirs', '{}', 'other');

      const shares = service.listShares(userId);
      expect(shares).toHaveLength(1);
      expect(shares[0].title).toBe('Mine');
    });
  });

  describe('deleteShare', () => {
    it('should delete a share', () => {
      const share = service.createShare('dna', 'To delete', '{}', userId);
      const ok = service.deleteShare(share.id, userId);

      expect(ok).toBe(true);
      expect(service.getShare(share.id)).toBeNull();
    });

    it('should return false for non-existent share', () => {
      expect(service.deleteShare('nope', userId)).toBe(false);
    });

    it('should not allow deletion by another user', () => {
      const share = service.createShare('dna', 'Mine', '{}', userId);
      expect(service.deleteShare(share.id, 'other')).toBe(false);
      expect(service.getShare(share.id)).not.toBeNull();
    });
  });
});