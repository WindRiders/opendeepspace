import { render, screen, fireEvent } from '@testing-library/react';
import { PublishModal } from './publish-modal';

describe('PublishModal', () => {
  const defaultProps = {
    name: '',
    description: '',
    dna: '',
    tags: [] as string[],
    tagInput: '',
    error: '',
    onNameChange: vi.fn(),
    onDescriptionChange: vi.fn(),
    onDnaChange: vi.fn(),
    onTagInputChange: vi.fn(),
    onTagAdd: vi.fn(),
    onTagRemove: vi.fn(),
    onTagKeyDown: vi.fn(),
    onPublish: vi.fn(),
    onClose: vi.fn(),
  };

  it('should render form fields', () => {
    render(<PublishModal {...defaultProps} />);
    expect(screen.getByPlaceholderText(/你的 Agent 名称/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/描述你的 Agent 能做什么/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/定义 Agent 的核心本质/)).toBeInTheDocument();
  });

  it('should call onNameChange on name input', () => {
    const onNameChange = vi.fn();
    render(<PublishModal {...defaultProps} onNameChange={onNameChange} />);
    fireEvent.change(screen.getByPlaceholderText(/你的 Agent 名称/), { target: { value: 'My Agent' } });
    expect(onNameChange).toHaveBeenCalledWith('My Agent');
  });

  it('should call onDescriptionChange on description input', () => {
    const onDescriptionChange = vi.fn();
    render(<PublishModal {...defaultProps} onDescriptionChange={onDescriptionChange} />);
    fireEvent.change(screen.getByPlaceholderText(/描述你的 Agent 能做什么/), { target: { value: 'A great agent' } });
    expect(onDescriptionChange).toHaveBeenCalledWith('A great agent');
  });

  it('should disable publish button when fields are empty', () => {
    render(<PublishModal {...defaultProps} />);
    expect(screen.getByText(/发布到市场/)).toBeDisabled();
  });

  it('should enable publish button when required fields are filled', () => {
    render(<PublishModal {...defaultProps} name="My Agent" description="Desc" dna="You are..." />);
    expect(screen.getByText(/发布到市场/)).not.toBeDisabled();
  });

  it('should call onPublish when publish button clicked', () => {
    const onPublish = vi.fn();
    render(<PublishModal {...defaultProps} name="My Agent" description="Desc" dna="You are..." onPublish={onPublish} />);
    fireEvent.click(screen.getByText(/发布到市场/));
    expect(onPublish).toHaveBeenCalled();
  });

  it('should call onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<PublishModal {...defaultProps} onClose={onClose} />);
    const backdrop = container.firstChild as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('should show error message when error prop set', () => {
    render(<PublishModal {...defaultProps} error="Publication failed" />);
    expect(screen.getByText('Publication failed')).toBeInTheDocument();
  });

  it('should render existing tags as chips', () => {
    render(<PublishModal {...defaultProps} tags={['python', 'ai']} />);
    expect(screen.getByText('python')).toBeInTheDocument();
    expect(screen.getByText('ai')).toBeInTheDocument();
  });

  it('should call onTagRemove when tag X clicked', () => {
    const onTagRemove = vi.fn();
    render(<PublishModal {...defaultProps} tags={['python']} onTagRemove={onTagRemove} />);
    const tagSpan = screen.getByText('python');
    const removeBtn = tagSpan.parentElement!.querySelector('button')!;
    fireEvent.click(removeBtn);
    expect(onTagRemove).toHaveBeenCalledWith('python');
  });
});