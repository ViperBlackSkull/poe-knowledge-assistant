import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CitationCard } from '../CitationCard';
import type { CitationData } from '@/types/citation';

const mockCitation: CitationData = {
  id: 'cit-1',
  content: 'This is a snippet from the knowledge base.',
  source: 'https://pathofexile.com/wiki/Test',
  relevance_score: 0.92,
  title: 'Test Wiki Page',
  doc_type: 'wiki',
};

const mockNonUrlCitation: CitationData = {
  id: 'cit-2',
  content: 'Some local content.',
  source: 'local-document.txt',
  relevance_score: 0.45,
  doc_type: 'unknown',
};

describe('CitationCard', () => {
  it('renders citation title and index', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    expect(screen.getByText(/1\./)).toBeInTheDocument();
    expect(screen.getByText('Test Wiki Page')).toBeInTheDocument();
  });

  it('renders relevance score as percentage', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    expect(screen.getByText('92%')).toBeInTheDocument();
  });

  it('renders doc type icon', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    expect(screen.getByText('W')).toBeInTheDocument();
  });

  it('does not show content preview when collapsed', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    expect(screen.queryByText(/This is a snippet/)).not.toBeInTheDocument();
  });

  it('expands to show content preview on click', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    const toggleButton = screen.getByTestId('citation-toggle-1');
    fireEvent.click(toggleButton);
    expect(screen.getByTestId('citation-detail-1')).toBeInTheDocument();
    expect(screen.getByText(/This is a snippet/)).toBeInTheDocument();
  });

  it('collapses when clicked again', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    const toggleButton = screen.getByTestId('citation-toggle-1');
    fireEvent.click(toggleButton);
    expect(screen.getByTestId('citation-detail-1')).toBeInTheDocument();
    fireEvent.click(toggleButton);
    expect(screen.queryByTestId('citation-detail-1')).not.toBeInTheDocument();
  });

  it('shows source link for URL sources when expanded', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    fireEvent.click(screen.getByTestId('citation-toggle-1'));
    const link = screen.getByTestId('citation-link-1');
    expect(link).toHaveAttribute('href', 'https://pathofexile.com/wiki/Test');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows source text for non-URL sources when expanded', () => {
    render(<CitationCard citation={mockNonUrlCitation} index={2} />);
    fireEvent.click(screen.getByTestId('citation-toggle-2'));
    const detail = screen.getByTestId('citation-detail-2');
    const sourceSpan = detail.querySelector('.text-poe-text-muted.text-xs.truncate');
    expect(sourceSpan).toHaveTextContent('local-document.txt');
  });

  it('shows relevance level badge when expanded', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    fireEvent.click(screen.getByTestId('citation-toggle-1'));
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('shows "Medium" relevance badge for medium score', () => {
    const medCitation: CitationData = {
      ...mockCitation,
      relevance_score: 0.7,
    };
    render(<CitationCard citation={medCitation} index={1} />);
    fireEvent.click(screen.getByTestId('citation-toggle-1'));
    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('shows "Low" relevance badge for low score', () => {
    render(<CitationCard citation={mockNonUrlCitation} index={2} />);
    fireEvent.click(screen.getByTestId('citation-toggle-2'));
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('uses source label when title is not provided', () => {
    const noTitleCitation: CitationData = {
      ...mockCitation,
      title: undefined,
    };
    render(<CitationCard citation={noTitleCitation} index={1} />);
    expect(screen.getByTestId('citation-toggle-1')).toHaveAttribute(
      'aria-label',
      expect.stringContaining('1'),
    );
  });

  it('supports controlled expanded state', () => {
    render(
      <CitationCard
        citation={mockCitation}
        index={1}
        isExpanded={true}
        onToggle={() => {}}
      />,
    );
    expect(screen.getByTestId('citation-detail-1')).toBeInTheDocument();
  });

  it('calls onToggle with citation id when clicked', () => {
    const onToggle = vi.fn();
    render(
      <CitationCard
        citation={mockCitation}
        index={1}
        onToggle={onToggle}
      />,
    );
    fireEvent.click(screen.getByTestId('citation-toggle-1'));
    expect(onToggle).toHaveBeenCalledWith('cit-1');
  });

  it('has correct aria-expanded attribute', () => {
    render(<CitationCard citation={mockCitation} index={1} />);
    const toggle = screen.getByTestId('citation-toggle-1');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('renders different doc type styles', () => {
    const forumCitation: CitationData = {
      ...mockCitation,
      doc_type: 'forum',
    };
    render(<CitationCard citation={forumCitation} index={1} />);
    expect(screen.getByText('F')).toBeInTheDocument();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CitationCard citation={mockCitation} index={1} className="test-class" />,
    );
    expect(container.firstChild).toHaveClass('test-class');
  });
});
