import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
// Use @/ path alias to avoid linter auto-rewriting to common/MarkdownRenderer
import { MarkdownRenderer } from '@/components/chat/MarkdownRenderer';

describe('MarkdownRenderer', () => {
  it('renders plain text as a paragraph', () => {
    render(<MarkdownRenderer content="Hello world" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders bold text', () => {
    render(<MarkdownRenderer content="This is **bold** text" />);
    const bold = screen.getByText('bold');
    expect(bold.tagName).toBe('STRONG');
  });

  it('renders italic text', () => {
    render(<MarkdownRenderer content="This is *italic* text" />);
    const italic = screen.getByText('italic');
    expect(italic.tagName).toBe('EM');
  });

  it('renders inline code', () => {
    render(<MarkdownRenderer content={'Use `console.log` to debug'} />);
    const code = screen.getByText('console.log');
    expect(code.tagName).toBe('CODE');
  });

  it('renders a link', () => {
    render(<MarkdownRenderer content={'Visit [PoE](https://pathofexile.com)'} />);
    const link = screen.getByText('PoE');
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', 'https://pathofexile.com');
  });

  it('renders a heading', () => {
    render(<MarkdownRenderer content={'## Title'} />);
    const heading = screen.getByText('Title');
    expect(heading.tagName).toBe('H2');
  });

  it('renders different heading levels', () => {
    const content = '# H1\n## H2\n### H3';
    const { container } = render(<MarkdownRenderer content={content} />);
    expect(container.querySelector('h1')).toBeInTheDocument();
    expect(container.querySelector('h2')).toBeInTheDocument();
    expect(container.querySelector('h3')).toBeInTheDocument();
  });

  it('renders a code block with language label', () => {
    const content = '```javascript\nconsole.log(\'hello\');\n```';
    render(<MarkdownRenderer content={content} />);
    expect(screen.getByText("console.log('hello');")).toBeInTheDocument();
    expect(screen.getByText('javascript')).toBeInTheDocument();
  });

  it('renders a code block without language', () => {
    const content = '```\nsome code\n```';
    render(<MarkdownRenderer content={content} />);
    expect(screen.getByText('some code')).toBeInTheDocument();
  });

  it('renders unordered list', () => {
    const content = '- Item 1\n- Item 2\n- Item 3';
    render(<MarkdownRenderer content={content} />);
    expect(screen.getByText('Item 1')).toBeInTheDocument();
    expect(screen.getByText('Item 2')).toBeInTheDocument();
    expect(screen.getByText('Item 3')).toBeInTheDocument();
  });

  it('renders ordered list', () => {
    const content = '1. First\n2. Second\n3. Third';
    render(<MarkdownRenderer content={content} />);
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
    expect(screen.getByText('Third')).toBeInTheDocument();
  });

  it('renders multi-paragraph content', () => {
    const content = 'First paragraph\n\nSecond paragraph';
    render(<MarkdownRenderer content={content} />);
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  });

  it('applies markdown-content class to container', () => {
    const { container } = render(<MarkdownRenderer content="Hello" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains('markdown-content')).toBe(true);
  });

  it('applies custom className', () => {
    const { container } = render(
      <MarkdownRenderer content="Hello" className="custom-class" />,
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.classList.contains('custom-class')).toBe(true);
  });

  it('renders empty content without crashing', () => {
    const { container } = render(<MarkdownRenderer content="" />);
    expect(container.querySelector('.markdown-content')).toBeInTheDocument();
  });
});
