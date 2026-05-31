import { render, screen } from '@testing-library/react';
import { AutonomousPanel } from './AutonomousPanel';

const defaultProps = {
  isIdle: true,
  pendingTasks: [],
  activeTask: null,
  dailyCost: 0,
  dailyBudget: 1,
};

describe('AutonomousPanel', () => {
  it('should render the header', () => {
    render(<AutonomousPanel {...defaultProps} />);
    expect(screen.getByText('Autonomous Learner')).toBeInTheDocument();
  });

  it('should show Idle status when idle', () => {
    render(<AutonomousPanel {...defaultProps} />);
    expect(screen.getByText('Status: Idle')).toBeInTheDocument();
  });

  it('should show Active status with spinner when not idle', () => {
    render(<AutonomousPanel {...defaultProps} isIdle={false} />);
    expect(screen.getByText('Status: Active')).toBeInTheDocument();
  });

  it('should show daily cost', () => {
    render(<AutonomousPanel {...defaultProps} dailyCost={0.345} dailyBudget={2.5} />);
    expect(screen.getByText('Cost: $0.345 / $2.50')).toBeInTheDocument();
  });

  it('should show empty state when no tasks', () => {
    render(<AutonomousPanel {...defaultProps} />);
    expect(screen.getByText('No active learning tasks')).toBeInTheDocument();
  });

  it('should show active task when present', () => {
    render(
      <AutonomousPanel
        {...defaultProps}
        isIdle={false}
        activeTask={{ id: 't1', topic: 'Refactor auth module', priority: 0.9, status: 'researching' }}
      />,
    );
    expect(screen.getByText('Refactor auth module')).toBeInTheDocument();
    expect(screen.getByText('researching')).toBeInTheDocument();
  });

  it('should show pending tasks count and list', () => {
    const pendingTasks = [
      { id: 't1', topic: 'Learn Rust', priority: 0.8, status: 'pending' },
      { id: 't2', topic: 'Fix memory leak', priority: 0.6, status: 'pending' },
    ];
    render(<AutonomousPanel {...defaultProps} pendingTasks={pendingTasks} />);

    expect(screen.getByText('Pending (2)')).toBeInTheDocument();
    expect(screen.getByText('Learn Rust')).toBeInTheDocument();
    expect(screen.getByText('Fix memory leak')).toBeInTheDocument();
  });

  it('should show priority as percentage for each pending task', () => {
    const pendingTasks = [
      { id: 't1', topic: 'Task A', priority: 0.75, status: 'pending' },
    ];
    render(<AutonomousPanel {...defaultProps} pendingTasks={pendingTasks} />);

    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('should not show empty state when active task exists', () => {
    render(
      <AutonomousPanel
        {...defaultProps}
        activeTask={{ id: 't1', topic: 'Active task', priority: 0.5, status: 'analyzing' }}
      />,
    );
    expect(screen.queryByText('No active learning tasks')).not.toBeInTheDocument();
  });

  it('should not show empty state when pending tasks exist', () => {
    render(
      <AutonomousPanel
        {...defaultProps}
        pendingTasks={[{ id: 't1', topic: 'Task', priority: 0.5, status: 'pending' }]}
      />,
    );
    expect(screen.queryByText('No active learning tasks')).not.toBeInTheDocument();
  });

  it('should show active task with completed status', () => {
    render(
      <AutonomousPanel
        {...defaultProps}
        isIdle={false}
        activeTask={{ id: 't1', topic: 'Completed task', priority: 0.7, status: 'completed' }}
      />,
    );
    expect(screen.getByText('Completed task')).toBeInTheDocument();
    expect(screen.getByText('completed')).toBeInTheDocument();
  });
});