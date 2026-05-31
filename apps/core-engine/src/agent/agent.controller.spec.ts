import { Test, TestingModule } from '@nestjs/testing';
import { AgentController } from './agent.controller';
import { AgentService } from './agent.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('AgentController', () => {
  let controller: AgentController;
  let agentService: Partial<AgentService>;

  beforeEach(async () => {
    agentService = {
      getToolNames: jest.fn().mockReturnValue(['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run']),
      getAvailableModels: jest.fn().mockReturnValue([
        { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', description: 'General purpose', maxTokens: 8192, isDefault: true },
      ]),
      execute: jest.fn(),
      executeStream: jest.fn(),
      clearSession: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AgentController],
      providers: [{ provide: AgentService, useValue: agentService }],
    }).compile();

    controller = module.get<AgentController>(AgentController);
  });

  describe('GET /agent/status', () => {
    it('should return status with tools and models', () => {
      const result = controller.getStatus();
      expect(result.status).toBe('online');
      expect(result.core).toBe('DeepSpace Genesis');
      expect(result.tools).toEqual(['read_file', 'write_file', 'list_files', 'shell_exec', 'http_request', 'code_run']);
      expect(result.models).toHaveLength(1);
      expect(result.models[0].id).toBe('deepseek-chat');
      expect(result.phase).toBe(2);
    });
  });

  describe('GET /agent/models', () => {
    it('should return available models', () => {
      const result = controller.getModels();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('deepseek-chat');
      expect(agentService.getAvailableModels).toHaveBeenCalled();
    });
  });

  describe('POST /agent/interact', () => {
    const mockReq = { user: { sub: 'user-1', username: 'admin' } };

    it('should return agent response on success', async () => {
      (agentService.execute as jest.Mock).mockResolvedValue({
        reply: 'Hello!',
        toolCalls: [],
        totalSteps: 1,
        sessionId: 'sess-1',
      });

      const result = await controller.interact(
        { message: 'Hi', dna: 'test dna' },
        mockReq,
      );

      expect(result.reply).toBe('Hello!');
      expect(result.agentDna).toBe('test dna');
      expect(result.sessionId).toBe('sess-1');
    });

    it('should use default DNA when not provided', async () => {
      (agentService.execute as jest.Mock).mockResolvedValue({
        reply: 'Hi',
        toolCalls: [],
        totalSteps: 1,
        sessionId: 'sess-1',
      });

      const result = await controller.interact({ message: 'Hi' }, mockReq);
      expect(result.agentDna).toContain('DeepSpace');
    });

    it('should throw 401 on LLM auth error', async () => {
      (agentService.execute as jest.Mock).mockRejectedValue(
        new Error('LLM_AUTH_ERROR: Invalid key'),
      );

      await expect(
        controller.interact({ message: 'Hi' }, mockReq),
      ).rejects.toThrow(HttpException);

      try {
        await controller.interact({ message: 'Hi' }, mockReq);
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('should throw 504 on LLM timeout', async () => {
      (agentService.execute as jest.Mock).mockRejectedValue(
        new Error('LLM_TIMEOUT: timeout'),
      );

      try {
        await controller.interact({ message: 'Hi' }, mockReq);
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.GATEWAY_TIMEOUT);
      }
    });

    it('should throw 429 on session limit', async () => {
      (agentService.execute as jest.Mock).mockRejectedValue(
        new Error('SESSION_LIMIT: max reached'),
      );

      try {
        await controller.interact({ message: 'Hi' }, mockReq);
      } catch (e: any) {
        expect(e.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      }
    });
  });

  describe('DELETE /agent/session/:id', () => {
    it('should clear session and return confirmation', () => {
      const mockReq = { user: { sub: 'user-1' } };
      const result = controller.clearSession('sess-1', mockReq);
      expect(result.message).toContain('sess-1');
      expect(agentService.clearSession).toHaveBeenCalledWith('sess-1', 'user-1');
    });
  });
});
