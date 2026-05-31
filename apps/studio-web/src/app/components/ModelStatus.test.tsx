import { render, screen } from '@testing-library/react';
import { ModelStatus } from './ModelStatus';

describe('ModelStatus', () => {
  it('should return null when providers array is empty', () => {
    const { container } = render(<ModelStatus providers={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render the header', () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0, totalCalls: 100, consecutiveFailures: 0 },
    ];
    render(<ModelStatus providers={providers} />);
    expect(screen.getByText('Model Router')).toBeInTheDocument();
  });

  it('should show healthy provider with green status', () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0, totalCalls: 100, consecutiveFailures: 0 },
    ];
    render(<ModelStatus providers={providers} />);
    expect(screen.getByText('deepseek-chat')).toBeInTheDocument();
    expect(screen.getByText('Healthy')).toBeInTheDocument();
  });

  it('should show down provider with red status', () => {
    const providers = [
      { name: 'qwen-turbo', healthy: false, failureRate: 0.8, totalCalls: 10, consecutiveFailures: 5 },
    ];
    render(<ModelStatus providers={providers} />);
    expect(screen.getByText('qwen-turbo')).toBeInTheDocument();
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('should show failure rate when above zero', () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0.123, totalCalls: 100, consecutiveFailures: 0 },
    ];
    render(<ModelStatus providers={providers} />);
    expect(screen.getByText('12.3% fail')).toBeInTheDocument();
  });

  it('should not show failure rate when zero', () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0, totalCalls: 100, consecutiveFailures: 0 },
    ];
    render(<ModelStatus providers={providers} />);
    expect(screen.queryByText(/fail/)).not.toBeInTheDocument();
  });

  it('should render multiple providers', () => {
    const providers = [
      { name: 'deepseek-chat', healthy: true, failureRate: 0.05, totalCalls: 100, consecutiveFailures: 1 },
      { name: 'qwen-turbo', healthy: false, failureRate: 0.5, totalCalls: 20, consecutiveFailures: 5 },
      { name: 'qwen-plus', healthy: true, failureRate: 0, totalCalls: 50, consecutiveFailures: 0 },
    ];
    render(<ModelStatus providers={providers} />);

    expect(screen.getByText('deepseek-chat')).toBeInTheDocument();
    expect(screen.getByText('qwen-turbo')).toBeInTheDocument();
    expect(screen.getByText('qwen-plus')).toBeInTheDocument();

    // Two healthy, one down
    expect(screen.getAllByText('Healthy')).toHaveLength(2);
    expect(screen.getByText('Down')).toBeInTheDocument();
  });

  it('should show wifi icons for each provider', () => {
    const providers = [
      { name: 'p1', healthy: true, failureRate: 0, totalCalls: 1, consecutiveFailures: 0 },
    ];
    const { container } = render(<ModelStatus providers={providers} />);
    // lucide-react icons render as svg elements
    const svgs = container.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(2); // Cpu icon + wifi icon
  });
});