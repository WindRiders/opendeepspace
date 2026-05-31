import { Test, TestingModule } from '@nestjs/testing';
import { TraceController } from './trace.controller';
import { TraceService } from './trace.service';
import { NotFoundException } from '@nestjs/common';

describe('TraceController', () => {
  let controller: TraceController;
  let traceService: any;

  beforeEach(async () => {
    traceService = {
      listTraces: jest.fn(),
      getTrace: jest.fn(),
      deleteTrace: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TraceController],
      providers: [{ provide: TraceService, useValue: traceService }],
    }).compile();

    controller = module.get<TraceController>(TraceController);
  });

  const mockReq = { user: { sub: 'user-1' } };

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should list traces for user', () => {
    const traces = [
      { id: 't1', sessionId: 's1', userMessage: 'hello', totalSteps: 2, toolCount: 1, createdAt: 100, durationMs: 500 },
    ];
    traceService.listTraces.mockReturnValue(traces);

    const result = controller.list(mockReq);
    expect(result).toEqual(traces);
    expect(traceService.listTraces).toHaveBeenCalledWith('user-1', undefined);
  });

  it('should list traces filtered by sessionId', () => {
    traceService.listTraces.mockReturnValue([]);

    controller.list(mockReq, 'sess-1');
    expect(traceService.listTraces).toHaveBeenCalledWith('user-1', 'sess-1');
  });

  it('should get trace by id', () => {
    const trace = {
      id: 't1', sessionId: 's1', userMessage: 'hello', agentReply: 'hi',
      steps: [], totalSteps: 1, createdAt: 100, durationMs: 200,
    };
    traceService.getTrace.mockReturnValue(trace);

    const result = controller.getById('t1', mockReq);
    expect(result).toEqual(trace);
  });

  it('should throw NotFoundException for missing trace', () => {
    traceService.getTrace.mockReturnValue(null);

    expect(() => controller.getById('missing', mockReq)).toThrow(
      NotFoundException,
    );
  });

  it('should delete trace', () => {
    traceService.deleteTrace.mockReturnValue(true);

    const result = controller.remove('t1', mockReq);
    expect(result.message).toContain('t1');
  });

  it('should throw NotFoundException when deleting missing trace', () => {
    traceService.deleteTrace.mockReturnValue(false);

    expect(() => controller.remove('missing', mockReq)).toThrow(
      NotFoundException,
    );
  });
});
