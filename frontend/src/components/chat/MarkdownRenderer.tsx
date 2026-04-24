import { useMemo } from 'react';

/**
 * Lightweight markdown renderer for assistant messages.
 *
 * Supports:
 *  - Paragraphs
 *  - Bold (**text**)
 *  - Italic (*text*)
 *  - Inline code (`code`)
 *  - Code blocks (```lang ... ```)
 *  - Unordered lists (- item)
 *  - Ordered lists (1. item)
 *  - Headers (## Heading)
 *  - Links [text](url)
 *
 * This is intentionally simple and does not require a full markdown library.
 * For production use, consider `react-markdown` or `marked`.
 */
interface MarkdownRendererProps {
  /** Raw markdown content to render */
  content: string;
  /** Optional additional CSS class names */
  className?: string;
}

/**
 * Parse inline markdown elements and return an array of React nodes.
 */
function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  // Combined regex for bold, italic, code, and links
  const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold **text**
      nodes.push(
        <strong key={`b-${keyIndex}`} className="text-poe-text-highlight font-semibold">
          {match[2]}
        </strong>
      );
    } else if (match[3]) {
      // Italic *text*
      nodes.push(
        <em key={`i-${keyIndex}`} className="text-poe-text-secondary">
          {match[4]}
        </em>
      );
    } else if (match[5]) {
      // Inline code `code`
      nodes.push(
        <code
          key={`c-${keyIndex}`}
          className="bg-poe-bg-primary text-poe-gold-light px-1.5 py-0.5 rounded text-xs font-mono border border-poe-border/50"
        >
          {match[6]}
        </code>
      );
    } else if (match[7]) {
      // Link [text](url)
      nodes.push(
        <a
          key={`a-${keyIndex}`}
          href={match[9]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-poe-gold hover:text-poe-gold-light underline"
        >
          {match[8]}
        </a>
      );
    }

    lastIndex = match.index + match[0].length;
    keyIndex++;
  }

  // Remaining text after last match
  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : [text];
}

interface ParsedBlock {
  type: 'paragraph' | 'code' | 'heading' | 'list' | 'ordered-list';
  content: string;
  level?: number;
  items?: string[];
  language?: string;
}

/**
 * Parse markdown content into blocks for rendering.
 */
function parseBlocks(content: string): ParsedBlock[] {
  const blocks: ParsedBlock[] = [];
  const lines = content.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip empty lines
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith('```')) {
      const language = line.trim().slice(3).trim() || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', content: codeLines.join('\n'), language });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2],
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Unordered list
    if (line.match(/^\s*[-*]\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*]\s+/)) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', content: '', items });
      continue;
    }

    // Ordered list
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'ordered-list', content: '', items });
      continue;
    }

    // Paragraph - collect consecutive non-empty, non-special lines
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^\s*[-*]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/)
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }
    blocks.push({ type: 'paragraph', content: paragraphLines.join('\n') });
  }

  return blocks;
}

/**
 * Render a parsed block as a React element.
 */
function renderBlock(block: ParsedBlock, idx: number): React.ReactNode {
  switch (block.type) {
    case 'heading': {
      const Tag = `h${Math.min(block.level ?? 2, 6)}` as keyof JSX.IntrinsicElements;
      const sizeClasses: Record<number, string> = {
        1: 'text-lg font-bold',
        2: 'text-base font-semibold',
        3: 'text-sm font-semibold',
        4: 'text-sm font-medium',
        5: 'text-xs font-medium',
        6: 'text-xs font-medium',
      };
      return (
        <Tag key={idx} className={`text-poe-text-highlight ${sizeClasses[block.level ?? 2] || 'text-sm'} mb-2 mt-3`}>
          {parseInline(block.content)}
        </Tag>
      );
    }

    case 'code':
      return (
        <pre
          key={idx}
          className="bg-poe-bg-primary border border-poe-border rounded p-3 my-2 overflow-x-auto"
        >
          {block.language && (
            <div className="text-poe-text-muted text-xs mb-2 font-mono">
              {block.language}
            </div>
          )}
          <code className="text-poe-text-primary text-xs font-mono whitespace-pre">
            {block.content}
          </code>
        </pre>
      );

    case 'list':
      return (
        <ul key={idx} className="list-disc list-inside space-y-1 my-2 text-poe-text-secondary text-sm">
          {block.items?.map((item, itemIdx) => (
            <li key={itemIdx}>{parseInline(item)}</li>
          ))}
        </ul>
      );

    case 'ordered-list':
      return (
        <ol key={idx} className="list-decimal list-inside space-y-1 my-2 text-poe-text-secondary text-sm">
          {block.items?.map((item, itemIdx) => (
            <li key={itemIdx}>{parseInline(item)}</li>
          ))}
        </ol>
      );

    case 'paragraph':
    default:
      return (
        <p key={idx} className="text-poe-text-primary text-sm leading-relaxed my-1">
          {parseInline(block.content)}
        </p>
      );
  }
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className={`markdown-content ${className}`}>
      {blocks.map((block, idx) => renderBlock(block, idx))}
    </div>
  );
}
