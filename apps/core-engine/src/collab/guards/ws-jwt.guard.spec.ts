import { WsJwtGuard } from './ws-jwt.guard';
import { JwtService } from '@nestjs/jwt';
import { ExecutionContext } from '@nestjs/common';
import { Socket } from 'socket.io';

function mockExecutionContext(token: string | undefined, queryToken?: string): ExecutionContext {
  const client: Partial<Socket> = {
    id: 'socket-1',
    handshake: {
      auth: token ? { token } : {},
      query: queryToken ? { token: queryToken } : {},
    } as any,
    emit: jest.fn(),
  };
  return {
    switchToWs: () => ({ getClient: () => client }),
  } as any;
}

describe('WsJwtGuard', () => {
  let guard: WsJwtGuard;
  let jwtService: jest.Mocked<JwtService>;

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
      sign: jest.fn(),
    } as any;

    guard = new WsJwtGuard(
      jwtService,
      { get: () => 'test-secret' } as any,
    );
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should allow connection without token (anonymous)', () => {
    const ctx = mockExecutionContext(undefined);
    const result = guard.canActivate(ctx);
    expect(result).toBe(true);

    const client = ctx.switchToWs().getClient() as any;
    expect(client.user).toEqual({ sub: 'anonymous' });
  });

  it('should verify valid JWT token and attach user', () => {
    const payload = { sub: 'user-1', username: 'tester' };
    jwtService.verify.mockReturnValue(payload);

    const ctx = mockExecutionContext('valid-token');
    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('valid-token', { secret: 'test-secret' });

    const client = ctx.switchToWs().getClient() as any;
    expect(client.user).toEqual(payload);
  });

  it('should handle invalid token gracefully (anonymous)', () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('jwt malformed');
    });

    const ctx = mockExecutionContext('bad-token');
    const result = guard.canActivate(ctx);

    expect(result).toBe(true);

    const client = ctx.switchToWs().getClient() as any;
    expect(client.user).toEqual({ sub: 'anonymous' });
  });

  it('should read token from query param fallback', () => {
    const payload = { sub: 'user-2', username: 'quser' };
    jwtService.verify.mockReturnValue(payload);

    const ctx = mockExecutionContext(undefined, 'query-token');
    const result = guard.canActivate(ctx);

    expect(result).toBe(true);
    expect(jwtService.verify).toHaveBeenCalledWith('query-token', { secret: 'test-secret' });

    const client = ctx.switchToWs().getClient() as any;
    expect(client.user).toEqual(payload);
  });
});