import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Sidebar } from '../components/Sidebar';

vi.mock('../lib/conversations-api', () => ({
  fetchConversations: vi.fn(),
  deleteConversation: vi.fn(),
}));
vi.mock('../lib/templates-api', () => ({
  fetchTemplates: vi.fn(),
}));
vi.mock('../lib/plugins-api', () => ({
  fetchPlugins: vi.fn(),
  reloadPlugin: vi.fn(),
}));

import { fetchConversations, deleteConversation } from '../lib/conversations-api';
import { fetchTemplates } from '../lib/templates-api';
import { fetchPlugins, reloadPlugin } from '../lib/plugins-api';

const mockConversations = [
  {
    id: 'conv-1',
    title: 'First conversation',
    createdAt: Date.now() / 1000 - 3600,
    updatedAt: Date.now() / 1000 - 60,
    messageCount: 5,
  },
  {
    id: 'conv-2',
    title: 'Second conversation',
    createdAt: Date.now() / 1000 - 86400,
    updatedAt: Date.now() / 1000 - 3600,
    messageCount: 12,
  },
];

const mockTemplates = [
  {
    id: 'tpl-1',
    name: 'Code Assistant',
    description: 'A helpful coding assistant',
    dna: 'You are a coding assistant.',
    icon: 'code',
    category: 'coding' as const,
    tags: ['coding', 'help'],
    isBuiltIn: true,
  },
  {
    id: 'tpl-2',
    name: 'Writer',
    description: 'A writing assistant',
    dna: 'You are a writing assistant.',
    icon: 'book-open',
    category: 'writing' as const,
    tags: ['writing', 'help'],
    isBuiltIn: true,
  },
];

const mockModels = [
  {
    id: 'model-1',
    name: 'Qwen Max',
    provider: 'DashScope',
    description: 'Powerful LLM',
    maxTokens: 32768,
    isDefault: true,
  },
  {
    id: 'model-2',
    name: 'Qwen Plus',
    provider: 'DashScope',
    description: 'Fast LLM',
    maxTokens: 16384,
  },
];

const mockPlugins = [
  {
    id: 'example-plugin',
    name: 'Example Plugin',
    version: '1.0.0',
    description: 'An example plugin with a custom echo tool',
    author: 'DeepSpace',
    enabled: true,
    toolCount: 1,
    loadedAt: Date.now(),
  },
  {
    id: 'weather-plugin',
    name: 'Weather Plugin',
    version: '0.1.0',
    description: 'Adds weather query capability',
    author: 'Community',
    enabled: true,
    toolCount: 3,
    loadedAt: Date.now(),
  },
];

const defaultProps = {
  dna: 'default-dna',
  onDnaChange: vi.fn(),
  engineStatus: { status: 'online', tools: ['read_file', 'write_file'] },
  open: true,
  onClose: vi.fn(),
  currentSessionId: 'conv-1',
  onNewChat: vi.fn(),
  availableModels: mockModels,
  selectedModelId: 'model-1',
  onModelChange: vi.fn(),
};

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (fetchConversations as any).mockResolvedValue(mockConversations);
    (fetchTemplates as any).mockResolvedValue(mockTemplates);
    (fetchPlugins as any).mockResolvedValue(mockPlugins);
    (reloadPlugin as any).mockResolvedValue({ success: true, pluginId: 'example-plugin', toolCount: 1 });
  });

  it('should render logo and DeepSpace branding', () => {
    render(<Sidebar {...defaultProps} />);
    expect(screen.getByText('DeepSpace')).toBeInTheDocument();
    expect(screen.getByText('Creator Studio')).toBeInTheDocument();
  });

  it('should show online status when engine is connected', () => {
    render(<Sidebar {...defaultProps} engineStatus={{ status: 'online', tools: [] }} />);
    expect(screen.getByText('Core Engine 在线')).toBeInTheDocument();
    // Green pulse dot should be present
    const greenDot = document.querySelector('.bg-green-400');
    expect(greenDot).not.toBeNull();
  });

  it('should show offline status when engine is disconnected', () => {
    render(<Sidebar {...defaultProps} engineStatus={null} />);
    expect(screen.getByText('Core Engine 离线')).toBeInTheDocument();
  });

  it('should call onNewChat when clicking new chat button', () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('新建对话'));
    expect(defaultProps.onNewChat).toHaveBeenCalled();
  });

  it('should render conversation list in history tab', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('First conversation')).toBeInTheDocument();
      expect(screen.getByText('Second conversation')).toBeInTheDocument();
    });
  });

  it('should highlight current session', async () => {
    render(<Sidebar {...defaultProps} currentSessionId="conv-1" />);
    await waitFor(() => {
      const convItem = screen.getByText('First conversation');
      const container = convItem.closest('[class*="bg-purple-500/10"]');
      expect(container).not.toBeNull();
    });
  });

  it('should delete conversation when clicking trash button', async () => {
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('First conversation')).toBeInTheDocument();
    });

    const firstItem = screen.getByText('First conversation').closest('.group')!;
    fireEvent.mouseEnter(firstItem);

    const deleteBtn = screen.getAllByTitle('删除对话')[0];
    fireEvent.click(deleteBtn);

    expect(deleteConversation).toHaveBeenCalledWith('conv-1');
  });

  it('should show empty state when no conversations', async () => {
    (fetchConversations as any).mockResolvedValue([]);
    render(<Sidebar {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByText('暂无对话历史')).toBeInTheDocument();
    });
  });

  it('should switch to config tab and show model selector', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('LLM Model')).toBeInTheDocument();
    });
    expect(screen.getByText('Qwen Max')).toBeInTheDocument();
    expect(screen.getByText('Qwen Plus')).toBeInTheDocument();
  });

  it('should call onModelChange when selecting a model', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Qwen Plus')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Qwen Plus'));
    expect(defaultProps.onModelChange).toHaveBeenCalledWith('model-2');
  });

  it('should show template selector in config tab', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Agent Templates')).toBeInTheDocument();
    });
    expect(screen.getByText('Code Assistant')).toBeInTheDocument();
    expect(screen.getByText('Writer')).toBeInTheDocument();
  });

  it('should call onDnaChange when clicking a template', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Code Assistant')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Code Assistant'));
    expect(defaultProps.onDnaChange).toHaveBeenCalledWith('You are a coding assistant.');
  });

  it('should render DNA editor textarea in config tab', async () => {
    render(<Sidebar {...defaultProps} dna="test-dna-content" />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Agent DNA')).toBeInTheDocument();
    });
    const textarea = screen.getByDisplayValue('test-dna-content');
    expect(textarea).toBeInTheDocument();
  });

  it('should call onDnaChange when editing DNA textarea', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Agent DNA')).toBeInTheDocument();
    });
    const textarea = screen.getByPlaceholderText('定义这个 Agent 的核心本质...');
    fireEvent.change(textarea, { target: { value: 'new-dna-content' } });
    expect(defaultProps.onDnaChange).toHaveBeenCalledWith('new-dna-content');
  });

  it('should show plugins section in config tab', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Plugins')).toBeInTheDocument();
    });
  });

  it('should show plugin list when plugins are loaded', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Example Plugin')).toBeInTheDocument();
      expect(screen.getByText('Weather Plugin')).toBeInTheDocument();
    });
    expect(screen.getByText('v1.0.0')).toBeInTheDocument();
    expect(screen.getByText('1 个工具 · DeepSpace')).toBeInTheDocument();
    expect(screen.getByText('3 个工具 · Community')).toBeInTheDocument();
  });

  it('should show empty state when no plugins', async () => {
    (fetchPlugins as any).mockResolvedValue([]);
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('暂无加载的插件')).toBeInTheDocument();
    });
  });

  it('should call reloadPlugin when clicking reload button', async () => {
    render(<Sidebar {...defaultProps} />);
    fireEvent.click(screen.getByText('配置'));
    await waitFor(() => {
      expect(screen.getByText('Example Plugin')).toBeInTheDocument();
    });
    const reloadBtn = screen.getAllByTitle('重新加载插件')[0];
    fireEvent.click(reloadBtn);
    expect(reloadPlugin).toHaveBeenCalledWith('example-plugin');
  });
});
