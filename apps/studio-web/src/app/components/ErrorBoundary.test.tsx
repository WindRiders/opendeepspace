import { render, screen } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

function BrokenComponent(): JSX.Element {
  throw new Error('Test explosion');
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render children when no error', () => {
    render(
      <ErrorBoundary>
        <p>Hello world</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should show fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByText('Test explosion')).toBeInTheDocument();
  });

  it('should show Try again button in fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Try again')).toBeInTheDocument();
  });

  it('should show custom fallback when provided', () => {
    render(
      <ErrorBoundary fallback={<p>Custom error UI</p>}>
        <BrokenComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom error UI')).toBeInTheDocument();
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
  });
});