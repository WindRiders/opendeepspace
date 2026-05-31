import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryPanel } from './MemoryPanel';

vi.mock('../hooks/useMemory', () => ({
  useMemory: vi.fn(),
}));

import { useMemory } from '../hooks/useMemory';
const mockedUseMemory = vi.mocked(useMemory);

const defaultMemoryReturn = {
  memories: [] as any[],
  loading: false,
  recall: vi.fn(),
};

describe('MemoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseMemory.mockReturnValue(defaultMemoryReturn);
  });

  it('should render the panel header', () => {
    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('Memory Search')).toBeInTheDocument();
  });

  it('should render search input', () => {
    render(<MemoryPanel token="token-123" />);
    expect(screen.getByPlaceholderText('Search memories...')).toBeInTheDocument();
  });

  it('should show empty state when no memories', () => {
    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('Enter a query to search memories')).toBeInTheDocument();
  });

  it('should show loading spinner when searching', () => {
    mockedUseMemory.mockReturnValue({
      ...defaultMemoryReturn,
      loading: true,
    });

    render(<MemoryPanel token="token-123" />);
    const button = screen.getByRole('button');
    expect(button.querySelector('.animate-spin')).toBeTruthy();
  });

  it('should call recall on Enter key', () => {
    const recall = vi.fn();
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, recall });

    render(<MemoryPanel token="token-123" />);
    const input = screen.getByPlaceholderText('Search memories...');
    fireEvent.change(input, { target: { value: 'test query' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(recall).toHaveBeenCalledWith('test query');
  });

  it('should call recall on button click', () => {
    const recall = vi.fn();
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, recall });

    render(<MemoryPanel token="token-123" />);
    const input = screen.getByPlaceholderText('Search memories...');
    fireEvent.change(input, { target: { value: 'hello' } });

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(recall).toHaveBeenCalledWith('hello');
  });

  it('should not call recall on empty query', () => {
    const recall = vi.fn();
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, recall });

    render(<MemoryPanel token="token-123" />);
    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(recall).not.toHaveBeenCalled();
  });

  it('should not call recall on whitespace-only query', () => {
    const recall = vi.fn();
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, recall });

    render(<MemoryPanel token="token-123" />);
    const input = screen.getByPlaceholderText('Search memories...');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(recall).not.toHaveBeenCalled();
  });

  it('should disable search button while loading', () => {
    mockedUseMemory.mockReturnValue({
      ...defaultMemoryReturn,
      loading: true,
    });

    render(<MemoryPanel token="token-123" />);
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should render memory items with layers', () => {
    const memories = [
      { id: '1', content: 'Content A', summary: 'Summary A', layer: 'SHORT_TERM', memoryType: 'fact', importance: 0.5, tags: [] },
      { id: '2', content: 'Content B', summary: 'Summary B', layer: 'LONG_TERM', memoryType: 'concept', importance: 0.9, tags: ['tag1'] },
    ];
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, memories });

    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('Summary A')).toBeInTheDocument();
    expect(screen.getByText('Summary B')).toBeInTheDocument();
    expect(screen.getByText('SHORT TERM')).toBeInTheDocument();
    expect(screen.getByText('LONG TERM')).toBeInTheDocument();
  });

  it('should show importance percentage', () => {
    const memories = [
      { id: '1', content: 'C', summary: 'S', layer: 'SHORT_TERM', memoryType: '', importance: 0.75, tags: [] },
    ];
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, memories });

    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('should not show importance when zero', () => {
    const memories = [
      { id: '1', content: 'C', summary: 'S', layer: 'SHORT_TERM', memoryType: '', importance: 0, tags: [] },
    ];
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, memories });

    render(<MemoryPanel token="token-123" />);
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('should show tags when present', () => {
    const memories = [
      { id: '1', content: 'C', summary: 'S', layer: 'SHORT_TERM', memoryType: '', importance: 0, tags: ['ai', 'coding'] },
    ];
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, memories });

    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('ai')).toBeInTheDocument();
    expect(screen.getByText('coding')).toBeInTheDocument();
  });

  it('should use content preview when no summary', () => {
    const memories = [
      { id: '1', content: 'A'.repeat(300), summary: '', layer: 'UNKNOWN', memoryType: '', importance: 0, tags: [] },
    ];
    mockedUseMemory.mockReturnValue({ ...defaultMemoryReturn, memories });

    render(<MemoryPanel token="token-123" />);
    expect(screen.getByText('A'.repeat(200))).toBeInTheDocument();
  });
});