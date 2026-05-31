import { render, screen, fireEvent } from '@testing-library/react';
import { LoginScreen } from '../components/LoginScreen';

const mockProps = {
  onLogin: vi.fn(),
  onRegister: vi.fn(),
  error: '',
  loading: false,
  onClearError: vi.fn(),
};

describe('LoginScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render login form by default', () => {
    render(<LoginScreen {...mockProps} />);
    expect(screen.getByText('DeepSpace')).toBeInTheDocument();
    expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter username')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Enter password')).toBeInTheDocument();
  });

  it('should not show email field in login mode', () => {
    render(<LoginScreen {...mockProps} />);
    expect(screen.queryByPlaceholderText('you@example.com')).not.toBeInTheDocument();
  });

  it('should switch to register mode', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    expect(screen.getByText('Create your account')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Confirm password')).toBeInTheDocument();
  });

  it('should submit login form', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.change(screen.getByPlaceholderText('Enter username'), { target: { value: 'testuser' } });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Sign in'));

    expect(mockProps.onLogin).toHaveBeenCalledWith('testuser', 'password123');
  });

  it('should submit register form', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'password123' } });
    fireEvent.click(screen.getByText('Create account'));

    expect(mockProps.onRegister).toHaveBeenCalledWith('test@test.com', 'newuser', 'password123');
  });

  it('should show error when passwords do not match', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'password123' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'different' } });
    fireEvent.click(screen.getByText('Create account'));

    expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    expect(mockProps.onRegister).not.toHaveBeenCalled();
  });

  it('should show error when password is too short', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'test@test.com' } });
    fireEvent.change(screen.getByPlaceholderText('Enter username'), { target: { value: 'newuser' } });
    fireEvent.change(screen.getByPlaceholderText('Enter password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByPlaceholderText('Confirm password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByText('Create account'));

    expect(screen.getByText('Password must be at least 8 characters')).toBeInTheDocument();
  });

  it('should prevent submit when fields are empty in register mode', () => {
    render(<LoginScreen {...mockProps} />);

    fireEvent.click(screen.getByText("Don't have an account? Sign up"));

    // Button should be disabled when fields are empty
    expect(screen.getByText('Create account')).toBeDisabled();
  });

  it('should disable submit when loading', () => {
    render(<LoginScreen {...mockProps} loading={true} />);
    expect(screen.getByText('Signing in...')).toBeDisabled();
  });

  it('should display server error', () => {
    render(<LoginScreen {...mockProps} error="Invalid credentials" />);
    expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
  });
});
