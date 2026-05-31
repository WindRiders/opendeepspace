import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSessionView } from './AgentSessionView';
import type { CollabSession, CollabMessage } from '@deepspace/shared-types';

function makeSession(overrides?: Partial<CollabSession>): CollabSession {
  return {
    id: 'sess-1',
    task: 'Build an API',
    agents: ['planner', 'coder'],
    status: 'executing',
    messages: [],
    createdAt: Date.now(),
    ...overrides,
  };
}

function makeMsg(overrides?: Partial<CollabMessage>): CollabMessage {
  return {
    id: 'msg-1',
    from: 'planner',
    to: 'coder',
    content: 'Here is the plan',
    timestamp: Date.now(),
    type: 'handoff',
    ...overrides,
  };
}

describe('AgentSessionView', () => {
  const baseProps = {
    allMessages: [] as CollabMessage[],
    agentStreams: new Map(),
    typingAgent: null as string | null,
    executing: false,
    execError: null as string | null,
    connected: true,
    onlineCount: 0,
    onExecute: vi.fn(),
    onReset: vi.fn(),
  };

  it('should render session task', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} />);
    expect(screen.getByText(/Build an API/)).toBeInTheDocument();
  });

  it('should render agent role pills', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} />);
    expect(screen.getByText('planner')).toBeInTheDocument();
    expect(screen.getByText('coder')).toBeInTheDocument();
  });

  it('should render messages', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} allMessages={[makeMsg()]} />);
    expect(screen.getByText('Here is the plan')).toBeInTheDocument();
  });

  it('should show typing indicator', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} typingAgent="planner" executing={true} />);
    expect(screen.getByText(/is typing/)).toBeInTheDocument();
  });

  it('should disable execute button when executing', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} executing={true} />);
    expect(screen.getByText(/Executing/)).toBeDisabled();
  });

  it('should show Retry button when execError set', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} execError="LLM unavailable" />);
    expect(screen.getByText('Retry')).toBeInTheDocument();
    expect(screen.getByText('LLM unavailable')).toBeInTheDocument();
  });

  it('should show Execute button when not executing and no error', () => {
    render(<AgentSessionView session={makeSession()} {...baseProps} />);
    expect(screen.getByText('Execute')).toBeInTheDocument();
  });

  it('should call onExecute when execute button clicked', () => {
    const onExecute = vi.fn();
    render(<AgentSessionView session={makeSession()} {...baseProps} onExecute={onExecute} />);
    fireEvent.click(screen.getByText('Execute'));
    expect(onExecute).toHaveBeenCalled();
  });

  it('should call onReset when New Collaboration clicked', () => {
    const onReset = vi.fn();
    render(<AgentSessionView session={makeSession()} {...baseProps} onReset={onReset} />);
    fireEvent.click(screen.getByText(/New Collaboration/));
    expect(onReset).toHaveBeenCalled();
  });

  });