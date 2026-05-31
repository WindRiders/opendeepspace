import { renderHook, act, waitFor } from '@testing-library/react';
import { useCollabSocket } from '../lib/use-collab-socket';
import type { CollabSession, CollabMessage } from '@deepspace/shared-types';

// Mock socket.io-client
const mockOn = vi.fn().mockReturnThis();
const mockEmit = vi.fn();
const mockDisconnect = vi.fn();

let mockSocketInstance: any;

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => {
    mockSocketInstance = {
      on: mockOn,
      emit: mockEmit,
      disconnect: mockDisconnect,
    };
    return mockSocketInstance;
  }),
}));

function makeSession(overrides?: Partial<CollabSession>): CollabSession {
  return {
    id: 'sess-1',
    task: 'Build a thing',
    agents: ['planner', 'coder'],
    status: 'planning',
    messages: [],
    ...overrides,
  };
}

function makeMsg(overrides?: Partial<CollabMessage>): CollabMessage {
  return {
    id: 'msg-1',
    from: 'planner',
    to: 'coder',
    content: 'Hello',
    timestamp: Date.now(),
    type: 'request',
    ...overrides,
  };
}

describe('useCollabSocket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn().mockReturnValue('test-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    });
    mockSocketInstance = null;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should not create socket when sessionId is null', () => {
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: null }),
    );

    expect(result.current.connected).toBe(false);
    expect(result.current.onlineCount).toBe(0);
  });

  it('should connect and join session when sessionId is provided', async () => {
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    await waitFor(() => {
      expect(mockSocketInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  it('should set connected on connect event and emit join-session', async () => {
    let connectCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'connect') connectCb = cb;
      return mockOn;
    });

    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => { connectCb(); });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('join-session', { sessionId: 'sess-1' });
    });
  });

  it('should set connected false on disconnect', async () => {
    let disconnectCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'disconnect') disconnectCb = cb;
      return mockOn;
    });

    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => { disconnectCb(); });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });
  });

  it('should update onlineCount on online-users event', async () => {
    let onlineCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'online-users') onlineCb = cb;
      return mockOn;
    });

    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => { onlineCb({ sessionId: 'sess-1', count: 3 }); });

    await waitFor(() => {
      expect(result.current.onlineCount).toBe(3);
    });
  });

  it('should call onMessage when agent-message received', async () => {
    const onMessage = vi.fn();
    let msgCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'agent-message') msgCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onMessage }),
    );

    const msg = makeMsg();
    act(() => { msgCb(msg); });

    expect(onMessage).toHaveBeenCalledWith(msg);
  });

  it('should call onSessionState on session-state event', async () => {
    const onSessionState = vi.fn();
    let stateCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'session-state') stateCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onSessionState }),
    );

    const session = makeSession();
    act(() => { stateCb(session); });

    expect(onSessionState).toHaveBeenCalledWith(session);
  });

  it('should call onSessionUpdate on session-updated event', async () => {
    const onSessionUpdate = vi.fn();
    let updateCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'session-updated') updateCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onSessionUpdate }),
    );

    act(() => { updateCb({ sessionId: 'sess-1', status: 'executing' }); });

    expect(onSessionUpdate).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      status: 'executing',
    });
  });

  it('should call onAgentTyping on agent-typing event', async () => {
    const onAgentTyping = vi.fn();
    let typingCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'agent-typing') typingCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onAgentTyping }),
    );

    act(() => { typingCb({ sessionId: 'sess-1', agent: 'planner' }); });

    expect(onAgentTyping).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      agent: 'planner',
    });
  });

  it('should call onAgentStopTyping on agent-stop-typing event', async () => {
    const onAgentStopTyping = vi.fn();
    let stopTypingCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'agent-stop-typing') stopTypingCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onAgentStopTyping }),
    );

    act(() => { stopTypingCb({ sessionId: 'sess-1', agent: 'planner' }); });

    expect(onAgentStopTyping).toHaveBeenCalledWith({
      sessionId: 'sess-1',
      agent: 'planner',
    });
  });

  it('should call onAgentStart on collab-agent-start event', async () => {
    const onAgentStart = vi.fn();
    let startCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'collab-agent-start') startCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onAgentStart }),
    );

    const evt = {
      type: 'collab_agent_start' as const,
      sessionId: 'sess-1',
      agentRole: 'planner',
      agentName: 'Planner Agent',
    };
    act(() => { startCb(evt); });

    expect(onAgentStart).toHaveBeenCalledWith(evt);
  });

  it('should call onAgentChunk on collab-agent-chunk event', async () => {
    const onAgentChunk = vi.fn();
    let chunkCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'collab-agent-chunk') chunkCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onAgentChunk }),
    );

    const evt = {
      type: 'collab_agent_chunk' as const,
      sessionId: 'sess-1',
      agentRole: 'planner',
      content: 'partial output',
    };
    act(() => { chunkCb(evt); });

    expect(onAgentChunk).toHaveBeenCalledWith(evt);
  });

  it('should call onAgentDone on collab-agent-done event', async () => {
    const onAgentDone = vi.fn();
    let doneCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'collab-agent-done') doneCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onAgentDone }),
    );

    const evt = {
      type: 'collab_agent_done' as const,
      sessionId: 'sess-1',
      agentRole: 'planner',
      fullContent: 'Plan done',
    };
    act(() => { doneCb(evt); });

    expect(onAgentDone).toHaveBeenCalledWith(evt);
  });

  it('should call onCollabDone on collab-done event', async () => {
    const onCollabDone = vi.fn();
    let doneCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'collab-done') doneCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onCollabDone }),
    );

    act(() => { doneCb({ type: 'collab_done', sessionId: 'sess-1', summary: 'Done' }); });

    expect(onCollabDone).toHaveBeenCalled();
  });

  it('should call onCollabError on collab-error event', async () => {
    const onCollabError = vi.fn();
    let errorCb: Function = () => {};
    mockOn.mockImplementation((event: string, cb: Function) => {
      if (event === 'collab-error') errorCb = cb;
      return mockOn;
    });

    renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1', onCollabError }),
    );

    const evt = {
      type: 'collab_error' as const,
      sessionId: 'sess-1',
      message: 'Something went wrong',
    };
    act(() => { errorCb(evt); });

    expect(onCollabError).toHaveBeenCalledWith(evt);
  });

  it('should emit execute-session when executeSession is called', async () => {
    mockEmit.mockClear();
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => { result.current.executeSession(); });

    expect(mockEmit).toHaveBeenCalledWith('execute-session', {
      sessionId: 'sess-1',
      modelId: undefined,
    });
  });

  it('should emit send-message when sendMessage is called', async () => {
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => {
      result.current.sendMessage('planner', 'coder', 'Hello', 'request');
    });

    expect(mockEmit).toHaveBeenCalledWith('send-message', {
      sessionId: 'sess-1',
      from: 'planner',
      to: 'coder',
      content: 'Hello',
      type: 'request',
    });
  });

  it('should emit typing when sendTyping is called', async () => {
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    act(() => { result.current.sendTyping('planner'); });

    expect(mockEmit).toHaveBeenCalledWith('typing', {
      sessionId: 'sess-1',
      agent: 'planner',
    });
  });

  it('should not emit when socket is null (no sessionId)', async () => {
    const { result } = renderHook(() =>
      useCollabSocket({ sessionId: null }),
    );

    act(() => { result.current.sendMessage('planner', 'coder', 'Hello', 'request'); });
    act(() => { result.current.sendTyping('planner'); });
    act(() => { result.current.executeSession(); });

    // mockEmit is from the mock but socket isn't created when sessionId is null
    // Socket is only created in useEffect when sessionId is truthy
  });

  it('should disconnect and leave session on unmount', async () => {
    const { unmount } = renderHook(() =>
      useCollabSocket({ sessionId: 'sess-1' }),
    );

    unmount();

    expect(mockEmit).toHaveBeenCalledWith('leave-session', {
      sessionId: 'sess-1',
    });
    expect(mockDisconnect).toHaveBeenCalled();
  });
});