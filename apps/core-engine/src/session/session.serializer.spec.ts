import { HumanMessage, SystemMessage, AIMessage, ToolMessage, BaseMessage } from '@langchain/core/messages';
import { serializeMessages, deserializeMessages } from './session.serializer';

describe('session.serializer', () => {
  describe('serializeMessages', () => {
    it('should serialize HumanMessage', () => {
      const messages: BaseMessage[] = [new HumanMessage('Hello')];
      const json = serializeMessages(messages);
      const parsed = JSON.parse(json);

      expect(parsed[0].type).toBe('human');
      expect(parsed[0].content).toBe('Hello');
    });

    it('should serialize SystemMessage', () => {
      const messages: BaseMessage[] = [new SystemMessage('You are helpful')];
      const json = serializeMessages(messages);
      const parsed = JSON.parse(json);

      expect(parsed[0].type).toBe('system');
      expect(parsed[0].content).toBe('You are helpful');
    });

    it('should serialize AIMessage', () => {
      const messages: BaseMessage[] = [new AIMessage('Response')];
      const json = serializeMessages(messages);
      const parsed = JSON.parse(json);

      expect(parsed[0].type).toBe('ai');
      expect(parsed[0].content).toBe('Response');
      expect(parsed[0].tool_calls).toEqual([]);
    });

    it('should serialize AIMessage with tool_calls', () => {
      const msg = new AIMessage('Using tool');
      (msg as any).tool_calls = [{ id: 'tc-1', name: 'read_file', args: { path: 'test.txt' } }];

      const json = serializeMessages([msg]);
      const parsed = JSON.parse(json);

      expect(parsed[0].type).toBe('ai');
      expect(parsed[0].tool_calls).toHaveLength(1);
      expect(parsed[0].tool_calls[0].name).toBe('read_file');
    });

    it('should serialize ToolMessage', () => {
      const msg = new ToolMessage({ content: 'File content', tool_call_id: 'tc-1' });
      const json = serializeMessages([msg]);
      const parsed = JSON.parse(json);

      expect(parsed[0].type).toBe('tool');
      expect(parsed[0].content).toBe('File content');
      expect(parsed[0].tool_call_id).toBe('tc-1');
    });

    it('should serialize multiple messages', () => {
      const messages: BaseMessage[] = [
        new SystemMessage('System'),
        new HumanMessage('Human'),
        new AIMessage('AI'),
      ];
      const json = serializeMessages(messages);
      const parsed = JSON.parse(json);

      expect(parsed).toHaveLength(3);
      expect(parsed.map((p: any) => p.type)).toEqual(['system', 'human', 'ai']);
    });
  });

  describe('deserializeMessages', () => {
    it('should deserialize HumanMessage', () => {
      const json = JSON.stringify([{ type: 'human', content: 'Hello' }]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(HumanMessage);
      expect(messages[0].content).toBe('Hello');
    });

    it('should deserialize SystemMessage', () => {
      const json = JSON.stringify([{ type: 'system', content: 'System prompt' }]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(SystemMessage);
      expect(messages[0].content).toBe('System prompt');
    });

    it('should deserialize AIMessage', () => {
      const json = JSON.stringify([{ type: 'ai', content: 'AI response' }]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(AIMessage);
      expect(messages[0].content).toBe('AI response');
    });

    it('should deserialize AIMessage with tool_calls', () => {
      const json = JSON.stringify([
        {
          type: 'ai',
          content: 'Using tool',
          tool_calls: [{ id: 'tc-1', name: 'read_file', args: { path: 'x.txt' } }],
        },
      ]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(AIMessage);
      expect((messages[0] as any).tool_calls).toHaveLength(1);
      expect((messages[0] as any).tool_calls[0].name).toBe('read_file');
    });

    it('should deserialize ToolMessage', () => {
      const json = JSON.stringify([
        { type: 'tool', content: 'Result', tool_call_id: 'tc-1' },
      ]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(ToolMessage);
      expect(messages[0].content).toBe('Result');
    });

    it('should roundtrip without data loss', () => {
      const original: BaseMessage[] = [
        new SystemMessage('You are helpful'),
        new HumanMessage('What is 2+2?'),
      ];

      const json = serializeMessages(original);
      const restored = deserializeMessages(json);

      expect(restored).toHaveLength(2);
      expect(restored[0]).toBeInstanceOf(SystemMessage);
      expect(restored[1]).toBeInstanceOf(HumanMessage);
      expect(restored[0].content).toBe('You are helpful');
      expect(restored[1].content).toBe('What is 2+2?');
    });

    it('should default to HumanMessage for unknown type', () => {
      const json = JSON.stringify([{ type: 'unknown', content: 'Fallback' }]);
      const messages = deserializeMessages(json);

      expect(messages[0]).toBeInstanceOf(HumanMessage);
      expect(messages[0].content).toBe('Fallback');
    });
  });
});