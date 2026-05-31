import { Test, TestingModule } from '@nestjs/testing';
import { ConversationController } from './conversation.controller';
import { SessionService } from '../session/session.service';
import { HttpException } from '@nestjs/common';

describe('ConversationController', () => {
  let controller: ConversationController;
  let sessionService: Partial<SessionService>;

  beforeEach(async () => {
    sessionService = {
      listConversations: jest.fn().mockReturnValue([
        {
          id: 'conv-1',
          title: '测试对话',
          createdAt: 1000,
          updatedAt: 2000,
          messageCount: 5,
        },
        {
          id: 'conv-2',
          title: '另一个对话',
          createdAt: 500,
          updatedAt: 1500,
          messageCount: 3,
        },
      ]),
      deleteSession: jest.fn(),
      updateConversationTitle: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [{ provide: SessionService, useValue: sessionService }],
    }).compile();

    controller = module.get<ConversationController>(ConversationController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list conversations', () => {
    const req = { user: { sub: 'user-1' } };
    const result = controller.list(req);
    expect(result).toHaveLength(2);
    expect(result[0].title).toBe('测试对话');
    expect(sessionService.listConversations).toHaveBeenCalledWith('user-1');
  });

  it('should delete a conversation', () => {
    const req = { user: { sub: 'user-1' } };
    const result = controller.remove('conv-1', req);
    expect(result.message).toContain('conv-1');
    expect(sessionService.deleteSession).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
    );
  });

  it('should update conversation title', () => {
    const req = { user: { sub: 'user-1' } };
    const result = controller.updateTitle(
      'conv-1',
      { title: '新标题' },
      req,
    );
    expect(result.title).toBe('新标题');
    expect(sessionService.updateConversationTitle).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      '新标题',
    );
  });

  it('should throw 404 when updating non-existent conversation', () => {
    (sessionService.updateConversationTitle as jest.Mock).mockReturnValue(
      false,
    );
    const req = { user: { sub: 'user-1' } };
    expect(() =>
      controller.updateTitle('non-existent', { title: '标题' }, req),
    ).toThrow(HttpException);
  });
});
