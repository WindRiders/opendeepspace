import { render, screen } from '@testing-library/react';
import { AgentStreamOutput } from './AgentStreamOutput';

describe('AgentStreamOutput', () => {
  it('should render nothing for empty map', () => {
    const { container } = render(<AgentStreamOutput agentStreams={new Map()} />);
    expect(container.textContent).toBe('');
  });

  it('should show agent name and spinner when not done', () => {
    const map = new Map();
    map.set('planner', { agentRole: 'planner', agentName: 'Planner', content: 'Partial output', done: false });
    render(<AgentStreamOutput agentStreams={map} />);
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('Partial output')).toBeInTheDocument();
  });

  it('should show agent name and checkmark when done', () => {
    const map = new Map();
    map.set('planner', { agentRole: 'planner', agentName: 'Planner', content: 'Complete output', done: true });
    render(<AgentStreamOutput agentStreams={map} />);
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('Complete output')).toBeInTheDocument();
  });

  it('should render multiple agent streams', () => {
    const map = new Map();
    map.set('planner', { agentRole: 'planner', agentName: 'Planner', content: 'Plan done', done: true });
    map.set('coder', { agentRole: 'coder', agentName: 'Coder', content: 'Code done', done: true });
    render(<AgentStreamOutput agentStreams={map} />);
    expect(screen.getByText('Plan done')).toBeInTheDocument();
    expect(screen.getByText('Code done')).toBeInTheDocument();
  });
});