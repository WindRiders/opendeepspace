import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { CopyButton } from '../components/CopyButton';

describe('CopyButton', () => {
  it('should render with copy text', () => {
    render(<CopyButton text="hello" />);
    expect(screen.getByText('复制')).toBeInTheDocument();
  });

  it('should call clipboard writeText on click', () => {
    render(<CopyButton text="hello" />);

    fireEvent.click(screen.getByText('复制'));

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('hello');
  });

  it('should show checked state after click', async () => {
    render(<CopyButton text="hello" />);

    fireEvent.click(screen.getByText('复制'));

    await waitFor(() => {
      expect(screen.getByText('已复制')).toBeInTheDocument();
    });
  });
});
