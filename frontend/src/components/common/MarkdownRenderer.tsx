import { useMemo, useState, useCallback, type ReactNode } from 'react';
import type {
  MarkdownRendererProps,
  ParsedBlock,
  ListItem,
  TableRow,
  TableColumnAlignment,
  MarkdownStyleConfig,
} from '@/types/markdown';

// =============================================================================
// Style Configurations
// =============================================================================

/**
 * PoE-themed style configurations for each markdown variant.
 */
const STYLE_CONFIGS: Record<string, MarkdownStyleConfig> = {
  default: {
    container: 'markdown-renderer',
    paragraph: 'text-poe-text-primary text-sm leading-relaxed my-2',
    heading: {
      1: 'text-lg font-bold text-poe-gold-light mt-4 mb-2 border-b border-poe-border pb-1',
      2: 'text-base font-semibold text-poe-gold-light mt-3 mb-2',
      3: 'text-sm font-semibold text-poe-gold mt-3 mb-1.5',
      4: 'text-sm font-medium text-poe-text-highlight mt-2 mb-1',
      5: 'text-xs font-medium text-poe-text-secondary mt-2 mb-1',
      6: 'text-xs font-medium text-poe-text-muted mt-2 mb-1',
    },
    codeBlock:
      'bg-[#0a0a0c] border border-poe-border/60 rounded-md my-3 overflow-hidden shadow-[inset_0_0_20px_rgba(0,0,0,0.4)]',
    inlineCode:
      'bg-[#0e0e11] text-poe-gold px-1.5 py-0.5 rounded text-xs font-mono border border-poe-border/40',
    unorderedList:
      'list-none space-y-1 my-2 text-poe-text-primary text-sm pl-2',
    orderedList:
      'list-none space-y-1 my-2 text-poe-text-primary text-sm pl-2',
    listItem: 'text-poe-text-secondary text-sm leading-relaxed',
    blockquote:
      'border-l-[3px] border-poe-gold bg-[#0e0e11]/60 pl-4 pr-3 py-2 my-3 rounded-r-md',
    blockquoteText: 'text-poe-text-secondary text-sm italic leading-relaxed',
    horizontalRule:
      'border-t border-poe-border my-4 mx-0',
    link: 'text-poe-gold hover:text-poe-gold-light underline underline-offset-2 transition-colors',
    image: 'max-w-full rounded-md border border-poe-border my-2',
    tableContainer: 'overflow-x-auto my-3 rounded-md border border-poe-border',
    table: 'w-full text-sm text-left',
    tableHeaderCell:
      'px-3 py-2.5 bg-[#0e0e11] text-poe-gold font-medium text-xs uppercase tracking-wider border-b border-poe-border',
    tableBodyCell:
      'px-3 py-2 text-poe-text-secondary border-b border-poe-border/40 hover:bg-poe-bg-secondary/40 transition-colors',
    bold: 'text-poe-text-highlight font-semibold',
    italic: 'text-poe-text-secondary italic',
    strikethrough: 'line-through text-poe-text-muted',
    taskCheckbox:
      'mr-2 w-4 h-4 rounded border border-poe-border bg-poe-bg-primary accent-poe-gold',
  },
  chat: {
    container: 'markdown-renderer markdown-chat',
    paragraph: 'text-poe-text-primary text-sm leading-relaxed my-1',
    heading: {
      1: 'text-base font-bold text-poe-gold-light mt-3 mb-1.5',
      2: 'text-sm font-semibold text-poe-gold-light mt-2 mb-1',
      3: 'text-sm font-semibold text-poe-gold mt-2 mb-1',
      4: 'text-xs font-medium text-poe-text-highlight mt-1.5 mb-1',
      5: 'text-xs font-medium text-poe-text-secondary mt-1.5 mb-0.5',
      6: 'text-xs font-medium text-poe-text-muted mt-1.5 mb-0.5',
    },
    codeBlock:
      'bg-[#0a0a0c] border border-poe-border/60 rounded my-2 overflow-hidden shadow-[inset_0_0_16px_rgba(0,0,0,0.4)]',
    inlineCode:
      'bg-[#0e0e11] text-poe-gold px-1 py-0.5 rounded text-xs font-mono border border-poe-border/40',
    unorderedList:
      'list-none space-y-0.5 my-1.5 text-poe-text-primary text-sm pl-2',
    orderedList:
      'list-none space-y-0.5 my-1.5 text-poe-text-primary text-sm pl-2',
    listItem: 'text-poe-text-secondary text-sm leading-relaxed',
    blockquote:
      'border-l-[3px] border-poe-gold/70 bg-[#0e0e11]/40 pl-3 pr-2 py-1.5 my-2 rounded-r-md',
    blockquoteText: 'text-poe-text-secondary text-xs italic leading-relaxed',
    horizontalRule:
      'border-t border-poe-border my-3 mx-0',
    link: 'text-poe-gold hover:text-poe-gold-light underline underline-offset-2 transition-colors',
    image: 'max-w-full rounded border border-poe-border my-1.5',
    tableContainer: 'overflow-x-auto my-2 rounded border border-poe-border',
    table: 'w-full text-xs text-left',
    tableHeaderCell:
      'px-2 py-1.5 bg-[#0e0e11] text-poe-gold font-medium text-xs uppercase tracking-wider border-b border-poe-border',
    tableBodyCell:
      'px-2 py-1.5 text-poe-text-secondary border-b border-poe-border/40',
    bold: 'text-poe-text-highlight font-semibold',
    italic: 'text-poe-text-secondary italic',
    strikethrough: 'line-through text-poe-text-muted',
    taskCheckbox:
      'mr-1.5 w-3.5 h-3.5 rounded border border-poe-border bg-poe-bg-primary accent-poe-gold',
  },
  compact: {
    container: 'markdown-renderer markdown-compact',
    paragraph: 'text-poe-text-primary text-xs leading-snug my-0.5',
    heading: {
      1: 'text-sm font-bold text-poe-gold-light mt-2 mb-1',
      2: 'text-xs font-semibold text-poe-gold-light mt-1.5 mb-0.5',
      3: 'text-xs font-semibold text-poe-gold mt-1 mb-0.5',
      4: 'text-xs font-medium text-poe-text-highlight mt-1 mb-0.5',
      5: 'text-[11px] font-medium text-poe-text-secondary mt-1 mb-0.5',
      6: 'text-[11px] font-medium text-poe-text-muted mt-1 mb-0.5',
    },
    codeBlock:
      'bg-[#0a0a0c] border border-poe-border/50 rounded my-1.5 overflow-hidden',
    inlineCode:
      'bg-[#0e0e11] text-poe-gold px-1 py-px rounded text-[11px] font-mono border border-poe-border/40',
    unorderedList:
      'list-none space-y-px my-1 text-poe-text-primary text-xs pl-1.5',
    orderedList:
      'list-none space-y-px my-1 text-poe-text-primary text-xs pl-1.5',
    listItem: 'text-poe-text-secondary text-xs leading-snug',
    blockquote:
      'border-l-2 border-poe-gold/60 bg-[#0e0e11]/30 pl-2.5 pr-2 py-1 my-1.5 rounded-r',
    blockquoteText: 'text-poe-text-secondary text-[11px] italic leading-snug',
    horizontalRule:
      'border-t border-poe-border my-2 mx-0',
    link: 'text-poe-gold hover:text-poe-gold-light underline underline-offset-1 transition-colors text-xs',
    image: 'max-w-full rounded border border-poe-border my-1',
    tableContainer: 'overflow-x-auto my-1.5 rounded border border-poe-border',
    table: 'w-full text-[11px] text-left',
    tableHeaderCell:
      'px-1.5 py-1 bg-[#0e0e11] text-poe-gold font-medium text-[11px] uppercase tracking-wider border-b border-poe-border',
    tableBodyCell:
      'px-1.5 py-1 text-poe-text-secondary border-b border-poe-border/40',
    bold: 'text-poe-text-highlight font-semibold',
    italic: 'text-poe-text-secondary italic',
    strikethrough: 'line-through text-poe-text-muted',
    taskCheckbox:
      'mr-1 w-3 h-3 rounded border border-poe-border bg-poe-bg-primary accent-poe-gold',
  },
};

// =============================================================================
// Inline Parsing
// =============================================================================

/**
 * Parse inline markdown elements (bold, italic, code, links, images,
 * strikethrough) and return an array of React nodes.
 */
function parseInline(
  text: string,
  styles: MarkdownStyleConfig,
  openLinksInNewTab: boolean,
  onLinkClick?: (href: string, event: React.MouseEvent) => void,
): ReactNode[] {
  const nodes: ReactNode[] = [];

  // Combined regex for:
  //  1. Bold: **text** or __text__
  //  2. Italic: *text* or _text_
  //  3. Inline code: `code`
  //  4. Links: [text](url)
  //  5. Images: ![alt](url)
  //  6. Strikethrough: ~~text~~
  const inlineRegex =
    /(\*\*(.+?)\*\*|__(.+?)__)|(\*(.+?)\*|_(.+?)_)|(`([^`]+?)`)|(\[([^\]]+)\]\(([^)]+)\))|(!\[([^\]]*)\]\(([^)]+)\))|(~~(.+?)~~)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let keyIndex = 0;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Text before the match
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[1]) {
      // Bold **text** or __text__
      nodes.push(
        <strong key={`b-${keyIndex}`} className={styles.bold}>
          {match[2] || match[3]}
        </strong>,
      );
    } else if (match[4]) {
      // Italic *text* or _text_ (but not within a word)
      nodes.push(
        <em key={`i-${keyIndex}`} className={styles.italic}>
          {match[5] || match[6]}
        </em>,
      );
    } else if (match[7]) {
      // Inline code `code`
      nodes.push(
        <code key={`c-${keyIndex}`} className={styles.inlineCode}>
          {match[8]}
        </code>,
      );
    } else if (match[11]) {
      // Image ![alt](url) - inline images are rendered as small inline elements
      nodes.push(
        <img
          key={`img-${keyIndex}`}
          src={match[13]}
          alt={match[12]}
          className={`${styles.image} inline-block max-h-6 align-middle`}
        />,
      );
    } else if (match[9]) {
      // Link [text](url)
      const linkHref = match[11];
      const linkText = match[10];
      const linkProps: Record<string, unknown> = {
        key: `a-${keyIndex}`,
        className: styles.link,
        href: linkHref,
      };
      if (openLinksInNewTab) {
        linkProps.target = '_blank';
        linkProps.rel = 'noopener noreferrer';
      }
      if (onLinkClick) {
        linkProps.onClick = (e: React.MouseEvent) => onLinkClick(linkHref, e);
      }
      nodes.push(<a {...linkProps}>{linkText}</a>);
    } else if (match[14]) {
      // Strikethrough ~~text~~
      nodes.push(
        <del key={`del-${keyIndex}`} className={styles.strikethrough}>
          {match[15]}
        </del>,
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

// =============================================================================
// Block Parsing
// =============================================================================

/**
 * Parse markdown content into an array of block-level elements.
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

    // Code block (``` ... ```)
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

    // Heading (#{1,6} ...)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        content: headingMatch[2].replace(/#+\s*$/, ''), // remove trailing ###
        level: headingMatch[1].length,
      });
      i++;
      continue;
    }

    // Horizontal rule (---, ***, ___)
    if (line.trim().match(/^(-{3,}|\*{3,}|_{3,})$/)) {
      blocks.push({ type: 'horizontal-rule', content: '' });
      i++;
      continue;
    }

    // Blockquote (> ...)
    if (line.match(/^\s*>\s?/)) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].match(/^\s*>\s?/)) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', content: quoteLines.join('\n') });
      continue;
    }

    // Table detection - line with | and next line is separator
    if (line.includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\s*\|?\s*[-:]+[-| :]*\|?\s*$/)) {
      const headerRow = parseTableRow(line);
      i++;

      // Parse and skip separator line (alignment info parsed but used for future enhancement)
      parseTableAlignments(lines[i]);
      i++;

      // Parse body rows
      const bodyRows: TableRow[] = [];
      while (i < lines.length && lines[i].trim() !== '' && lines[i].includes('|')) {
        bodyRows.push(parseTableRow(lines[i]));
        i++;
      }

      blocks.push({
        type: 'table',
        content: '',
        header: { cells: headerRow.cells },
        rows: bodyRows,
      });
      continue;
    }

    // Task list (- [ ] or - [x])
    if (line.match(/^\s*[-*]\s+\[[ xX]\]\s+/)) {
      const items = parseListItems(lines, i, 'task');
      // Count how many lines were consumed
      let consumed = 0;
      let j = i;
      while (j < lines.length && (lines[j].match(/^\s*[-*]\s+\[[ xX]\]\s+/) || lines[j].match(/^\s{2,}[-*]\s+/))) {
        consumed++;
        j++;
      }
      blocks.push({ type: 'task-list', content: '', items });
      i += consumed;
      continue;
    }

    // Unordered list (- or *)
    if (line.match(/^\s*[-*+]\s+/)) {
      const items: ListItem[] = [];
      while (i < lines.length && lines[i].match(/^\s*[-*+]\s+/)) {
        const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        const level = Math.floor(indent / 2);
        const text = lines[i].replace(/^\s*[-*+]\s+/, '');
        items.push({ text, level, checked: null });
        i++;
      }
      blocks.push({ type: 'unordered-list', content: '', items });
      continue;
    }

    // Ordered list (1. 2. etc.)
    if (line.match(/^\s*\d+\.\s+/)) {
      const items: ListItem[] = [];
      while (i < lines.length && lines[i].match(/^\s*\d+\.\s+/)) {
        const indent = lines[i].match(/^(\s*)/)?.[1].length ?? 0;
        const level = Math.floor(indent / 2);
        const text = lines[i].replace(/^\s*\d+\.\s+/, '');
        items.push({ text, level, checked: null });
        i++;
      }
      blocks.push({ type: 'ordered-list', content: '', items });
      continue;
    }

    // Standalone image (![alt](url))
    const imageMatch = line.match(/^\s*!\[([^\]]*)\]\(([^)]+)\)(?:\s*"([^"]*)")?\s*$/);
    if (imageMatch) {
      blocks.push({
        type: 'image',
        content: '',
        alt: imageMatch[1],
        src: imageMatch[2],
        title: imageMatch[3],
      });
      i++;
      continue;
    }

    // Paragraph - collect consecutive non-empty, non-special lines
    const paragraphLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].match(/^#{1,6}\s+/) &&
      !lines[i].match(/^\s*[-*+]\s+/) &&
      !lines[i].match(/^\s*\d+\.\s+/) &&
      !lines[i].match(/^\s*>\s?/) &&
      !lines[i].match(/^(-{3,}|\*{3,}|_{3,})$/) &&
      !lines[i].match(/^\s*!\[([^\]]*)\]\(([^)]+)\)\s*$/) &&
      !(lines[i].includes('|') && i + 1 < lines.length && lines[i + 1].match(/^\s*\|?\s*[-:]+[-| :]*\|?\s*$/))
    ) {
      paragraphLines.push(lines[i]);
      i++;
    }

    if (paragraphLines.length > 0) {
      blocks.push({ type: 'paragraph', content: paragraphLines.join('\n') });
    }
  }

  return blocks;
}

/**
 * Parse a table row from a markdown line.
 */
function parseTableRow(line: string): TableRow {
  const trimmed = line.trim();
  // Remove leading and trailing pipes
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  const cells = stripped.split('|').map((cell) => cell.trim());
  return { cells };
}

/**
 * Parse column alignments from a table separator line.
 */
function parseTableAlignments(line: string): TableColumnAlignment[] {
  const trimmed = line.trim();
  const stripped = trimmed.replace(/^\|/, '').replace(/\|$/, '');
  return stripped.split('|').map((cell) => {
    const c = cell.trim();
    if (c.startsWith(':') && c.endsWith(':')) return 'center';
    if (c.endsWith(':')) return 'right';
    if (c.startsWith(':')) return 'left';
    return 'none';
  });
}

/**
 * Parse task list items from consecutive lines.
 */
function parseListItems(lines: string[], startIdx: number, _type: 'task'): ListItem[] {
  const items: ListItem[] = [];
  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const taskMatch = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.+)/);
    if (taskMatch) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const level = Math.floor(indent / 2);
      items.push({
        text: taskMatch[2],
        checked: taskMatch[1] !== ' ',
        level,
      });
      i++;
    } else if (line.match(/^\s{2,}[-*]\s+/)) {
      // Sub-item
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
      const level = Math.floor(indent / 2);
      const text = line.replace(/^\s*[-*]\s+/, '');
      items.push({ text, level, checked: null });
      i++;
    } else {
      break;
    }
  }
  return items;
}

// =============================================================================
// Code Block with Copy Button
// =============================================================================

function CodeBlock({
  content,
  language,
  styles,
  showCopyButton,
}: {
  content: string;
  language?: string;
  styles: MarkdownStyleConfig;
  showCopyButton: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [content]);

  return (
    <div className={styles.codeBlock}>
      {/* Header bar with language and copy button */}
      {(language || showCopyButton) && (
        <div className="flex items-center justify-between px-3 py-1.5 border-b border-poe-border/30 bg-[#080809]">
          {language && (
            <span className="text-poe-text-muted text-[11px] font-mono tracking-wide">{language}</span>
          )}
          {!language && <span />}
          {showCopyButton && (
            <button
              type="button"
              onClick={handleCopy}
              className="text-poe-text-muted hover:text-poe-gold text-xs transition-colors flex items-center gap-1"
              aria-label={copied ? 'Copied!' : 'Copy code'}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                  <span className="text-[#1BA29B]">Copied!</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                  </svg>
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>
      )}
      <pre className="p-3 overflow-x-auto">
        <code className="text-[#b0b0b8] text-xs font-mono whitespace-pre leading-relaxed">
          {content}
        </code>
      </pre>
    </div>
  );
}

// =============================================================================
// Block Renderers
// =============================================================================

/**
 * Render a parsed block as a React element.
 */
function renderBlock(
  block: ParsedBlock,
  idx: number,
  styles: MarkdownStyleConfig,
  openLinksInNewTab: boolean,
  onLinkClick?: (href: string, event: React.MouseEvent) => void,
  maxHeadingLevel?: number,
  showCodeCopyButton?: boolean,
): ReactNode {
  switch (block.type) {
    case 'heading': {
      const level = block.level ?? 2;
      const effectiveLevel = maxHeadingLevel ? Math.min(level, maxHeadingLevel) : level;
      const Tag = `h${effectiveLevel}` as keyof JSX.IntrinsicElements;
      return (
        <Tag key={idx} className={styles.heading[level] || styles.heading[6]}>
          {parseInline(block.content, styles, openLinksInNewTab, onLinkClick)}
        </Tag>
      );
    }

    case 'code':
      return (
        <CodeBlock
          key={idx}
          content={block.content}
          language={block.language}
          styles={styles}
          showCopyButton={!!showCodeCopyButton}
        />
      );

    case 'unordered-list':
      return (
        <ul key={idx} className={styles.unorderedList}>
          {(block.items ?? []).map((item, itemIdx) => (
            <li key={itemIdx} className={styles.listItem} style={{ paddingLeft: `${item.level * 16}px` }}>
              <span className="text-poe-gold mr-2 inline-block w-2 text-center">&#8226;</span>
              {parseInline(item.text, styles, openLinksInNewTab, onLinkClick)}
            </li>
          ))}
        </ul>
      );

    case 'ordered-list':
      return (
        <ol key={idx} className={styles.orderedList}>
          {(block.items ?? []).map((item, itemIdx) => (
            <li key={itemIdx} className={styles.listItem} style={{ paddingLeft: `${item.level * 16}px` }}>
              <span className="text-poe-gold mr-2 inline-block min-w-[1.25rem] text-right font-mono text-xs">
                {itemIdx + 1}.
              </span>
              {parseInline(item.text, styles, openLinksInNewTab, onLinkClick)}
            </li>
          ))}
        </ol>
      );

    case 'task-list':
      return (
        <ul key={idx} className={styles.unorderedList}>
          {(block.items ?? []).map((item, itemIdx) => (
            <li key={itemIdx} className={`${styles.listItem} flex items-center gap-2`} style={{ paddingLeft: `${item.level * 16}px` }}>
              <input
                type="checkbox"
                checked={item.checked ?? false}
                readOnly
                className={styles.taskCheckbox}
              />
              <span className={item.checked ? 'line-through text-poe-text-muted' : ''}>
                {parseInline(item.text, styles, openLinksInNewTab, onLinkClick)}
              </span>
            </li>
          ))}
        </ul>
      );

    case 'blockquote':
      return (
        <blockquote key={idx} className={styles.blockquote}>
          <div className={styles.blockquoteText}>
            {parseInline(block.content, styles, openLinksInNewTab, onLinkClick)}
          </div>
        </blockquote>
      );

    case 'horizontal-rule':
      return <hr key={idx} className={styles.horizontalRule} />;

    case 'table':
      return (
        <div key={idx} className={styles.tableContainer}>
          <table className={styles.table}>
            {block.header && (
              <thead>
                <tr>
                  {block.header.cells.map((cell, cellIdx) => (
                    <th key={cellIdx} className={styles.tableHeaderCell}>
                      {parseInline(cell, styles, openLinksInNewTab, onLinkClick)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {(block.rows ?? []).map((row, rowIdx) => (
                <tr key={rowIdx}>
                  {row.cells.map((cell, cellIdx) => (
                    <td key={cellIdx} className={styles.tableBodyCell}>
                      {parseInline(cell, styles, openLinksInNewTab, onLinkClick)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );

    case 'image':
      return (
        <div key={idx} className="my-2">
          <img
            src={block.src}
            alt={block.alt || ''}
            title={block.title}
            className={styles.image}
            loading="lazy"
          />
          {block.alt && (
            <p className="text-poe-text-muted text-xs mt-1 text-center italic">
              {block.alt}
            </p>
          )}
        </div>
      );

    case 'paragraph':
    default:
      return (
        <p key={idx} className={styles.paragraph}>
          {parseInline(block.content, styles, openLinksInNewTab, onLinkClick)}
        </p>
      );
  }
}

// =============================================================================
// Main Component
// =============================================================================

/**
 * MarkdownRenderer is a standalone, reusable component for rendering
 * markdown content with PoE-themed styling.
 *
 * Features:
 *  - Comprehensive markdown support: headings, paragraphs, bold, italic,
 *    strikethrough, inline code, code blocks with language labels and copy buttons,
 *    ordered/unordered/task lists, blockquotes, horizontal rules, tables,
 *    links, images
 *  - Three visual variants: default, chat, compact
 *  - PoE-themed styling using the project's Tailwind color palette
 *  - Optional code copy button
 *  - Configurable link behavior (new tab, click handler)
 *  - Maximum heading level control
 *  - HTML sanitization option
 *
 * @example
 * ```tsx
 * // Basic usage
 * <MarkdownRenderer content="# Hello\nThis is **bold** text." />
 *
 * // Chat variant
 * <MarkdownRenderer content={message} variant="chat" />
 *
 * // With code copy button
 * <MarkdownRenderer content={markdown} showCodeCopyButton />
 * ```
 */
export function MarkdownRenderer({
  content,
  variant = 'default',
  className = '',
  sanitizeHtml = true,
  maxHeadingLevel = 6,
  openLinksInNewTab = true,
  onLinkClick,
  showCodeCopyButton = false,
  id,
}: MarkdownRendererProps) {
  // Get the style configuration for the selected variant
  const styles = STYLE_CONFIGS[variant] || STYLE_CONFIGS.default;

  // Sanitize HTML if requested (remove raw HTML tags)
  const processedContent = useMemo(() => {
    if (!sanitizeHtml) return content;
    // Remove raw HTML tags but keep the content inside them
    return content.replace(/<[^>]+>/g, '');
  }, [content, sanitizeHtml]);

  // Parse the markdown into blocks
  const blocks = useMemo(() => parseBlocks(processedContent), [processedContent]);

  if (!content.trim()) {
    return null;
  }

  return (
    <div id={id} className={`${styles.container} ${className}`}>
      {blocks.map((block, idx) =>
        renderBlock(block, idx, styles, openLinksInNewTab, onLinkClick, maxHeadingLevel, showCodeCopyButton),
      )}
    </div>
  );
}
