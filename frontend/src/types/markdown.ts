/**
 * TypeScript types for the MarkdownRenderer component.
 *
 * The MarkdownRenderer is a standalone, reusable component that renders
 * markdown content with PoE-themed styling. It supports comprehensive
 * markdown features including headings, lists, code blocks, tables,
 * blockquotes, images, links, and more.
 */

// ---------------------------------------------------------------------------
// Core Component Props
// ---------------------------------------------------------------------------

/**
 * Props for the MarkdownRenderer component.
 *
 * @example
 * ```tsx
 * <MarkdownRenderer
 *   content="# Hello World\nThis is **bold** text."
 *   variant="chat"
 * />
 * ```
 */
export interface MarkdownRendererProps {
  /** Raw markdown content to render */
  content: string;

  /**
   * Visual variant controlling the rendering style.
   * - `'default'` - Standard full-featured rendering
   * - `'chat'` - Optimized for chat messages (smaller fonts, tighter spacing)
   * - `'compact'` - Minimal spacing, suitable for tooltips or small containers
   * @default 'default'
   */
  variant?: MarkdownVariant;

  /** Optional additional CSS class names for the root container */
  className?: string;

  /**
   * Whether to sanitize HTML in the markdown content.
   * When true, raw HTML tags are escaped rather than rendered.
   * @default true
   */
  sanitizeHtml?: boolean;

  /**
   * Base URL to prepend to relative image and link URLs.
   * Useful when rendering markdown from external sources.
   */
  baseUrl?: string;

  /**
   * Callback fired when a link is clicked.
   * Can be used for analytics or custom navigation.
   */
  onLinkClick?: (href: string, event: React.MouseEvent) => void;

  /**
   * Maximum heading level to render (1-6).
   * Headings above this level will be rendered as paragraphs.
   * @default 6
   */
  maxHeadingLevel?: number;

  /**
   * Whether to open links in a new tab.
   * @default true
   */
  openLinksInNewTab?: boolean;

  /**
   * Optional ID for the root container element.
   */
  id?: string;

  /**
   * Whether to show a "Copy" button on code blocks.
   * @default false
   */
  showCodeCopyButton?: boolean;
}

/**
 * Visual variant of the markdown renderer.
 */
export type MarkdownVariant = 'default' | 'chat' | 'compact';

// ---------------------------------------------------------------------------
// Internal Parsing Types
// ---------------------------------------------------------------------------

/**
 * The type of a parsed block-level element.
 */
export type BlockType =
  | 'paragraph'
  | 'code'
  | 'heading'
  | 'unordered-list'
  | 'ordered-list'
  | 'task-list'
  | 'blockquote'
  | 'horizontal-rule'
  | 'table'
  | 'image';

/**
 * A parsed block-level markdown element.
 */
export interface ParsedBlock {
  /** The type of the block element */
  type: BlockType;
  /** Raw text content of the block */
  content: string;
  /** Heading level (1-6), only for heading blocks */
  level?: number;
  /** List items, only for list blocks */
  items?: ListItem[];
  /** Code language identifier, only for code blocks */
  language?: string;
  /** Table rows, only for table blocks */
  rows?: TableRow[];
  /** Table header row, only for table blocks */
  header?: TableRow;
  /** Whether the blockquote is nested */
  isNested?: boolean;
  /** Image URL */
  src?: string;
  /** Image alt text */
  alt?: string;
  /** Image title */
  title?: string;
}

/**
 * A list item within an ordered or unordered list.
 */
export interface ListItem {
  /** The text content of the list item */
  text: string;
  /** Whether the item is checked (for task lists) */
  checked?: boolean | null;
  /** Nesting level (0 = top level) */
  level: number;
  /** Sub-items for nested lists */
  children?: ListItem[];
}

/**
 * A row in a markdown table.
 */
export interface TableRow {
  /** Array of cell values in the row */
  cells: string[];
}

/**
 * Alignment of a table column.
 */
export type TableColumnAlignment = 'left' | 'center' | 'right' | 'none';

// ---------------------------------------------------------------------------
// Styling Configuration Types
// ---------------------------------------------------------------------------

/**
 * Configuration for PoE-themed markdown styling per variant.
 * Used internally to compute Tailwind class sets.
 */
export interface MarkdownStyleConfig {
  /** Root container classes */
  container: string;
  /** Paragraph text classes */
  paragraph: string;
  /** Heading classes indexed by level (1-6) */
  heading: Record<number, string>;
  /** Code block container classes */
  codeBlock: string;
  /** Inline code classes */
  inlineCode: string;
  /** Unordered list classes */
  unorderedList: string;
  /** Ordered list classes */
  orderedList: string;
  /** List item classes */
  listItem: string;
  /** Blockquote classes */
  blockquote: string;
  /** Blockquote text classes */
  blockquoteText: string;
  /** Horizontal rule classes */
  horizontalRule: string;
  /** Link classes */
  link: string;
  /** Image classes */
  image: string;
  /** Table container classes */
  tableContainer: string;
  /** Table classes */
  table: string;
  /** Table header cell classes */
  tableHeaderCell: string;
  /** Table body cell classes */
  tableBodyCell: string;
  /** Bold text classes */
  bold: string;
  /** Italic text classes */
  italic: string;
  /** Strikethrough text classes */
  strikethrough: string;
  /** Task list checkbox classes */
  taskCheckbox: string;
}
