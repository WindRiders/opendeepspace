import { render, screen, fireEvent } from '@testing-library/react';
import { AgentSetupView } from './AgentSetupView';
import type { AgentRoleConfig } from '@deepspace/shared-types';

const mockRoles: AgentRoleConfig[] = [
  { role: 'planner', name: 'Planner', description: 'Plans tasks', systemPrompt: '', icon: '' },
  { role: 'coder', name: 'Coder', description: 'Writes code', systemPrompt: '', icon: '' },
];

describe('AgentSetupView', () => {
  it('should render role selection grid', () => {
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={[]}
        task=""
        loading={false}
        onToggleRole={vi.fn()}
        onTaskChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('Planner')).toBeInTheDocument();
    expect(screen.getByText('Coder')).toBeInTheDocument();
  });

  it('should highlight selected roles with color class', () => {
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={['planner']}
        task=""
        loading={false}
        onToggleRole={vi.fn()}
        onTaskChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    const plannerBtn = screen.getByText('Planner').closest('button');
    const coderBtn = screen.getByText('Coder').closest('button');
    expect(plannerBtn?.className).toContain('amber');
    expect(coderBtn?.className).not.toContain('amber');
  });

  it('should call onToggleRole when role clicked', () => {
    const onToggleRole = vi.fn();
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={[]}
        task=""
        loading={false}
        onToggleRole={onToggleRole}
        onTaskChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText('Coder'));
    expect(onToggleRole).toHaveBeenCalledWith('coder');
  });

  it('should call onStart when start button clicked', () => {
    const onStart = vi.fn();
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={['planner']}
        task="Build an API"
        loading={false}
        onToggleRole={vi.fn()}
        onTaskChange={vi.fn()}
        onStart={onStart}
      />,
    );
    fireEvent.click(screen.getByText('Start Collaboration'));
    expect(onStart).toHaveBeenCalled();
  });

  it('should disable start button when task is empty', () => {
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={['planner']}
        task=""
        loading={false}
        onToggleRole={vi.fn()}
        onTaskChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('Start Collaboration')).toBeDisabled();
  });

  it('should show loading state with "Planning..."', () => {
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={['planner']}
        task="Build an API"
        loading={true}
        onToggleRole={vi.fn()}
        onTaskChange={vi.fn()}
        onStart={vi.fn()}
      />,
    );
    expect(screen.getByText('Planning...')).toBeInTheDocument();
  });

  it('should call onTaskChange on textarea input', () => {
    const onTaskChange = vi.fn();
    render(
      <AgentSetupView
        roles={mockRoles}
        selectedRoles={[]}
        task=""
        loading={false}
        onToggleRole={vi.fn()}
        onTaskChange={onTaskChange}
        onStart={vi.fn()}
      />,
    );
    const textarea = screen.getByPlaceholderText(/Build a user authentication/);
    fireEvent.change(textarea, { target: { value: 'New task' } });
    expect(onTaskChange).toHaveBeenCalledWith('New task');
  });
});