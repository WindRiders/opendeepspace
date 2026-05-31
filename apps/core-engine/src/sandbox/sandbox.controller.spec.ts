import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { SandboxController } from './sandbox.controller';
import { SandboxService } from './sandbox.service';

describe('SandboxController', () => {
  let controller: SandboxController;
  let sandboxService: jest.Mocked<SandboxService>;

  beforeEach(async () => {
    const mockService = {
      listFiles: jest.fn(),
      readFile: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SandboxController],
      providers: [{ provide: SandboxService, useValue: mockService }],
    }).compile();

    controller = module.get<SandboxController>(SandboxController);
    sandboxService = module.get(SandboxService) as any;
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listFiles', () => {
    it('should call sandbox service with default empty path', async () => {
      sandboxService.listFiles.mockResolvedValue([
        { name: 'file1.ts', path: '/sandbox/file1.ts', type: 'file', size: 100 },
      ]);
      const result = await controller.listFiles();
      expect(sandboxService.listFiles).toHaveBeenCalledWith('');
      expect(result).toEqual([{ name: 'file1.ts', path: '/sandbox/file1.ts', type: 'file', size: 100 }]);
    });

    it('should pass path query parameter', async () => {
      sandboxService.listFiles.mockResolvedValue([
        { name: 'a.ts', path: '/sandbox/src/a.ts', type: 'file', size: 50 },
      ]);
      const result = await controller.listFiles('/sandbox/src');
      expect(sandboxService.listFiles).toHaveBeenCalledWith('/sandbox/src');
      expect(result).toEqual([{ name: 'a.ts', path: '/sandbox/src/a.ts', type: 'file', size: 50 }]);
    });
  });

  describe('readFile', () => {
    it('should call sandbox service with file path', async () => {
      sandboxService.readFile.mockResolvedValue({
        content: 'file content',
        size: 12,
        language: 'text',
      });
      const result = await controller.readFile('/sandbox/test.txt');
      expect(sandboxService.readFile).toHaveBeenCalledWith('/sandbox/test.txt');
      expect(result).toEqual({ content: 'file content', size: 12, language: 'text' });
    });

    it('should throw BadRequestException when path is empty', async () => {
      await expect(controller.readFile('')).rejects.toThrow(BadRequestException);
      await expect(controller.readFile('')).rejects.toThrow(
        'path query parameter is required',
      );
    });

    it('should throw BadRequestException on service error', async () => {
      sandboxService.readFile.mockRejectedValue(new Error('File not found'));
      await expect(controller.readFile('/bad/path')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});