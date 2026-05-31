import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  it('should extend AuthGuard("jwt")', () => {
    // JwtAuthGuard extends AuthGuard('jwt') — verify it's callable
    expect(typeof guard.canActivate).toBe('function');
  });
});