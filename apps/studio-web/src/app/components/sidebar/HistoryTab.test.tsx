import { render, screen, fireEvent } from '@testing-library/react';
import { HistoryTab } from './HistoryTab';
import type { ConversationSummary } from '@deepspace/shared-types';

const mockConvs: ConversationSummary[] = [
  { id: 'c1', title: 'Debug auth flow', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 5 },
  { id: 'c2', title: 'Build API docs', createdAt: Date.now(), updatedAt: Date.now(), messageCount: 12 },
];

describe('HistoryTab', () => {
  it('should render conversation list', () => {
    render(
      <HistoryTab conversations={mockConvs} currentSessionId="c1" onDelete={vi.fn()} />,
    );
    expect(screen.getByText('Debug auth flow')).toBeInTheDocument();
    expect(screen.getByText('Build API docs')).toBeInTheDocument();
  });

  it('should show message count for each conversation', () => {
    render(
      <HistoryTab conversations={mockConvs} currentSessionId="c1" onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/5 条消息/)).toBeInTheDocument();
    expect(screen.getByText(/12 条消息/)).toBeInTheDocument();
  });

  it('should highlight current session', () => {
    render(
      <HistoryTab conversations={mockConvs} currentSessionId="c1" onDelete={vi.fn()} />,
    );
    const activeTitle = screen.getByText('Debug auth flow');
    const outerDiv = activeTitle.parentElement?.parentElement;
    expect(outerDiv?.className).toContain('bg-purple');
  });

  it('should not highlight non-current sessions', () => {
    render(
      <HistoryTab conversations={mockConvs} currentSessionId="c1" onDelete={vi.fn()} />,
    );
    const inactiveTitle = screen.getByText('Build API docs');
    const outerDiv = inactiveTitle.parentElement?.parentElement;
    expect(outerDiv?.className).not.toContain('bg-purple');
  });

  it('should show empty state when no conversations', () => {
    render(
      <HistoryTab conversations={[]} currentSessionId="" onDelete={vi.fn()} />,
    );
    expect(screen.getByText(/暂无对话历史/)).toBeInTheDocument();
  });

  it('should call onDelete when delete button clicked', () => {
    const onDelete = vi.fn();
    render(
      <HistoryTab conversations={mockConvs} currentSessionId="c1" onDelete={onDelete} />,
    );
    const deleteBtns = screen.getAllByTitle('删除对话');
    fireEvent.click(deleteBtns[0]);
    expect(onDelete).toHaveBeenCalledWith('c1', expect.any(Object));
  });
});