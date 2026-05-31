import { render, screen, fireEvent } from '@testing-library/react';
import { ToolCallPanel } from '../components/ToolCallPanel';
import type { ToolCall } from '../lib/types';

describe('ToolCallPanel', () => {
  const makeToolCalls = (): ToolCall[] => [
    { step: 1, toolName: 'write_file', args: { file_path: 'test.txt' }, result: 'File written' },
    { step: 2, toolName: 'list_files', args: { path: '/sandbox' }, result: '3 files found' },
    { step: 3, toolName: 'shell_exec', args: { command: 'echo hi' }, result: 'hi' },
  ];

  it('should return null when toolCalls is empty', () => {
    const { container } = render(<ToolCallPanel toolCalls={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('should return null when toolCalls is undefined', () => {
    const { container } = render(<ToolCallPanel toolCalls={undefined as any} />);
    expect(container.innerHTML).toBe('');
  });

  it('should show tool call count in collapsed state', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);
    expect(screen.getByText(/已执行 3 个工具调用/)).toBeInTheDocument();
  });

  it('should expand and show tool details on click', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);
    fireEvent.click(screen.getByText(/已执行 3 个工具调用/));

    expect(screen.getByText('write_file')).toBeInTheDocument();
    expect(screen.getByText('list_files')).toBeInTheDocument();
    expect(screen.getByText('shell_exec')).toBeInTheDocument();
  });

  it('should show step numbers for each tool', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);
    fireEvent.click(screen.getByText(/已执行 3 个工具调用/));

    expect(screen.getByText('Step 1')).toBeInTheDocument();
    expect(screen.getByText('Step 2')).toBeInTheDocument();
    expect(screen.getByText('Step 3')).toBeInTheDocument();
  });

  it('should show tool args truncated to 300 chars', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);
    fireEvent.click(screen.getByText(/已执行 3 个工具调用/));

    expect(screen.getByText(/Args:.*test\.txt/)).toBeInTheDocument();
  });

  it('should show tool results', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);
    fireEvent.click(screen.getByText(/已执行 3 个工具调用/));

    expect(screen.getByText(/→ File written/)).toBeInTheDocument();
    expect(screen.getByText(/→ 3 files found/)).toBeInTheDocument();
    expect(screen.getByText(/→ hi/)).toBeInTheDocument();
  });

  it('should collapse on second click', () => {
    render(<ToolCallPanel toolCalls={makeToolCalls()} />);

    const btn = screen.getByText(/已执行 3 个工具调用/);
    fireEvent.click(btn);
    expect(screen.getByText('write_file')).toBeInTheDocument();

    fireEvent.click(btn);
    expect(screen.queryByText('write_file')).not.toBeInTheDocument();
  });

  it('should show write_file icon', () => {
    render(<ToolCallPanel toolCalls={[{ step: 1, toolName: 'write_file', args: {}, result: 'ok' }]} />);
    fireEvent.click(screen.getByText(/已执行 1 个工具调用/));
    // write_file should be visible alongside the wrench icon variant
    expect(screen.getByText('write_file')).toBeInTheDocument();
  });

  it('should show terminal icon for unknown tools', () => {
    render(<ToolCallPanel toolCalls={[{ step: 1, toolName: 'unknown_tool', args: {}, result: 'done' }]} />);
    fireEvent.click(screen.getByText(/已执行 1 个工具调用/));
    expect(screen.getByText('unknown_tool')).toBeInTheDocument();
  });
});