import { classifyAgentError, getErrorCodeAndMessage } from './agent-error.utils';

describe('classifyAgentError', () => {
  it('should preserve SESSION_LIMIT errors', () => {
    const error = new Error('SESSION_LIMIT: 已达到最大会话数限制');
    const result = classifyAgentError(error);
    expect(result).toBe(error);
    expect(result.message).toContain('SESSION_LIMIT');
  });

  it('should classify Unauthorized as LLM_AUTH_ERROR', () => {
    const result = classifyAgentError(new Error('401 Unauthorized'));
    expect(result.message).toContain('LLM_AUTH_ERROR');
    expect(result.message).toContain('API Key');
  });

  it('should classify timeout as LLM_TIMEOUT', () => {
    const result = classifyAgentError(new Error('ETIMEDOUT'));
    expect(result.message).toContain('LLM_TIMEOUT');
    expect(result.message).toContain('超时');
  });

  it('should wrap unknown errors as AGENT_ERROR', () => {
    const result = classifyAgentError(new Error('Something went wrong'));
    expect(result.message).toContain('AGENT_ERROR');
    expect(result.message).toContain('Something went wrong');
  });
});

describe('getErrorCodeAndMessage', () => {
  it('should return LLM_AUTH_ERROR code for 401', () => {
    const { code, message } = getErrorCodeAndMessage(new Error('401 Unauthorized'));
    expect(code).toBe('LLM_AUTH_ERROR');
    expect(message).toContain('API Key');
  });

  it('should return LLM_TIMEOUT code for timeout', () => {
    const { code, message } = getErrorCodeAndMessage(new Error('ETIMEDOUT'));
    expect(code).toBe('LLM_TIMEOUT');
    expect(message).toContain('超时');
  });

  it('should return AGENT_ERROR code for unknown errors', () => {
    const { code, message } = getErrorCodeAndMessage(new Error('Unknown error'));
    expect(code).toBe('AGENT_ERROR');
    expect(message).toBe('Unknown error');
  });
});