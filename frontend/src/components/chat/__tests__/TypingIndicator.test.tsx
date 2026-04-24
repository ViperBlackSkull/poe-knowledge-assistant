import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypingIndicator } from '../TypingIndicator';

describe('TypingIndicator', () => {
  it('renders nothing when isVisible is false', () => {
    const { container } = render(
      <TypingIndicator isVisible={false} />,
    );
    expect(container.innerHTML).toBe('');
  });

  it('renders with default props when visible', () => {
    render(<TypingIndicator isVisible />);
    expect(screen.getByTestId('typing-indicator')).toBeInTheDocument();
    expect(screen.getByText('Assistant is thinking...')).toBeInTheDocument();
  });

  it('renders with a custom label', () => {
    render(<TypingIndicator isVisible label="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('hides label when showLabel is false', () => {
    render(<TypingIndicator isVisible showLabel={false} />);
    expect(screen.queryByText('Assistant is thinking...')).not.toBeInTheDocument();
  });

  it('has role="status" for accessibility', () => {
    render(<TypingIndicator isVisible />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('uses custom aria-label', () => {
    render(<TypingIndicator isVisible ariaLabel="Custom label" />);
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'Custom label');
  });

  it('renders in bubble display mode', () => {
    render(<TypingIndicator isVisible display="bubble" />);
    const indicator = screen.getByTestId('typing-indicator');
    expect(indicator).toBeInTheDocument();
    expect(screen.getByText('Knowledge Assistant')).toBeInTheDocument();
  });

  it('renders in inline display mode by default', () => {
    render(<TypingIndicator isVisible display="inline" />);
    const indicator = screen.getByTestId('typing-indicator');
    expect(indicator).toBeInTheDocument();
    expect(screen.queryByText('Knowledge Assistant')).not.toBeInTheDocument();
  });

  it('renders bouncing dots variant', () => {
    const { container } = render(
      <TypingIndicator isVisible variant="dots" />,
    );
    const dots = container.querySelectorAll('.animate-bounce');
    expect(dots.length).toBe(3);
  });

  it('renders pulse variant', () => {
    const { container } = render(
      <TypingIndicator isVisible variant="pulse" />,
    );
    const bar = container.querySelector('.animate-pulse');
    expect(bar).toBeInTheDocument();
  });

  it('renders wave variant', () => {
    const { container } = render(
      <TypingIndicator isVisible variant="wave" />,
    );
    const dots = container.querySelectorAll('[style*="typing-wave"]');
    expect(dots.length).toBe(3);
  });

  it('applies custom className', () => {
    render(<TypingIndicator isVisible className="test-class" />);
    const indicator = screen.getByTestId('typing-indicator');
    expect(indicator.className).toContain('test-class');
  });

  it('applies custom dot color', () => {
    const { container } = render(
      <TypingIndicator isVisible variant="dots" dotColor="bg-red-500" />,
    );
    const dots = container.querySelectorAll('.bg-red-500');
    expect(dots.length).toBe(3);
  });

  it('renders different sizes', () => {
    const { container: smContainer } = render(
      <TypingIndicator isVisible variant="dots" size="sm" />,
    );
    const smDots = smContainer.querySelectorAll('.w-1\\.5');
    expect(smDots.length).toBe(3);

    const { container: lgContainer } = render(
      <TypingIndicator isVisible variant="dots" size="lg" />,
    );
    const lgDots = lgContainer.querySelectorAll('.w-2\\.5');
    expect(lgDots.length).toBe(3);
  });
});
