import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ReplayPlayer } from './ReplayPlayer';
import type { ExecutionTrace, TraceSummary } from '@deepspace/shared-types';

vi.mock('../lib/trace-api', () => ({
  fetchTraces: vi.fn(),
  fetchTrace: vi.fn(),
}));

import { fetchTraces, fetchTrace } from '../lib/trace-api';

const mockFetchTraces = vi.mocked(fetchTraces);
const mockFetchTrace = vi.mocked(fetchTrace);

const mockTraceSummary: TraceSummary = {
  id: 'trace-1',
  sessionId: 'session-1',
  userMessage: 'Hello world',
  totalSteps: 3,
  toolCount: 1,
  createdAt: Date.now() / 1000,
  durationMs: 500,
};

const mockTraceSummary2: TraceSummary = {
  id: 'trace-2',
  sessionId: 'session-1',
  userMessage: 'Write a test file',
  totalSteps: 5,
  toolCount: 3,
  createdAt: Date.now() / 1000 - 60,
  durationMs: 1200,
};

const mockTrace: ExecutionTrace = {
  id: 'trace-1',
  sessionId: 'session-1',
  userMessage: 'Hello world',
  agentReply: 'Hi there!',
  steps: [
    { step: 1, type: 'thinking', timestamp: Date.now(), content: 'Thinking...' },
    {
      step: 2,
      type: 'tool_call',
      timestamp: Date.now(),
      toolName: 'read_file',
      toolArgs: { path: 'test.txt' },
      toolResult: 'file content here',
      durationMs: 50,
    },
    { step: 3, type: 'text', timestamp: Date.now(), content: 'Here is the file content' },
  ],
  totalSteps: 3,
  createdAt: Date.now() / 1000,
  durationMs: 500,
};

beforeEach(() => {
  mockFetchTraces.mockReset();
  mockFetchTrace.mockReset();
});

afterEach(() => {
  if (vi.isFakeTimers()) {
    vi.useRealTimers();
  }
});

/** Helper: find the play/pause button (the one with rounded-full class). */
function getPlayPauseButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector('button.rounded-full')!;
}

/** Helper: find the step-back button (contains SkipBack SVG). */
function getStepBackButton(container: HTMLElement): HTMLButtonElement {
  const buttons = container.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.querySelector('svg')?.classList.contains('lucide-skip-back')
  )!;
}

/** Helper: find the step-forward button (contains SkipForward SVG). */
function getStepForwardButton(container: HTMLElement): HTMLButtonElement {
  const buttons = container.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.querySelector('svg')?.classList.contains('lucide-skip-forward')
  )!;
}

/** Helper: find the close button (contains X SVG). */
function getCloseButton(container: HTMLElement): HTMLButtonElement {
  const buttons = container.querySelectorAll('button');
  return Array.from(buttons).find(
    (btn) => btn.querySelector('svg')?.classList.contains('lucide-x')
  )!;
}

/** Helper: find the progress bar inner div (has inline style with width). */
function getProgressBar(container: HTMLElement): HTMLDivElement {
  return container.querySelector('div[style*="width"]')!;
}

/** Helper: wait for trace list to appear, then click a trace by userMessage. */
async function selectTrace(container: HTMLElement, message: string) {
  // Wait for the trace list to render
  await waitFor(() => {
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  // Click the first matching element (in the trace list, not the query info)
  const els = screen.getAllByText(message);
  fireEvent.click(els[0]);

  // Wait for trace detail to load
  await waitFor(() => {
    expect(screen.getByText('Query:')).toBeInTheDocument();
  });
}

describe('ReplayPlayer', () => {
  beforeEach(() => {
    mockFetchTraces.mockReset();
    mockFetchTrace.mockReset();
    mockFetchTraces.mockResolvedValue([]);
    mockFetchTrace.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (vi.isFakeTimers()) {
      vi.useRealTimers();
    }
  });

  // 1. open=false returns null
  it('returns null when open is false', () => {
    const { container } = render(
      <ReplayPlayer open={false} onClose={vi.fn()} sessionId="session-1" />
    );
    expect(container.innerHTML).toBe('');
  });

  // 2. open=true renders the dialog with title "Execution Replay"
  it('renders the dialog with title when open is true', async () => {
    mockFetchTraces.mockResolvedValue([]);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('Execution Replay')).toBeInTheDocument();
    });
  });

  // 3. Empty traces shows "暂无执行记录"
  it('shows empty state message when no traces exist', async () => {
    mockFetchTraces.mockResolvedValue([]);
    render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('暂无执行记录')).toBeInTheDocument();
    });
  });

  // 4. Renders trace list when data exists (mock fetchTraces)
  it('renders trace list items when traces are available', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary, mockTraceSummary2]);
    render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getByText('Write a test file')).toBeInTheDocument();
    });
    expect(mockFetchTraces).toHaveBeenCalledWith('session-1');
  });

  // 5. Clicking a trace item loads the trace detail (mock fetchTrace)
  it('loads trace detail when a trace item is clicked', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );
    await waitFor(() => {
      expect(screen.getByText('Hello world')).toBeInTheDocument();
    });

    // Click the trace list item (first matching element)
    const els = screen.getAllByText('Hello world');
    fireEvent.click(els[0]);

    await waitFor(() => {
      expect(mockFetchTrace).toHaveBeenCalledWith('trace-1');
    });
    expect(screen.getByText('Query:')).toBeInTheDocument();
    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();
  });

  // 6. Play/pause toggle button
  it('toggles between play and pause icons', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await selectTrace(container, 'Hello world');

    const playPauseBtn = getPlayPauseButton(container);

    // Initially shows Play icon (SVG with lucide-play class)
    const playIcon = playPauseBtn.querySelector('svg.lucide-play');
    expect(playIcon).toBeInTheDocument();

    // Click to start playing
    fireEvent.click(playPauseBtn);

    // Now shows Pause icon (SVG with lucide-pause class)
    await waitFor(() => {
      const pauseIcon = playPauseBtn.querySelector('svg.lucide-pause');
      expect(pauseIcon).toBeInTheDocument();
    });
  });

  // 7. Step back button (disabled at step 0)
  it('disables step back button at the first step', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await selectTrace(container, 'Hello world');

    const stepBackBtn = getStepBackButton(container);
    expect(stepBackBtn.disabled).toBe(true);
  });

  // 8. Step forward button
  it('advances to the next step when step forward is clicked', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await selectTrace(container, 'Hello world');

    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();

    const stepForwardBtn = getStepForwardButton(container);
    expect(stepForwardBtn.disabled).toBe(false);

    fireEvent.click(stepForwardBtn);

    await waitFor(() => {
      expect(screen.getByText('Step 2 / 3')).toBeInTheDocument();
    });
  });

  // 9. Progress bar shows correct percentage
  it('shows correct progress bar width based on current step', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);
    const { container } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await selectTrace(container, 'Hello world');

    // At step 0 (first step): (0+1)/3 = 33.333...%
    const progressBar = getProgressBar(container);
    expect(progressBar.getAttribute('style')).toContain('33.333');

    // Click step forward to advance
    const stepForwardBtn = getStepForwardButton(container);
    fireEvent.click(stepForwardBtn);

    // At step 1: (1+1)/3 = 66.666...%
    await waitFor(() => {
      const bar = getProgressBar(container);
      expect(bar.getAttribute('style')).toContain('66.666');
    });
  });

  // 10. Auto-play timer advances steps (use fake timers)
  it('auto-advances steps when playing with fake timers', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);

    const { container, unmount } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    // First wait for component to load with real timers
    await selectTrace(container, 'Hello world');
    expect(screen.getByText('Step 1 / 3')).toBeInTheDocument();

    // Now switch to fake timers for the timer-driven assertions
    vi.useFakeTimers();

    // Start playing
    const playPauseBtn = getPlayPauseButton(container);
    fireEvent.click(playPauseBtn);

    // Advance one tick (1200ms)
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText('Step 2 / 3')).toBeInTheDocument();

    // Advance another tick
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText('Step 3 / 3')).toBeInTheDocument();

    // At last step, playing stops; advancing further stays at step 3
    act(() => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByText('Step 3 / 3')).toBeInTheDocument();

    unmount();
  });

  // 11. onClose button works
  it('calls onClose when the close button is clicked', async () => {
    const onClose = vi.fn();
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    const { container } = render(
      <ReplayPlayer open={true} onClose={onClose} sessionId="session-1" />
    );

    await waitFor(() => {
      expect(screen.getByText('Execution Replay')).toBeInTheDocument();
    });

    const closeBtn = getCloseButton(container);
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // 12. Timer cleanup on unmount
  it('clears the autoplay timer on unmount without errors', async () => {
    mockFetchTraces.mockResolvedValue([mockTraceSummary]);
    mockFetchTrace.mockResolvedValue(mockTrace);

    const { container, unmount } = render(
      <ReplayPlayer open={true} onClose={vi.fn()} sessionId="session-1" />
    );

    await selectTrace(container, 'Hello world');

    // Start playing
    const playPauseBtn = getPlayPauseButton(container);
    fireEvent.click(playPauseBtn);

    // Unmount while playing - should not throw or leave hanging timers
    vi.useFakeTimers();
    expect(() => unmount()).not.toThrow();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });
});
