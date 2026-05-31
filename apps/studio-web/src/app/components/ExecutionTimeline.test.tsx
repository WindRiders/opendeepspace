import { render, screen, fireEvent } from '@testing-library/react';
import { ExecutionTimeline } from '../components/ExecutionTimeline';
import type { ExecutionStep } from '../lib/types';

describe('ExecutionTimeline', () => {
  it('should return null for empty steps', () => {
    const { container } = render(<ExecutionTimeline steps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('should return null for single step with no tools', () => {
    const steps: ExecutionStep[] = [{ step: 1, status: 'complete', tools: [], startTime: Date.now() }];
    const { container } = render(<ExecutionTimeline steps={steps} />);
    expect(container.firstChild).toBeNull();
  });

  it('should render timeline for multiple steps', () => {
    const steps: ExecutionStep[] = [
      { step: 1, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
      { step: 2, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
    ];
    render(<ExecutionTimeline steps={steps} />);

    expect(screen.getByText('Execution Timeline')).toBeInTheDocument();
    expect(screen.getByText('2 steps · 0 tool calls')).toBeInTheDocument();
  });

  it('should render timeline for steps with tools', () => {
    const steps: ExecutionStep[] = [
      {
        step: 1,
        status: 'complete',
        tools: [{ toolName: 'write_file', args: { path: 'test.txt' }, status: 'done' as const }],
        startTime: Date.now(),
        endTime: Date.now(),
      },
    ];
    render(<ExecutionTimeline steps={steps} />);

    expect(screen.getByText(/1 step.*1 tool/)).toBeInTheDocument();
  });

  it('should expand to show steps', () => {
    const steps: ExecutionStep[] = [
      { step: 1, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
      { step: 2, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
    ];
    render(<ExecutionTimeline steps={steps} />);

    fireEvent.click(screen.getByText('Execution Timeline'));

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
  });

  it('should show thinking text', () => {
    const steps: ExecutionStep[] = [
      { step: 1, status: 'thinking', tools: [], thinkingText: 'Step 1: Analyzing request', startTime: Date.now() },
      { step: 2, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
    ];
    render(<ExecutionTimeline steps={steps} />);

    fireEvent.click(screen.getByText('Execution Timeline'));

    expect(screen.getByText('Step 1: Analyzing request')).toBeInTheDocument();
  });

  it('should show tool calls in expanded step', () => {
    const steps: ExecutionStep[] = [
      {
        step: 1,
        status: 'complete',
        tools: [{ toolName: 'write_file', args: { path: 'test.txt', content: 'hello' }, status: 'done' as const, result: 'ok' }],
        thinkingText: 'Writing file',
        startTime: Date.now(),
        endTime: Date.now(),
      },
      { step: 2, status: 'complete', tools: [], startTime: Date.now(), endTime: Date.now() },
    ];
    render(<ExecutionTimeline steps={steps} />);

    fireEvent.click(screen.getByText('Execution Timeline'));

    // Expand the step
    fireEvent.click(screen.getByText('1 tool call'));

    expect(screen.getByText('write_file')).toBeInTheDocument();
  });
});
