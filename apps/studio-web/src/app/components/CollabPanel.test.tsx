import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CollabPanel } from '../components/CollabPanel';
import type { AgentRoleConfig, CollabSession } from '@deepspace/shared-types';

vi.mock('../lib/collab-api', () => ({
  fetchRoles: vi.fn(),
  createCollabSession: vi.fn(),
}));
vi.mock('../lib/use-collab-socket', () => ({
  useCollabSocket: vi.fn(() => ({
    connected: false,
    onlineCount: 0,
    sendMessage: vi.fn(),
    sendTyping: vi.fn(),
  })),
}));

import { fetchRoles, createCollabSession } from '../lib/collab-api';
import { useCollabSocket } from '../lib/use-collab-socket';

const mockRoles: AgentRoleConfig[] = [
  { role: 'planner', name: 'Planner', description: 'Plans the approach', systemPrompt: '...', icon: 'clipboard-list' },
  { role: 'coder', name: 'Coder', description: 'Writes the code', systemPrompt: '...', icon: 'code' },
  { role: 'reviewer', name: 'Reviewer', description: 'Reviews the code', systemPrompt: '...', icon: 'search' },
  { role: 'researcher', name: 'Researcher', description: 'Researches solutions', systemPrompt: '...', icon: 'book-open' },
];

const mockSession: CollabSession = {
  id: 'collab-1',
  task: 'Build an authentication system',
  agents: ['planner', 'coder'],
  messages: [
    { id: 'msg-1', from: 'orchestrator', to: 'planner', content: 'Start planning', timestamp: Date.now(), type: 'task' },
    { id: 'msg-2', from: 'planner', to: 'coder', content: 'Plan complete, start coding', timestamp: Date.now(), type: 'handoff' },
  ],
  status: 'executing',
  createdAt: Date.now() / 1000,
};

describe('CollabPanel', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null when open=false', () => {
    const { container } = render(<CollabPanel open={false} onClose={onClose} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders the dialog with title "Multi-Agent Collaboration" when open=true', () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    render(<CollabPanel open onClose={onClose} />);
    expect(screen.getByText('Multi-Agent Collaboration')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '' })).toBeInTheDocument(); // close button
  });

  it('loads roles on open', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('Coder')).toBeInTheDocument();
    expect(screen.getByText('Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Researcher')).toBeInTheDocument();
  });

  it('toggles role selection on click', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const plannerButton = screen.getByText('Planner').closest('button')!;

    // Click to select
    fireEvent.click(plannerButton);
    expect(plannerButton.className).toContain('text-amber-400');

    // Click again to deselect
    fireEvent.click(plannerButton);
    expect(plannerButton.className).toContain('bg-zinc-900/30');
  });

  it('disables start button when no task or no roles selected', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    // No task, no roles -> disabled
    const startButton = screen.getByRole('button', { name: 'Start Collaboration' });
    expect(startButton).toBeDisabled();

    // Add task but no roles -> still disabled
    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build something' } });
    expect(startButton).toBeDisabled();

    // Clear task but select a role -> still disabled
    fireEvent.change(textarea, { target: { value: '' } });
    const plannerButton = screen.getByText('Planner').closest('button')!;
    fireEvent.click(plannerButton);
    expect(startButton).toBeDisabled();
  });

  it('starts collaboration with task and roles', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    // Enter task
    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });

    // Select roles
    const plannerButton = screen.getByText('Planner').closest('button')!;
    const coderButton = screen.getByText('Coder').closest('button')!;
    fireEvent.click(plannerButton);
    fireEvent.click(coderButton);

    // Click start
    const startButton = screen.getByRole('button', { name: 'Start Collaboration' });
    fireEvent.click(startButton);

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalledWith(
        'Build an authentication system',
        ['planner', 'coder']
      );
    });

    // Session view should now be visible
    expect(screen.getByText('Build an authentication system')).toBeInTheDocument();
    expect(screen.getAllByText('planner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('coder').length).toBeGreaterThan(0);
  });

  it('shows loading state during creation', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(mockSession), 100))
    );
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build something' } });

    const plannerButton = screen.getByText('Planner').closest('button')!;
    fireEvent.click(plannerButton);

    const startButton = screen.getByRole('button', { name: 'Start Collaboration' });
    fireEvent.click(startButton);

    // Loading state
    await waitFor(() => {
      expect(screen.getByText('Planning...')).toBeInTheDocument();
    });

    // After loading completes
    await waitFor(() => {
      expect(screen.getByText('executing')).toBeInTheDocument();
    });
  });

  it('shows task banner in session view after creation', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });

    const plannerButton = screen.getByText('Planner').closest('button')!;
    fireEvent.click(plannerButton);

    fireEvent.click(screen.getByRole('button', { name: 'Start Collaboration' }));

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalled();
    });

    // Task banner
    expect(screen.getByText(/Task:/)).toBeInTheDocument();
    expect(screen.getByText('Build an authentication system')).toBeInTheDocument();
  });

  it('renders message bubbles in session view', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);
    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });

    const plannerButton = screen.getByText('Planner').closest('button')!;
    fireEvent.click(plannerButton);

    fireEvent.click(screen.getByRole('button', { name: 'Start Collaboration' }));

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalled();
    });

    // Message content
    expect(screen.getByText('Start planning')).toBeInTheDocument();
    expect(screen.getByText('Plan complete, start coding')).toBeInTheDocument();

    // Message metadata
    expect(screen.getByText('orchestrator')).toBeInTheDocument();
    expect(screen.getAllByText('planner').length).toBeGreaterThan(0);
    expect(screen.getAllByText('coder').length).toBeGreaterThan(0);
  });

  it('shows WebSocket connection status when session is active', async () => {
    const mockUseCollabSocket = useCollabSocket as ReturnType<typeof vi.fn>;
    mockUseCollabSocket.mockReturnValue({
      connected: true,
      onlineCount: 3,
      sendMessage: vi.fn(),
      sendTyping: vi.fn(),
    });

    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });
    fireEvent.click(screen.getByText('Planner').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Start Collaboration' }));

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalled();
    });

    // Should show online count
    await waitFor(() => {
      expect(screen.getByText('3 online')).toBeInTheDocument();
    });
  });

  it('receives real-time messages via WebSocket callbacks', async () => {
    let capturedOnMessage: ((msg: any) => void) | null = null;

    const mockUseCollabSocket = useCollabSocket as ReturnType<typeof vi.fn>;
    mockUseCollabSocket.mockImplementation(
      ({ onMessage }: { onMessage?: (msg: any) => void }) => {
        capturedOnMessage = onMessage || null;
        return {
          connected: true,
          onlineCount: 1,
          sendMessage: vi.fn(),
          sendTyping: vi.fn(),
        };
      },
    );

    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });
    fireEvent.click(screen.getByText('Planner').closest('button')!);
    fireEvent.click(screen.getByRole('button', { name: 'Start Collaboration' }));

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalled();
    });

    expect(capturedOnMessage).not.toBeNull();

    // Simulate WebSocket receiving a new message
    const newMsg = {
      id: 'msg-3',
      from: 'coder' as const,
      to: 'orchestrator' as const,
      content: 'Coding completed successfully',
      timestamp: Date.now(),
      type: 'response' as const,
    };

    await waitFor(() => {
      capturedOnMessage!(newMsg);
    });

    // The new message should appear
    await waitFor(() => {
      expect(screen.getByText('Coding completed successfully')).toBeInTheDocument();
    });
  });

  it('resets panel when "New Collaboration" is clicked', async () => {
    (fetchRoles as ReturnType<typeof vi.fn>).mockResolvedValue(mockRoles);
    (createCollabSession as ReturnType<typeof vi.fn>).mockResolvedValue(mockSession);

    render(<CollabPanel open onClose={onClose} />);

    await waitFor(() => {
      expect(fetchRoles).toHaveBeenCalled();
    });

    // Start a session
    const textarea = screen.getByPlaceholderText(/e\.g\. Build/);
    fireEvent.change(textarea, { target: { value: 'Build an authentication system' } });
    const plannerButton = screen.getByText('Planner').closest('button')!;
    fireEvent.click(plannerButton);
    fireEvent.click(screen.getByRole('button', { name: 'Start Collaboration' }));

    await waitFor(() => {
      expect(createCollabSession).toHaveBeenCalled();
    });

    // Verify session view
    expect(screen.getByText('Build an authentication system')).toBeInTheDocument();

    // Click "New Collaboration"
    fireEvent.click(screen.getByRole('button', { name: 'New Collaboration' }));

    // Should be back to setup view
    expect(screen.getByRole('button', { name: 'Start Collaboration' })).toBeInTheDocument();
    expect(screen.queryByText('Build an authentication system')).not.toBeInTheDocument();
    expect(screen.queryByText('Planning...')).not.toBeInTheDocument();
  });
});
