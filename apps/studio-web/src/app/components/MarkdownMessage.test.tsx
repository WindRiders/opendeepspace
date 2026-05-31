import { render, screen } from '@testing-library/react';
import { MarkdownMessage } from '../components/MarkdownMessage';

describe('MarkdownMessage', () => {
  it('should render plain text', () => {
    render(<MarkdownMessage content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('should render markdown heading', () => {
    render(<MarkdownMessage content="# Title" />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('should render code block with language', () => {
    const code = '```typescript\nconst x = 1;\n```';
    render(<MarkdownMessage content={code} />);
    expect(screen.getByText('typescript')).toBeInTheDocument();
    expect(screen.getByText('复制')).toBeInTheDocument();
  });

  it('should render inline code', () => {
    render(<MarkdownMessage content="Use `console.log` for debugging" />);
    expect(screen.getByText('console.log')).toBeInTheDocument();
  });

  it('should render GFM table', () => {
    const table = '| A | B |\n|---|---|\n| 1 | 2 |';
    render(<MarkdownMessage content={table} />);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});
