import {
  HumanMessage,
  SystemMessage,
  AIMessage,
  ToolMessage,
  BaseMessage,
} from '@langchain/core/messages';

interface SerializedMessage {
  type: 'human' | 'system' | 'ai' | 'tool';
  content: string;
  tool_call_id?: string;
  tool_calls?: any[];
}

export function serializeMessages(messages: BaseMessage[]): string {
  const serialized: SerializedMessage[] = messages.map((msg) => {
    if (msg instanceof HumanMessage) {
      return { type: 'human', content: msg.content as string };
    } else if (msg instanceof SystemMessage) {
      return { type: 'system', content: msg.content as string };
    } else if (msg instanceof AIMessage) {
      return {
        type: 'ai',
        content: msg.content as string,
        tool_calls: (msg as any).tool_calls || [],
      };
    } else if (msg instanceof ToolMessage) {
      return {
        type: 'tool',
        content: msg.content as string,
        tool_call_id: (msg as any).tool_call_id,
      };
    }
    return { type: 'human', content: String(msg.content) };
  });
  return JSON.stringify(serialized);
}

export function deserializeMessages(json: string): BaseMessage[] {
  const parsed: SerializedMessage[] = JSON.parse(json);
  return parsed.map((item) => {
    switch (item.type) {
      case 'human':
        return new HumanMessage(item.content);
      case 'system':
        return new SystemMessage(item.content);
      case 'ai': {
        const msg = new AIMessage(item.content);
        if (item.tool_calls && item.tool_calls.length > 0) {
          (msg as any).tool_calls = item.tool_calls;
        }
        return msg;
      }
      case 'tool':
        return new ToolMessage({
          content: item.content,
          tool_call_id: item.tool_call_id || '',
        });
      default:
        return new HumanMessage(item.content);
    }
  });
}
