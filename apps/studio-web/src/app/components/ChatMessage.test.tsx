import { render, screen } from '@testing-library/react';
import { ChatMessage } from '../components/ChatMessage';
import type { Message } from '../lib/types';

describe('ChatMessage', () => {
  it('should render user message', () => {
    const msg: Message = { role: 'user', content: 'Hello', timestamp: Date.now() };
    render(<ChatMessage msg={msg} />);

    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('should render agent message', () => {
    const msg: Message = { role: 'agent', content: 'Hi there', timestamp: Date.now() };
    render(<ChatMessage msg={msg} />);

    expect(screen.getByText('Entity')).toBeInTheDocument();
  });

  it('should render error message with red styling', () => {
    const msg: Message = { role: 'agent', content: 'Error occurred', timestamp: Date.now(), error: true };
    render(<ChatMessage msg={msg} />);

    expect(screen.getByText('Error occurred')).toBeInTheDocument();
  });

  it('should show streaming indicator', () => {
    const msg: Message = { role: 'agent', content: 'Thinking...', timestamp: Date.now(), streaming: true };
    render(<ChatMessage msg={msg} />);

    expect(screen.getByText('Thinking...')).toBeInTheDocument();
  });

  it('should show step count when totalSteps is set', () => {
    const msg: Message = { role: 'agent', content: 'Done', timestamp: Date.now(), totalSteps: 5 };
    render(<ChatMessage msg={msg} />);

    expect(screen.getByText('5 steps')).toBeInTheDocument();
  });

  it('should align user message to the right', () => {
    const msg: Message = { role: 'user', content: 'Test', timestamp: Date.now() };
    const { container } = render(<ChatMessage msg={msg} />);

    const outer = container.querySelector('.ml-auto');
    expect(outer).toBeInTheDocument();
  });

  it('should show timestamp', () => {
    const msg: Message = { role: 'agent', content: 'Hello', timestamp: Date.now() };
    render(<ChatMessage msg={msg} />);

    // Timestamp should be formatted as HH:MM
    const timeText = screen.getByText(/\d{2}:\d{2}/);
    expect(timeText).toBeInTheDocument();
  });

  it('should render agent message with MarkdownMessage', () => {
    const msg: Message = { role: 'agent', content: '**Bold text**', timestamp: Date.now() };
    render(<ChatMessage msg={msg} />);

    // MarkdownMessage renders the content
    expect(screen.getByText('Bold text')).toBeInTheDocument();
  });
});
