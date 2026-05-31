import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const mockService = {
      validateUser: jest.fn(),
      login: jest.fn(),
      register: jest.fn(),
      getProfile: jest.fn(),
      updateProfile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService) as any;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return token on valid credentials', async () => {
      const user = { id: 'u1', username: 'test' };
      authService.validateUser.mockResolvedValue(user as any);
      authService.login.mockReturnValue({ access_token: 'token-123', user: { id: 'u1', email: 'a@b.com', username: 'test', avatarUrl: null, role: 'user', createdAt: '2024', lastLoginAt: null } });

      const result = await controller.login({
        username: 'test',
        password: 'pass',
      });

      expect(authService.validateUser).toHaveBeenCalledWith('test', 'pass');
      expect(result).toMatchObject({ access_token: 'token-123' });
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      authService.validateUser.mockResolvedValue(null);

      await expect(
        controller.login({ username: 'test', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('register', () => {
    it('should call auth service register', async () => {
      authService.register.mockResolvedValue({ id: 'u1' } as any);

      const result = await controller.register({
        email: 'a@b.com',
        username: 'newuser',
        password: 'secret',
      });

      expect(authService.register).toHaveBeenCalledWith(
        'a@b.com',
        'newuser',
        'secret',
      );
      expect(result).toEqual({ id: 'u1' });
    });
  });

  describe('getProfile', () => {
    it('should return user profile', async () => {
      authService.getProfile.mockReturnValue({
        id: 'u1',
        username: 'test',
      } as any);

      const req = { user: { sub: 'u1' } };
      const result = controller.getProfile(req);

      expect(authService.getProfile).toHaveBeenCalledWith('u1');
      expect(result).toEqual({ id: 'u1', username: 'test' });
    });

    it('should throw UnauthorizedException when user not found', async () => {
      authService.getProfile.mockReturnValue(null);

      const req = { user: { sub: 'ghost' } };
      expect(() => controller.getProfile(req)).toThrow(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('should call auth service updateProfile', async () => {
      authService.updateProfile.mockResolvedValue({
        id: 'u1',
        username: 'new_name',
      } as any);

      const req = { user: { sub: 'u1' } };
      const result = await controller.updateProfile(req, {
        username: 'new_name',
        avatarUrl: 'https://example.com/avatar.png',
      });

      expect(authService.updateProfile).toHaveBeenCalledWith('u1', {
        username: 'new_name',
        avatarUrl: 'https://example.com/avatar.png',
        currentPassword: undefined,
        newPassword: undefined,
      });
      expect(result).toEqual({ id: 'u1', username: 'new_name' });
    });
  });
});