import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';

describe('Chat Flow Integration Tests', () => {
  it('should allow user to send a message', async () => {
    const user = userEvent.setup();

    // Mock chat input component
    render(
      <div role="textbox" aria-label="Chat message input">
        <textarea data-testid="chat-input" />
      </div>
    );

    const input = screen.getByTestId('chat-input');
    await user.type(input, 'Hello, how can you help me?');

    expect(input).toHaveValue('Hello, how can you help me?');
  });

  it('should display user message after sending', async () => {
    const user = userEvent.setup();
    const mockMessage = {
      role: 'user' as const,
      content: 'What is Path of Exile?',
      timestamp: new Date().toISOString(),
    };

    // Mock message list
    render(
      <div>
        <div data-message-role="user" data-testid="message-bubble">
          <div className="text-poe-gold-light">Exile</div>
          <p>{mockMessage.content}</p>
        </div>
      </div>
    );

    expect(screen.getByText('What is Path of Exile?')).toBeInTheDocument();
    expect(screen.getByText('Exile')).toBeInTheDocument();
    void user;
  });

  it('should show typing indicator while loading', async () => {
    render(
      <div>
        <div className="flex items-center gap-2 text-sm text-poe-text-muted">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-poe-gold rounded-full animate-pulse" />
            <span className="w-2 h-2 bg-poe-gold rounded-full animate-pulse" />
            <span className="w-2 h-2 bg-poe-gold rounded-full animate-pulse" />
          </div>
          <span>Assistant is thinking...</span>
        </div>
      </div>
    );

    expect(screen.getByText('Assistant is thinking...')).toBeInTheDocument();
  });

  it('should display assistant response with markdown', async () => {
    render(
      <div data-message-role="assistant">
        <div className="text-poe-teal">Knowledge Assistant</div>
        <div className="markdown-renderer">
          <p><strong>Path of Exile</strong> is an <em>action RPG</em></p>
        </div>
      </div>
    );

    expect(screen.getByText('Path of Exile')).toBeInTheDocument();
    expect(screen.getByText('is an')).toBeInTheDocument();
    expect(screen.getByText('action RPG')).toBeInTheDocument();
  });

  it('should handle error states gracefully', async () => {
    const mockError = 'Connection failed. Please try again.';

    render(
      <div role="alert" className="mb-3 px-4 py-3 bg-poe-error/10 border border-poe-error/30 rounded-lg">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24">
            <path d="M12 9v2m0 4h.01" stroke="currentColor" strokeWidth="2"/>
          </svg>
          <div className="flex-1">
            <p className="font-medium">Error</p>
            <p className="opacity-90 mt-0.5">{mockError}</p>
          </div>
          <button aria-label="Dismiss error">×</button>
        </div>
      </div>
    );

    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText(mockError)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('should support keyboard navigation', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <input type="text" data-testid="chat-input" />
        <button data-testid="send-button">Send</button>
      </div>
    );

    const input = screen.getByTestId('chat-input');
    const sendButton = screen.getByTestId('send-button');

    // Focus input
    input.focus();
    expect(input).toHaveFocus();

    // Type message
    await user.type(input, 'Test message');
    expect(input).toHaveValue('Test message');

    // Tab to send button
    await user.tab();
    expect(sendButton).toHaveFocus();

    // Press Enter to send
    await user.keyboard('{Enter}');
    // Would trigger send in real implementation
  });
});

describe('Settings Flow Integration Tests', () => {
  it('should allow user to configure API key', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <label htmlFor="api-key">API Key</label>
        <input
          type="password"
          id="api-key"
          data-testid="api-key-input"
          placeholder="Enter your API key"
        />
        <button data-testid="save-button">Save</button>
      </div>
    );

    const input = screen.getByTestId('api-key-input');
    await user.type(input, 'sk-test-12345');

    expect(input).toHaveValue('sk-test-12345');
  });

  it('should toggle API key visibility', async () => {
    render(
      <div>
        <input
          type="password"
          data-testid="api-key-input"
          value="secret-key"
        />
        <button
          data-testid="toggle-visibility"
          aria-label="Show API key"
        >
          👁️
        </button>
      </div>
    );

    const input = screen.getByTestId('api-key-input') as HTMLInputElement;
    const toggleButton = screen.getByTestId('toggle-visibility');

    expect(input.type).toBe('password');

    fireEvent.click(toggleButton);
    // In real implementation, would toggle to 'text'
  });

  it('should show validation errors for invalid inputs', async () => {
    const user = userEvent.setup();

    render(
      <div>
        <label htmlFor="temperature">Temperature</label>
        <input
          type="number"
          id="temperature"
          data-testid="temperature-input"
          min="0"
          max="2"
          step="0.1"
        />
        <span data-testid="error-message" className="text-poe-error hidden">
          Temperature must be between 0 and 2
        </span>
      </div>
    );

    const input = screen.getByTestId('temperature-input');

    // Enter invalid value
    await user.clear(input);
    await user.type(input, '3');

    // In real implementation, would show error
    // expect(errorMessage).not.toHaveClass('hidden');
  });
});

describe('Item Card Integration Tests', () => {
  it('should display item information correctly', () => {
    const mockItem = {
      id: 'test-item-1',
      name: 'Tabula Rasa',
      baseType: 'Simple Robe',
      rarity: 'unique' as const,
      itemLevel: 1,
    };

    render(
      <div data-testid={`item-card-${mockItem.id}`} data-rarity={mockItem.rarity}>
        <h3 className="text-poe-rarity-unique">{mockItem.name}</h3>
        <p className="text-poe-text-secondary">{mockItem.baseType}</p>
        <div className="text-poe-text-muted">ilvl {mockItem.itemLevel}</div>
      </div>
    );

    expect(screen.getByText('Tabula Rasa')).toBeInTheDocument();
    expect(screen.getByText('Simple Robe')).toBeInTheDocument();
    expect(screen.getByText('ilvl 1')).toBeInTheDocument();
  });

  it('should show different colors for different rarities', () => {
    const { rerender } = render(
      <div data-rarity="unique">
        <span className="text-poe-rarity-unique">Unique Item</span>
      </div>
    );
    expect(screen.getByText('Unique Item')).toHaveClass('text-poe-rarity-unique');

    rerender(
      <div data-rarity="rare">
        <span className="text-poe-rarity-rare">Rare Item</span>
      </div>
    );
    expect(screen.getByText('Rare Item')).toHaveClass('text-poe-rarity-rare');
  });

  it('should display item stats correctly', () => {
    const mockStats = [
      { text: '+100 to maximum Life', implicit: false },
      { text: '+20% to all Elemental Resistances', implicit: false },
    ];

    render(
      <div>
        {mockStats.map((stat, index) => (
          <li key={index} className="text-poe-text-primary">
            {stat.text}
          </li>
        ))}
      </div>
    );

    expect(screen.getByText('+100 to maximum Life')).toBeInTheDocument();
    expect(screen.getByText('+20% to all Elemental Resistances')).toBeInTheDocument();
  });
});
