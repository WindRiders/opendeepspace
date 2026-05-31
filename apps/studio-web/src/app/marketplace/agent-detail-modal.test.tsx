import { render, screen, fireEvent } from '@testing-library/react';
import { AgentDetailModal } from './agent-detail-modal';
import type { MarketplaceAgent } from '@deepspace/shared-types';

const mockAgent: MarketplaceAgent = {
  id: 'a1',
  name: 'Code Reviewer',
  description: 'Expert code review agent',
  dna: 'You are a code review expert',
  author: 'dev123',
  tags: ['python', 'review'],
  stars: 42,
  downloads: 128,
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};

describe('AgentDetailModal', () => {
  it('should render agent name and description', () => {
    render(<AgentDetailModal agent={mockAgent} onClose={vi.fn()} onStar={vi.fn()} onToast={vi.fn()} />);
    expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Expert code review agent')).toBeInTheDocument();
  });

  it('should render DNA content', () => {
    render(<AgentDetailModal agent={mockAgent} onClose={vi.fn()} onStar={vi.fn()} onToast={vi.fn()} />);
    expect(screen.getByText('You are a code review expert')).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(<AgentDetailModal agent={mockAgent} onClose={vi.fn()} onStar={vi.fn()} onToast={vi.fn()} />);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
  });

  it('should call onToast when copy button clicked', async () => {
    const onToast = vi.fn();
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    render(<AgentDetailModal agent={mockAgent} onClose={vi.fn()} onStar={vi.fn()} onToast={onToast} />);
    fireEvent.click(screen.getByText(/复制 DNA 并使用/));

    expect(writeText).toHaveBeenCalledWith('You are a code review expert');
    await vi.waitFor(() => {
      expect(onToast).toHaveBeenCalledWith('DNA 已复制到剪贴板');
    });

    vi.unstubAllGlobals();
  });

  it('should call onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<AgentDetailModal agent={mockAgent} onClose={onClose} onStar={vi.fn()} onToast={vi.fn()} />);
    const closeBtn = screen.getByRole('button', { name: '' });
    const xBtn = closeBtn.parentElement?.querySelector('button:last-of-type');
    fireEvent.click(xBtn!);
    expect(onClose).toHaveBeenCalled();
  });
});