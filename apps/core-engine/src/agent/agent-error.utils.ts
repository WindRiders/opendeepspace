export function classifyAgentError(error: Error): Error {
  const msg = error.message || String(error);

  if (msg.startsWith('SESSION_LIMIT')) return error;

  if (msg.includes('API key') || msg.includes('Unauthorized') || msg.includes('401')) {
    return new Error('LLM_AUTH_ERROR: API Key 无效或已过期。');
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return new Error('LLM_TIMEOUT: API 响应超时，请稍后重试。');
  }
  return new Error(`AGENT_ERROR: ${msg}`);
}

export function getErrorCodeAndMessage(error: Error): { code: string; message: string } {
  const msg = error.message || String(error);

  if (
    msg.includes('API key') ||
    msg.includes('Unauthorized') ||
    msg.includes('401')
  ) {
    return { code: 'LLM_AUTH_ERROR', message: 'API Key 无效或已过期。' };
  }
  if (msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return { code: 'LLM_TIMEOUT', message: 'API 响应超时，请稍后重试。' };
  }
  return { code: 'AGENT_ERROR', message: msg };
}