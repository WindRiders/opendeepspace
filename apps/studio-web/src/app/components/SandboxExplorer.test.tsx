import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SandboxExplorer } from '../components/SandboxExplorer';
import * as sandboxApi from '../lib/sandbox-api';

vi.mock('../lib/sandbox-api', () => ({
  fetchSandboxFiles: vi.fn(),
  readSandboxFile: vi.fn(),
}));

describe('SandboxExplorer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    render(<SandboxExplorer open={false} onClose={vi.fn()} />);
    expect(screen.queryByText('Sandbox Explorer')).not.toBeInTheDocument();
  });

  it('should render when open', async () => {
    vi.mocked(sandboxApi.fetchSandboxFiles).mockResolvedValue([]);

    render(<SandboxExplorer open={true} onClose={vi.fn()} />);

    expect(screen.getByText('Sandbox Explorer')).toBeInTheDocument();
  });

  it('should load files on open', async () => {
    vi.mocked(sandboxApi.fetchSandboxFiles).mockResolvedValue([
      { name: 'test.txt', path: 'test.txt', type: 'file' as const, size: 100 },
    ]);

    render(<SandboxExplorer open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('test.txt')).toBeInTheDocument();
    });
  });

  it('should show empty message when no files', async () => {
    vi.mocked(sandboxApi.fetchSandboxFiles).mockResolvedValue([]);

    render(<SandboxExplorer open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('沙盒为空')).toBeInTheDocument();
    });
  });

  it('should read file when selected', async () => {
    vi.mocked(sandboxApi.fetchSandboxFiles).mockResolvedValue([
      { name: 'hello.txt', path: 'hello.txt', type: 'file' as const, size: 50 },
    ]);
    vi.mocked(sandboxApi.readSandboxFile).mockResolvedValue({
      content: 'Hello World',
      size: 50,
      language: 'text',
    });

    render(<SandboxExplorer open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('hello.txt')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('hello.txt'));

    await waitFor(() => {
      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });
  });

  it('should call onClose when close button clicked', async () => {
    const onClose = vi.fn();
    vi.mocked(sandboxApi.fetchSandboxFiles).mockResolvedValue([]);

    const { container } = render(<SandboxExplorer open={true} onClose={onClose} />);

    // The close button is the last button in the header
    const buttons = container.querySelectorAll('button');
    // Last button is the close (X) button
    fireEvent.click(buttons[buttons.length - 1]);

    expect(onClose).toHaveBeenCalled();
  });

  it('should refresh files when refresh button clicked', async () => {
    vi.mocked(sandboxApi.fetchSandboxFiles)
      .mockResolvedValueOnce([{ name: 'file1.txt', path: 'file1.txt', type: 'file' as const }])
      .mockResolvedValueOnce([{ name: 'file1.txt', path: 'file1.txt', type: 'file' as const }, { name: 'file2.txt', path: 'file2.txt', type: 'file' as const }]);

    render(<SandboxExplorer open={true} onClose={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText('file1.txt')).toBeInTheDocument();
    });

    // Refresh button
    const buttons = screen.getAllByRole('button');
    const refreshBtn = buttons.find((b) => b.title === 'Refresh');
    if (refreshBtn) fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(screen.getByText('file2.txt')).toBeInTheDocument();
    });
  });
});
