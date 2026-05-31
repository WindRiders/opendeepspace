import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { SessionService } from './session.service';
import { HumanMessage, SystemMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { serializeMessages, deserializeMessages } from './session.serializer';

describe('SessionService', () => {
  let sessionService: SessionService;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'deepspace-session-test-'));
    const dbPath = path.join(tempDir, 'sessions.db');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, defaultValue?: string) => {
              const map: Record<string, string> = {
                SESSION_DB_PATH: dbPath,
                SESSION_TTL_HOURS: '24',
                MAX_SESSIONS_PER_USER: '10',
              };
              return map[key] ?? defaultValue;
            },
          },
        },
      ],
    }).compile();

    sessionService = module.get<SessionService>(SessionService);
    await sessionService.onModuleInit();
  });

  afterEach(() => {
    sessionService.onModuleDestroy();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('saveSession', () => {
    it('should save a new session with auto-generated title', () => {
      const messages = [
        new HumanMessage('帮我写一个快速排序'),
        new AIMessage('好的，这是一个快速排序实现'),
      ];

      sessionService.saveSession('session-1', 'user-1', messages);

      const saved = sessionService.getSession('session-1', 'user-1');
      expect(saved).not.toBeNull();
      expect(saved!.length).toBe(2);
      expect(saved![0].content).toBe('帮我写一个快速排序');
    });

    it('should update existing session with new messages', () => {
      const msg1 = [new HumanMessage('Hello')];
      const msg2 = [new HumanMessage('Hello'), new AIMessage('Hi'), new HumanMessage('World')];

      sessionService.saveSession('session-1', 'user-1', msg1);
      sessionService.saveSession('session-1', 'user-1', msg2);

      const saved = sessionService.getSession('session-1', 'user-1');
      expect(saved!.length).toBe(3);
    });

    it('should preserve non-empty title on update', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('Original title')]);
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('Changed title')]);

      sessionService.getSession('session-1', 'user-1');
      const summaries = sessionService.listConversations('user-1');
      expect(summaries[0].title).toBe('Original title');
    });

    it('should set title to empty string for system-only messages', () => {
      const messages = [new SystemMessage('You are an assistant')];
      sessionService.saveSession('session-1', 'user-1', messages);

      const summaries = sessionService.listConversations('user-1');
      expect(summaries[0].title).toBe('未命名对话');
    });

    it('should truncate title to 50 chars + ...', () => {
      const longMsg = 'a'.repeat(100);
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage(longMsg)]);

      const summaries = sessionService.listConversations('user-1');
      expect(summaries[0].title).toBe('a'.repeat(50) + '...');
    });
  });

  describe('getSession', () => {
    it('should return null for non-existent session', () => {
      const result = sessionService.getSession('nonexistent', 'user-1');
      expect(result).toBeNull();
    });

    it('should return null when querying with wrong userId', () => {
      const messages = [new HumanMessage('test')];
      sessionService.saveSession('session-1', 'user-1', messages);

      const result = sessionService.getSession('session-1', 'user-2');
      expect(result).toBeNull();
    });

    it('should return null for expired session', () => {
      const messages = [new HumanMessage('test')];
      sessionService.saveSession('session-1', 'user-1', messages);

      // Manually expire the session by setting expires_at to past
      const now = Math.floor(Date.now() / 1000);
      (sessionService as any).db
        .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
        .run(now - 100, 'session-1');

      const result = sessionService.getSession('session-1', 'user-1');
      expect(result).toBeNull();
    });

    it('should deserialize all message types correctly', () => {
      const messages = [
        new SystemMessage('system prompt'),
        new HumanMessage('human message'),
        new AIMessage('ai response'),
        new ToolMessage({ content: 'tool result', tool_call_id: 'tc-1' }),
      ];

      sessionService.saveSession('session-1', 'user-1', messages);
      const saved = sessionService.getSession('session-1', 'user-1');

      expect(saved![0]).toBeInstanceOf(SystemMessage);
      expect(saved![1]).toBeInstanceOf(HumanMessage);
      expect(saved![2]).toBeInstanceOf(AIMessage);
      expect(saved![3]).toBeInstanceOf(ToolMessage);
    });
  });

  describe('deleteSession', () => {
    it('should delete a session', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('test')]);
      sessionService.deleteSession('session-1', 'user-1');

      const result = sessionService.getSession('session-1', 'user-1');
      expect(result).toBeNull();
    });

    it('should not delete session with wrong userId', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('test')]);
      sessionService.deleteSession('session-1', 'user-2');

      const result = sessionService.getSession('session-1', 'user-1');
      expect(result).not.toBeNull();
    });
  });

  describe('countUserSessions and session limits', () => {
    it('should count active sessions correctly', () => {
      for (let i = 0; i < 5; i++) {
        sessionService.saveSession(`session-${i}`, 'user-1', [new HumanMessage('test')]);
      }
      expect(sessionService.countUserSessions('user-1')).toBe(5);
    });

    it('should not count expired sessions', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('test')]);
      const now = Math.floor(Date.now() / 1000);
      (sessionService as any).db
        .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
        .run(now - 100, 'session-1');

      expect(sessionService.countUserSessions('user-1')).toBe(0);
    });

    it('should return false when limit not reached', () => {
      for (let i = 0; i < 5; i++) {
        sessionService.saveSession(`session-${i}`, 'user-1', [new HumanMessage('test')]);
      }
      expect(sessionService.isSessionLimitReached('user-1')).toBe(false);
    });

    it('should return true when limit reached', () => {
      for (let i = 0; i < 10; i++) {
        sessionService.saveSession(`session-${i}`, 'user-1', [new HumanMessage('test')]);
      }
      expect(sessionService.isSessionLimitReached('user-1')).toBe(true);
    });
  });

  describe('cleanExpiredSessions', () => {
    it('should clean expired sessions', () => {
      sessionService.saveSession('expired-1', 'user-1', [new HumanMessage('old')]);
      const now = Math.floor(Date.now() / 1000);
      (sessionService as any).db
        .prepare('UPDATE sessions SET expires_at = ? WHERE id = ?')
        .run(now - 100, 'expired-1');

      sessionService.saveSession('active-1', 'user-1', [new HumanMessage('new')]);

      const cleaned = sessionService.cleanExpiredSessions();
      expect(cleaned).toBe(1);
      expect(sessionService.countUserSessions('user-1')).toBe(1);
    });

    it('should return 0 when no expired sessions', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('test')]);
      const cleaned = sessionService.cleanExpiredSessions();
      expect(cleaned).toBe(0);
    });
  });

  describe('listConversations', () => {
    it('should return empty array when no sessions', () => {
      const result = sessionService.listConversations('user-1');
      expect(result).toEqual([]);
    });

    it('should return conversations ordered by updated_at desc', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('first')]);
      // Manually set session-1 updated_at to past
      const now = Math.floor(Date.now() / 1000);
      (sessionService as any).db
        .prepare('UPDATE sessions SET updated_at = ? WHERE id = ?')
        .run(now - 100, 'session-1');

      sessionService.saveSession('session-2', 'user-1', [new HumanMessage('second')]);

      const result = sessionService.listConversations('user-1');
      expect(result.length).toBe(2);
      expect(result[0].title).toBe('second');
      expect(result[1].title).toBe('first');
    });

    it('should include message count', () => {
      sessionService.saveSession('session-1', 'user-1', [
        new HumanMessage('msg1'),
        new AIMessage('reply1'),
        new HumanMessage('msg2'),
      ]);

      const result = sessionService.listConversations('user-1');
      expect(result[0].messageCount).toBe(3);
    });

    it('should only return user own conversations', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('u1')]);
      sessionService.saveSession('session-2', 'user-2', [new HumanMessage('u2')]);

      const user1Convos = sessionService.listConversations('user-1');
      const user2Convos = sessionService.listConversations('user-2');
      expect(user1Convos.length).toBe(1);
      expect(user2Convos.length).toBe(1);
    });
  });

  describe('updateConversationTitle', () => {
    it('should update title successfully', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('original')]);
      const result = sessionService.updateConversationTitle('session-1', 'user-1', 'New Title');
      expect(result).toBe(true);

      const summaries = sessionService.listConversations('user-1');
      expect(summaries[0].title).toBe('New Title');
    });

    it('should return false for non-existent session', () => {
      const result = sessionService.updateConversationTitle('nonexistent', 'user-1', 'Title');
      expect(result).toBe(false);
    });

    it('should not update with wrong userId', () => {
      sessionService.saveSession('session-1', 'user-1', [new HumanMessage('original')]);
      sessionService.updateConversationTitle('session-1', 'user-2', 'Hacked');

      const summaries = sessionService.listConversations('user-1');
      expect(summaries[0].title).toBe('original');
    });
  });

  describe('serializeMessages / deserializeMessages', () => {
    it('should roundtrip HumanMessage', () => {
      const original = [new HumanMessage('hello')];
      const serialized = serializeMessages(original);
      const deserialized = deserializeMessages(serialized);
      expect(deserialized[0]).toBeInstanceOf(HumanMessage);
      expect(deserialized[0].content).toBe('hello');
    });

    it('should roundtrip AIMessage with tool_calls', () => {
      const original = [new AIMessage('thinking')];
      (original[0] as any).tool_calls = [{ name: 'read_file', args: { filePath: 'test.py' } }];

      const serialized = serializeMessages(original);
      const deserialized = deserializeMessages(serialized);

      expect((deserialized[0] as any).tool_calls).toBeDefined();
    });

    it('should roundtrip ToolMessage', () => {
      const original = [new ToolMessage({ content: 'result', tool_call_id: 'tc-1' })];
      const serialized = serializeMessages(original);
      const deserialized = deserializeMessages(serialized);
      expect(deserialized[0]).toBeInstanceOf(ToolMessage);
    });

    it('should roundtrip SystemMessage', () => {
      const original = [new SystemMessage('system')];
      const serialized = serializeMessages(original);
      const deserialized = deserializeMessages(serialized);
      expect(deserialized[0]).toBeInstanceOf(SystemMessage);
    });
  });
});
