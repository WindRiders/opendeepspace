import { Test, TestingModule } from '@nestjs/testing';
import { ShareController } from './share.controller';
import { ShareService } from './share.service';
import { NotFoundException } from '@nestjs/common';

describe('ShareController', () => {
  let controller: ShareController;
  let shareService: any;

  beforeEach(async () => {
    shareService = {
      createShare: jest.fn(),
      getShare: jest.fn(),
      listShares: jest.fn(),
      deleteShare: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShareController],
      providers: [{ provide: ShareService, useValue: shareService }],
    }).compile();

    controller = module.get<ShareController>(ShareController);
  });

  const mockReq = { user: { sub: 'user-1' } };

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create a share', () => {
    const share = {
      id: 'abc123',
      type: 'dna',
      title: 'My DNA',
      payload: '{"role":"coder"}',
      createdBy: 'user-1',
      createdAt: 100,
      viewCount: 0,
    };
    shareService.createShare.mockReturnValue(share);

    const result = controller.createShare(
      { type: 'dna', title: 'My DNA', payload: '{"role":"coder"}' },
      mockReq,
    );
    expect(result.id).toBe('abc123');
    expect(shareService.createShare).toHaveBeenCalledWith(
      'dna',
      'My DNA',
      '{"role":"coder"}',
      'user-1',
    );
  });

  it('should get a share by id (public)', () => {
    const share = {
      id: 'abc123',
      type: 'dna',
      title: 'My DNA',
      payload: '{}',
      createdBy: 'user-1',
      createdAt: 100,
      viewCount: 1,
    };
    shareService.getShare.mockReturnValue(share);

    const result = controller.getShare('abc123');
    expect(result.id).toBe('abc123');
  });

  it('should throw NotFoundException for missing share', () => {
    shareService.getShare.mockReturnValue(null);
    expect(() => controller.getShare('missing')).toThrow(NotFoundException);
  });

  it('should list shares for user', () => {
    shareService.listShares.mockReturnValue([]);
    const result = controller.listShares(mockReq);
    expect(result).toEqual([]);
    expect(shareService.listShares).toHaveBeenCalledWith('user-1');
  });

  it('should delete a share', () => {
    shareService.deleteShare.mockReturnValue(true);
    const result = controller.deleteShare('abc123', mockReq);
    expect(result.message).toContain('abc123');
  });

  it('should throw NotFoundException when deleting missing share', () => {
    shareService.deleteShare.mockReturnValue(false);
    expect(() => controller.deleteShare('missing', mockReq)).toThrow(
      NotFoundException,
    );
  });
});
