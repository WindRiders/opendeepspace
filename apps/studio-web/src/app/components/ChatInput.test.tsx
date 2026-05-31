import { render, screen, fireEvent } from '@testing-library/react';
import type { RenderResult } from '@testing-library/react';
import { ChatInput } from '../components/ChatInput';

const mockProps = {
  input: '',
  onInputChange: vi.fn(),
  onSend: vi.fn(),
  isLoading: false,
};

describe('ChatInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render textarea', () => {
    render(<ChatInput {...mockProps} />);
    expect(screen.getByPlaceholderText(/与实体对话/)).toBeInTheDocument();
  });

  it('should send on Enter key', () => {
    render(<ChatInput {...mockProps} input="hello" />);

    const textarea = screen.getByPlaceholderText(/与实体对话/);
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter' });

    expect(mockProps.onSend).toHaveBeenCalled();
  });

  it('should not send on Shift+Enter', () => {
    render(<ChatInput {...mockProps} input="hello" />);

    const textarea = screen.getByPlaceholderText(/与实体对话/);
    fireEvent.keyDown(textarea, { key: 'Enter', code: 'Enter', shiftKey: true });

    expect(mockProps.onSend).not.toHaveBeenCalled();
  });

  it('should disable button when loading', () => {
    render(<ChatInput {...mockProps} isLoading={true} />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should disable button when input is empty', () => {
    render(<ChatInput {...mockProps} input="" />);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('should call onChange when typing', () => {
    render(<ChatInput {...mockProps} input="" />);

    fireEvent.change(screen.getByPlaceholderText(/与实体对话/), { target: { value: 'test' } });

    expect(mockProps.onInputChange).toHaveBeenCalledWith('test');
  });

  it('should submit on form submit', () => {
    const { container } = render(<ChatInput {...mockProps} input="hello" />);

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    expect(mockProps.onSend).toHaveBeenCalled();
  });
});
