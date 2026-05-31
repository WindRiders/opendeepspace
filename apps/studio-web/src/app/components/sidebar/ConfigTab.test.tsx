import { render, screen, fireEvent } from '@testing-library/react';
import { ConfigTab } from './ConfigTab';
import type { ModelInfo, AgentTemplate, PluginInfo, EngineStatus } from '@deepspace/shared-types';

const mockModels: ModelInfo[] = [
  { id: 'm1', name: 'DeepSeek V3', provider: 'deepseek', description: '', maxTokens: 8192 },
];

const mockTemplates: AgentTemplate[] = [
  { id: 't1', name: 'Code Reviewer', description: 'Reviews code', dna: 'You are...', icon: '', category: 'coding', tags: [], isBuiltIn: true },
];

const mockPlugins: PluginInfo[] = [
  { id: 'p1', name: 'File Manager', version: '1.0.0', description: '', author: 'ds', enabled: true, toolCount: 3 },
];

const mockEngine: EngineStatus = {
  status: 'online', core: 'DeepSpace Genesis', tools: ['read_file', 'write_file'], models: mockModels, phase: 2,
};

describe('ConfigTab', () => {
  const baseProps = {
    dna: '',
    onDnaChange: vi.fn(),
    availableModels: mockModels,
    selectedModelId: 'm1',
    onModelChange: vi.fn(),
    templates: mockTemplates,
    plugins: mockPlugins,
    engineStatus: mockEngine as EngineStatus | null,
    onReloadPlugin: vi.fn(),
  };

  it('should render model selector', () => {
    render(<ConfigTab {...baseProps} />);
    expect(screen.getByText('DeepSeek V3')).toBeInTheDocument();
  });

  it('should render DNA editor with current value', () => {
    render(<ConfigTab {...baseProps} dna="Custom DNA" />);
    const textarea = screen.getByPlaceholderText(/定义这个 Agent 的核心本质/);
    expect(textarea).toHaveValue('Custom DNA');
  });

  it('should call onDnaChange on textarea input', () => {
    const onDnaChange = vi.fn();
    render(<ConfigTab {...baseProps} onDnaChange={onDnaChange} />);
    fireEvent.change(screen.getByPlaceholderText(/定义这个 Agent 的核心本质/), { target: { value: 'New DNA' } });
    expect(onDnaChange).toHaveBeenCalledWith('New DNA');
  });

  it('should render tools list from engineStatus', () => {
    render(<ConfigTab {...baseProps} />);
    expect(screen.getByText('read_file')).toBeInTheDocument();
    expect(screen.getByText('write_file')).toBeInTheDocument();
  });

  it('should show fallback tool list when engineStatus is null', () => {
    render(<ConfigTab {...baseProps} engineStatus={null} />);
    expect(screen.getByText('read_file')).toBeInTheDocument();
  });

  it('should render plugin list', () => {
    render(<ConfigTab {...baseProps} />);
    expect(screen.getByText('File Manager')).toBeInTheDocument();
  });

  it('should call onReloadPlugin when reload button clicked', () => {
    const onReloadPlugin = vi.fn();
    render(<ConfigTab {...baseProps} onReloadPlugin={onReloadPlugin} />);
    fireEvent.click(screen.getByTitle('重新加载插件'));
    expect(onReloadPlugin).toHaveBeenCalledWith('p1');
  });
});