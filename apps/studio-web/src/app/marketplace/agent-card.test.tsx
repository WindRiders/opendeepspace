import { render, screen, fireEvent } from '@testing-library/react';
import { AgentCard } from './agent-card';
import type { MarketplaceAgent } from '@deepspace/shared-types';

const mockAgent: MarketplaceAgent = {
  id: 'a1',
  name: 'Code Reviewer',
  description: 'Expert code review agent',
  dna: 'You are...',
  author: 'dev123',
  tags: ['python', 'review'],
  stars: 42,
  downloads: 128,
  createdAt: Math.floor(Date.now() / 1000),
  updatedAt: Math.floor(Date.now() / 1000),
};

describe('AgentCard', () => {
  it('should render agent name and description', () => {
    render(<AgentCard agent={mockAgent} onSelect={vi.fn()} onStar={vi.fn()} onDownload={vi.fn()} />);
    expect(screen.getByText('Code Reviewer')).toBeInTheDocument();
    expect(screen.getByText('Expert code review agent')).toBeInTheDocument();
  });

  it('should render tags', () => {
    render(<AgentCard agent={mockAgent} onSelect={vi.fn()} onStar={vi.fn()} onDownload={vi.fn()} />);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText('review')).toBeInTheDocument();
  });

  it('should render star and download counts', () => {
    render(<AgentCard agent={mockAgent} onSelect={vi.fn()} onStar={vi.fn()} onDownload={vi.fn()} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('should call onSelect when card clicked', () => {
    const onSelect = vi.fn();
    render(<AgentCard agent={mockAgent} onSelect={onSelect} onStar={vi.fn()} onDownload={vi.fn()} />);
    fireEvent.click(screen.getByText('Code Reviewer').closest('div')!);
    expect(onSelect).toHaveBeenCalledWith(mockAgent);
  });

  it('should call onStar with id and event', () => {
    const onStar = vi.fn();
    render(<AgentCard agent={mockAgent} onSelect={vi.fn()} onStar={onStar} onDownload={vi.fn()} />);
    const btns = screen.getAllByRole('button');
    const starBtn = btns.find((b) => b.textContent?.includes('42'));
    fireEvent.click(starBtn!);
    expect(onStar).toHaveBeenCalledWith('a1', expect.any(Object));
  });

  it('should call onDownload with id and event', () => {
    const onDownload = vi.fn();
    render(<AgentCard agent={mockAgent} onSelect={vi.fn()} onStar={vi.fn()} onDownload={onDownload} />);
    fireEvent.click(screen.getByTitle('下载'));
    expect(onDownload).toHaveBeenCalledWith('a1', expect.any(Object));
  });
});