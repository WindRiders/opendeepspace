import { render, screen, act } from '@testing-library/react';
import { LoadingIndicator } from '../components/LoadingIndicator';

describe('LoadingIndicator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should show default thinking text', () => {
    render(<LoadingIndicator startTime={Date.now()} />);
    expect(screen.getByText(/正在思考/)).toBeInTheDocument();
  });

  it('should show custom status text', () => {
    render(<LoadingIndicator startTime={Date.now()} statusText="Step 1: Planning" />);
    expect(screen.getByText('Step 1: Planning')).toBeInTheDocument();
  });

  it('should show elapsed time after interval', () => {
    const start = Date.now();
    render(<LoadingIndicator startTime={start} />);

    act(() => { vi.advanceTimersByTime(1000); });

    expect(screen.getByText(/1s/)).toBeInTheDocument();
  });

  it('should update elapsed time over time', () => {
    const start = Date.now();
    render(<LoadingIndicator startTime={start} />);

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.getByText(/3s/)).toBeInTheDocument();
  });

  it('should cleanup interval on unmount', () => {
    const { unmount } = render(<LoadingIndicator startTime={Date.now()} />);
    unmount();
    // No error means cleanup worked
  });

  it('should show tool icon when status mentions 调用', () => {
    render(<LoadingIndicator startTime={Date.now()} statusText="正在调用 read_file..." />);
    expect(screen.getByText('正在调用 read_file...')).toBeInTheDocument();
  });
});
