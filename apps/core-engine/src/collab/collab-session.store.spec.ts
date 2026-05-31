import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { CollabSessionStore } from './collab-session.store';

describe('CollabSessionStore', () => {
  let store: CollabSessionStore;
  let mod: TestingModule;
  const userId = 'user-1';

  beforeEach(async () => {
    mod = await Test.createTestingModule({
      providers: [
        CollabSessionStore,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback: string) => {
              if (key === 'COLLAB_DB_PATH') return ':memory:';
              return fallback;
            },
          },
        },
      ],
    }).compile();

    store = mod.get<CollabSessionStore>(CollabSessionStore);
    store.onModuleInit();
  });

  afterEach(() => {
    store.onModuleDestroy();
  });

  it('should be defined', () => {
    expect(store).toBeDefined();
  });

  describe('createSession', () => {
    it('should create a session', () => {
      const session = store.createSession('Test task', ['planner', 'coder'], userId);
      expect(session.id).toBeDefined();
      expect(session.task).toBe('Test task');
      expect(session.agents).toEqual(['planner', 'coder']);
      expect(session.status).toBe('planning');
      expect(session.messages).toEqual([]);
    });
  });

  describe('getSession', () => {
    it('should retrieve an existing session with messages', () => {
      const created = store.createSession('Task', ['planner'], userId);
      const fetched = store.getSession(created.id, userId);
      expect(fetched?.id).toBe(created.id);
    });

    it('should return null for non-existent session', () => {
      expect(store.getSession('bad-id', userId)).toBeNull();
    });

    it('should return null for wrong user', () => {
      const created = store.createSession('Task', ['planner'], userId);
      expect(store.getSession(created.id, 'other-user')).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('should list sessions ordered by created_at DESC', async () => {
      store.createSession('First', ['planner'], userId);
      await new Promise((r) => setTimeout(r, 2));
      store.createSession('Second', ['coder'], userId);

      const sessions = store.listSessions(userId);
      expect(sessions).toHaveLength(2);
      expect(sessions[0].task).toBe('Second');
      expect(sessions[1].task).toBe('First');
    });

    it('should isolate by user', () => {
      store.createSession('User A', ['planner'], userId);
      store.createSession('User B', ['coder'], 'user-b');
      expect(store.listSessions(userId)).toHaveLength(1);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', () => {
      const created = store.createSession('To delete', ['planner'], userId);
      expect(store.deleteSession(created.id, userId)).toBe(true);
      expect(store.getSession(created.id, userId)).toBeNull();
    });

    it('should return false for non-existent session', () => {
      expect(store.deleteSession('bad', userId)).toBe(false);
    });
  });

  describe('addMessage', () => {
    it('should add a message to a session', () => {
      const session = store.createSession('Task', ['planner'], userId);
      const msg = store.addMessage(session.id, userId, 'planner', 'coder', 'Here is the plan', 'handoff');
      expect(msg?.from).toBe('planner');
      expect(msg?.content).toBe('Here is the plan');

      const updated = store.getSession(session.id, userId);
      expect(updated?.messages).toHaveLength(1);
    });

    it('should return null for non-existent session', () => {
      expect(store.addMessage('bad', userId, 'planner', 'coder', 'test', 'task')).toBeNull();
    });
  });

  describe('updateStatus', () => {
    it('should update session status', () => {
      const session = store.createSession('Task', ['planner'], userId);
      expect(store.updateStatus(session.id, userId, 'executing')).toBe(true);

      const updated = store.getSession(session.id, userId);
      expect(updated?.status).toBe('executing');
    });

    it('should return false for non-existent session', () => {
      expect(store.updateStatus('bad', userId, 'complete')).toBe(false);
    });
  });

  describe('getLastMessage', () => {
    it('should return the most recent message from an agent', async () => {
      const session = store.createSession('Task', ['planner'], userId);
      store.addMessage(session.id, userId, 'planner', 'coder', 'First msg', 'handoff');
      await new Promise((r) => setTimeout(r, 2));
      store.addMessage(session.id, userId, 'planner', 'coder', 'Second msg', 'response');

      const last = store.getLastMessage(session.id, 'planner');
      expect(last?.content).toBe('Second msg');
    });

    it('should return undefined when no messages exist', () => {
      const session = store.createSession('Task', ['planner'], userId);
      expect(store.getLastMessage(session.id, 'planner')).toBeUndefined();
    });
  });
});