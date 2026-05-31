import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserService } from './user.service';

describe('AuthService', () => {
  let authService: AuthService;
  let userService: UserService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-001',
    email: 'test@example.com',
    username: 'testuser',
    password_hash: 'hashed',
    avatar_url: null,
    role: 'user' as const,
    created_at: '2026-01-01T00:00:00',
    last_login_at: null,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            findByIdentifier: jest.fn(),
            findByEmail: jest.fn(),
            findByUsername: jest.fn(),
            findById: jest.fn(),
            validatePassword: jest.fn(),
            createUser: jest.fn(),
            updateLastLogin: jest.fn(),
            updateProfile: jest.fn(),
            updatePassword: jest.fn(),
            toProfile: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
      ],
    }).compile();

    authService = module.get<AuthService>(AuthService);
    userService = module.get<UserService>(UserService);
    jwtService = module.get<JwtService>(JwtService);
  });

  describe('validateUser', () => {
    it('should return user when credentials are correct', async () => {
      (userService.findByIdentifier as jest.Mock).mockReturnValue(mockUser);
      (userService.validatePassword as jest.Mock).mockResolvedValue(true);

      const result = await authService.validateUser('testuser', 'password');
      expect(result).toEqual(mockUser);
    });

    it('should return null when user not found', async () => {
      (userService.findByIdentifier as jest.Mock).mockReturnValue(undefined);

      const result = await authService.validateUser('nobody', 'password');
      expect(result).toBeNull();
      expect(userService.validatePassword).not.toHaveBeenCalled();
    });

    it('should return null when password is wrong', async () => {
      (userService.findByIdentifier as jest.Mock).mockReturnValue(mockUser);
      (userService.validatePassword as jest.Mock).mockResolvedValue(false);

      const result = await authService.validateUser('testuser', 'wrong');
      expect(result).toBeNull();
    });

    it('should find user by email', async () => {
      (userService.findByIdentifier as jest.Mock).mockReturnValue(mockUser);
      (userService.validatePassword as jest.Mock).mockResolvedValue(true);

      await authService.validateUser('test@example.com', 'password');
      expect(userService.findByIdentifier).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('login', () => {
    it('should return access_token and user profile', () => {
      (userService.updateLastLogin as jest.Mock).mockReturnValue(undefined);
      (userService.toProfile as jest.Mock).mockReturnValue({
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        avatarUrl: null,
        role: 'user',
        createdAt: '2026-01-01T00:00:00',
        lastLoginAt: null,
      });

      const result = authService.login(mockUser);

      expect(result.access_token).toBe('mock-jwt-token');
      expect(result.user.id).toBe('user-001');
      expect(userService.updateLastLogin).toHaveBeenCalledWith('user-001');
    });

    it('should sign JWT with correct payload', () => {
      (userService.updateLastLogin as jest.Mock).mockReturnValue(undefined);
      (userService.toProfile as jest.Mock).mockReturnValue({});

      authService.login(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 'user-001',
        username: 'testuser',
        email: 'test@example.com',
        role: 'user',
      });
    });
  });

  describe('register', () => {
    it('should create user and return token', async () => {
      (userService.findByEmail as jest.Mock).mockReturnValue(undefined);
      (userService.findByUsername as jest.Mock).mockReturnValue(undefined);
      (userService.createUser as jest.Mock).mockResolvedValue(mockUser);
      (userService.updateLastLogin as jest.Mock).mockReturnValue(undefined);
      (userService.toProfile as jest.Mock).mockReturnValue({
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        avatarUrl: null,
        role: 'user',
        createdAt: '2026-01-01T00:00:00',
        lastLoginAt: null,
      });

      const result = await authService.register('test@example.com', 'testuser', 'password123');

      expect(result.access_token).toBe('mock-jwt-token');
      expect(userService.createUser).toHaveBeenCalledWith('test@example.com', 'testuser', 'password123');
    });

    it('should throw ConflictException when email already registered', async () => {
      (userService.findByEmail as jest.Mock).mockReturnValue(mockUser);

      await expect(
        authService.register('test@example.com', 'newuser', 'password123'),
      ).rejects.toThrow(ConflictException);
      expect(userService.createUser).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when username already taken', async () => {
      (userService.findByEmail as jest.Mock).mockReturnValue(undefined);
      (userService.findByUsername as jest.Mock).mockReturnValue(mockUser);

      await expect(
        authService.register('new@example.com', 'testuser', 'password123'),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('getProfile', () => {
    it('should return profile for existing user', () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.toProfile as jest.Mock).mockReturnValue({
        id: 'user-001',
        email: 'test@example.com',
        username: 'testuser',
        avatarUrl: null,
        role: 'user',
        createdAt: '2026-01-01T00:00:00',
        lastLoginAt: null,
      });

      const result = authService.getProfile('user-001');
      expect(result).not.toBeNull();
      expect(result?.id).toBe('user-001');
    });

    it('should return null for non-existent user', () => {
      (userService.findById as jest.Mock).mockReturnValue(undefined);

      const result = authService.getProfile('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('updateProfile', () => {
    it('should throw BadRequestException when user not found', async () => {
      (userService.findById as jest.Mock).mockReturnValue(undefined);

      await expect(
        authService.updateProfile('nonexistent', { username: 'newname' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should update username successfully', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.findByUsername as jest.Mock).mockReturnValue(undefined);
      (userService.updateProfile as jest.Mock).mockReturnValue({
        ...mockUser,
        username: 'newname',
      });
      (userService.toProfile as jest.Mock).mockReturnValue({
        ...mockUser,
        username: 'newname',
      });

      const result = await authService.updateProfile('user-001', { username: 'newname' });
      expect(result.username).toBe('newname');
    });

    it('should throw ConflictException when new username is taken', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.findByUsername as jest.Mock).mockReturnValue({
        id: 'user-002',
        email: 'other@example.com',
        username: 'takenname',
        password_hash: 'x',
        avatar_url: null,
        role: 'user',
        created_at: '2026-01-01',
        last_login_at: null,
      });

      await expect(
        authService.updateProfile('user-001', { username: 'takenname' }),
      ).rejects.toThrow(ConflictException);
    });

    it('should update password with valid current password', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.validatePassword as jest.Mock).mockResolvedValue(true);
      (userService.updatePassword as jest.Mock).mockResolvedValue(undefined);
      (userService.updateProfile as jest.Mock).mockReturnValue(mockUser);
      (userService.toProfile as jest.Mock).mockReturnValue({});

      await authService.updateProfile('user-001', {
        currentPassword: 'oldpass',
        newPassword: 'newpass123',
      });

      expect(userService.updatePassword).toHaveBeenCalledWith('user-001', 'newpass123');
    });

    it('should throw BadRequestException when current password is missing', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);

      await expect(
        authService.updateProfile('user-001', { newPassword: 'newpass123' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when current password is wrong', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.validatePassword as jest.Mock).mockResolvedValue(false);

      await expect(
        authService.updateProfile('user-001', {
          currentPassword: 'wrong',
          newPassword: 'newpass123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should skip username uniqueness check when same username', async () => {
      (userService.findById as jest.Mock).mockReturnValue(mockUser);
      (userService.findByUsername as jest.Mock).mockReturnValue(mockUser);
      (userService.updateProfile as jest.Mock).mockReturnValue(mockUser);
      (userService.toProfile as jest.Mock).mockReturnValue({});

      await authService.updateProfile('user-001', { username: 'testuser' });

      expect(userService.findByUsername).not.toHaveBeenCalled();
    });
  });
});
