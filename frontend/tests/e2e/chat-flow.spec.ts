/**
 * End-to-end test for the complete chat flow.
 *
 * Validates the full pipeline from frontend UI interactions through the
 * backend API, including:
 *   - Frontend to backend API connectivity
 *   - SSE streaming functionality
 *   - Conversation history management
 *   - Configuration updates affecting chat behavior
 *   - Error handling for various scenarios
 *   - Chat message display and UI rendering
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const FRONTEND_URL = 'http://localhost:9460';
const BACKEND_URL = 'http://localhost:8460';
const API_BASE = `${BACKEND_URL}/api`;
const FRONTEND_API_BASE = `${FRONTEND_URL}/api`;

// Timeout for SSE streaming responses (LLM can be slow)
const STREAMING_TIMEOUT = 30_000;
// Timeout for regular API calls
const API_TIMEOUT = 10_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Make a direct API GET request to the backend and return the response.
 */
async function apiGet(path: string): Promise<Response> {
  return fetch(`${API_BASE}${path}`);
}

/**
 * Make a direct POST request to the backend API.
 */
async function apiPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * Make a GET request through the frontend proxy to test the proxy layer.
 */
async function proxiedGet(path: string): Promise<Response> {
  return fetch(`${FRONTEND_API_BASE}${path}`);
}

/**
 * Make a proxied POST request through the frontend dev server.
 */
async function proxiedPost(path: string, body: unknown): Promise<Response> {
  return fetch(`${FRONTEND_API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/**
 * SSE event collector result type.
 */
interface SSEEventCollection {
  sources: unknown[];
  tokens: string[];
  done: unknown | null;
  errors: string[];
  raw: string[];
  /** The conversation_id from the first sources event, if any. */
  conversationId: string | null;
}

/**
 * Collect all SSE events from a streaming endpoint response.
 * Returns parsed events grouped by type.
 */
async function collectSSEEvents(response: Response): Promise<SSEEventCollection> {
  const result: SSEEventCollection = {
    sources: [],
    tokens: [],
    done: null,
    errors: [],
    raw: [],
    conversationId: null,
  };

  if (!response.body) {
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = '';

  while (true) {
    const { done: streamDone, value } = await reader.read();
    if (streamDone) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('event:')) {
        currentEvent = trimmed.slice(6).trim();
      } else if (trimmed.startsWith('data:')) {
        const rawData = trimmed.slice(5).trim();
        result.raw.push(rawData);
        try {
          const data = JSON.parse(rawData);
          switch (currentEvent) {
            case 'sources':
              result.sources.push(data);
              if (data.conversation_id && !result.conversationId) {
                result.conversationId = data.conversation_id;
              }
              break;
            case 'token':
              result.tokens.push(data.token || '');
              break;
            case 'done':
              result.done = data;
              break;
            case 'error':
              result.errors.push(data.error || 'Unknown error');
              break;
          }
        } catch {
          // Non-JSON data line, skip
        }
        currentEvent = '';
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Test Suite: Backend API Connectivity
// ---------------------------------------------------------------------------

test.describe('Backend API Connectivity', () => {
  test('GET /api/ returns root information', async () => {
    const response = await apiGet('/');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('message');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('status');
    expect(data.status).toBe('operational');
  });

  test('GET /api/health returns healthy status', async () => {
    const response = await apiGet('/health');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('version');
    expect(data).toHaveProperty('timestamp');
    expect(data).toHaveProperty('chromadb_status');
    expect(data).toHaveProperty('embeddings_status');
    expect(data).toHaveProperty('vectorstore_status');
  });

  test('GET /api/config returns configuration with correct structure', async () => {
    const response = await apiGet('/config');
    expect(response.ok).toBe(true);

    const data = await response.json();
    // Verify top-level fields
    expect(data).toHaveProperty('app_name');
    expect(data).toHaveProperty('app_version');
    expect(data).toHaveProperty('environment');

    // Verify nested llm config
    expect(data).toHaveProperty('llm');
    expect(data.llm).toHaveProperty('provider');
    expect(data.llm).toHaveProperty('model');

    // Verify nested embedding config
    expect(data).toHaveProperty('embedding');
    expect(data.embedding).toHaveProperty('provider');

    // Verify nested rag config
    expect(data).toHaveProperty('rag');
    expect(data.rag).toHaveProperty('top_k_results');

    // Verify nested server config
    expect(data).toHaveProperty('server');
    expect(data.server).toHaveProperty('host');
    expect(data.server).toHaveProperty('port');
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Frontend Proxy Connectivity
// ---------------------------------------------------------------------------

test.describe('Frontend Proxy Connectivity', () => {
  test('Frontend proxy forwards /api/health to backend', async () => {
    const response = await proxiedGet('/health');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data.status).toBe('healthy');
    expect(data).toHaveProperty('version');
  });

  test('Frontend proxy forwards /api/config to backend', async () => {
    const response = await proxiedGet('/config');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('app_name');
    expect(data).toHaveProperty('llm');
  });

  test('Frontend proxy forwards /api/ root endpoint', async () => {
    const response = await proxiedGet('/');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('message');
    expect(data).toHaveProperty('status');
  });
});

// ---------------------------------------------------------------------------
// Test Suite: SSE Streaming Chat Flow
// ---------------------------------------------------------------------------

test.describe('SSE Streaming Chat Flow', () => {
  test('POST /api/chat/stream returns SSE event stream', async () => {
    const response = await apiPost('/chat/stream', {
      message: 'What is Flameblast?',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await collectSSEEvents(response);

    // The stream should produce at least a sources event or an error event
    // (sources appear before LLM generation; error may occur if no API key)
    expect(events.sources.length + events.errors.length).toBeGreaterThan(0);

    // Sources event should contain document data when present
    if (events.sources.length > 0) {
      const sourcesData = events.sources[0] as Record<string, unknown>;
      expect(sourcesData).toHaveProperty('sources');
      expect(sourcesData).toHaveProperty('conversation_id');
      expect(sourcesData).toHaveProperty('document_count');
      expect(Array.isArray(sourcesData.sources)).toBe(true);
    }
  });

  test('SSE stream provides conversation_id in sources event', async () => {
    const response = await apiPost('/chat/stream', {
      message: 'Tell me about the Witch class',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(true);

    const events = await collectSSEEvents(response);

    // conversation_id should be available from sources event
    if (events.conversationId) {
      expect(events.conversationId).toBeTruthy();
      expect(typeof events.conversationId).toBe('string');
      expect(events.conversationId.length).toBeGreaterThan(0);
    } else if (events.done) {
      // Fallback: check done event
      const doneData = events.done as Record<string, unknown>;
      expect(doneData).toHaveProperty('conversation_id');
    } else {
      // At minimum, we should have an error or sources event
      expect(events.errors.length + events.sources.length).toBeGreaterThan(0);
    }
  });

  test('SSE stream via frontend proxy returns valid events', async () => {
    const response = await proxiedPost('/chat/stream', {
      message: 'How does crafting work?',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(true);
    expect(response.headers.get('content-type')).toContain('text/event-stream');

    const events = await collectSSEEvents(response);
    // Should receive events (sources, tokens, done, or error)
    expect(events.raw.length).toBeGreaterThan(0);
  });

  test('SSE stream with game_version poe1 returns events', async () => {
    const response = await apiPost('/chat/stream', {
      message: 'What are the best starter builds?',
      game_version: 'poe1',
    });
    expect(response.ok).toBe(true);

    const events = await collectSSEEvents(response);
    // Should produce events regardless of game version
    expect(events.sources.length + events.errors.length).toBeGreaterThan(0);
  });

  test('SSE stream with build_context parameter accepted', async () => {
    const response = await apiPost('/chat/stream', {
      message: 'What skills should I use?',
      game_version: 'poe2',
      build_context: 'Witch - Blood Mage',
    });
    expect(response.ok).toBe(true);

    const events = await collectSSEEvents(response);
    expect(events.sources.length + events.errors.length).toBeGreaterThan(0);
  });

  test('SSE stream error events contain error details', async () => {
    // When LLM API key is not configured, the stream should return an error
    // event with a descriptive error_type and error message
    const response = await apiPost('/chat/stream', {
      message: 'Tell me about items',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(true);

    const events = await collectSSEEvents(response);

    // If we get an error, verify its structure
    if (events.errors.length > 0) {
      // Error events should have descriptive messages
      const errorRaw = events.raw.find((r) => {
        try {
          const d = JSON.parse(r);
          return d.error_type !== undefined;
        } catch { return false; }
      });
      if (errorRaw) {
        const errorData = JSON.parse(errorRaw);
        expect(errorData).toHaveProperty('error');
        expect(errorData).toHaveProperty('error_type');
        expect(typeof errorData.error).toBe('string');
        expect(errorData.error.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Conversation History Management
// ---------------------------------------------------------------------------

test.describe('Conversation History Management', () => {
  test('Conversation ID from sources persists in subsequent requests', async () => {
    // First message - get conversation ID from sources event
    const response1 = await apiPost('/chat/stream', {
      message: 'Tell me about the Marauder class',
      game_version: 'poe2',
    });
    expect(response1.ok).toBe(true);

    const events1 = await collectSSEEvents(response1);
    const convId = events1.conversationId;
    expect(convId).toBeTruthy();

    // Second message with the same conversation_id
    const response2 = await apiPost('/chat/stream', {
      message: 'What ascendancies does it have?',
      game_version: 'poe2',
      conversation_id: convId,
    });
    expect(response2.ok).toBe(true);

    const events2 = await collectSSEEvents(response2);
    // The sources event should reference the same conversation
    if (events2.conversationId) {
      expect(events2.conversationId).toBe(convId);
    }
  });

  test('GET /api/chat/history returns conversation list', async () => {
    const response = await apiGet('/chat/history');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('data');
    expect(data).toHaveProperty('total');
    expect(Array.isArray(data.data)).toBe(true);
  });

  test('GET /api/chat/history/stats returns store statistics', async () => {
    const response = await apiGet('/chat/history/stats');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('data');
  });

  test('GET /api/chat/history/{id} retrieves conversation by ID', async () => {
    // First create a conversation by sending a chat message
    const streamResponse = await apiPost('/chat/stream', {
      message: 'What is the Scion class?',
      game_version: 'poe2',
    });
    expect(streamResponse.ok).toBe(true);

    const events = await collectSSEEvents(streamResponse);
    const conversationId = events.conversationId;
    expect(conversationId).toBeTruthy();

    // Retrieve the conversation history
    const response = await apiGet(`/chat/history/${conversationId}`);
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
    expect(data).toHaveProperty('data');
    expect(data.data).toHaveProperty('conversation_id');
    expect(data.data.conversation_id).toBe(conversationId);
    expect(data.data).toHaveProperty('messages');
    expect(Array.isArray(data.data.messages)).toBe(true);
    expect(data.data.messages.length).toBeGreaterThan(0);
    // Messages should have role and content
    const firstMsg = data.data.messages[0] as Record<string, unknown>;
    expect(firstMsg).toHaveProperty('role');
    expect(firstMsg).toHaveProperty('content');
  });

  test('GET /api/chat/history/{id} returns 404 for non-existent conversation', async () => {
    const response = await apiGet('/chat/history/non-existent-conv-id');
    expect(response.status).toBe(404);
  });

  test('DELETE /api/chat/history/{id} removes a conversation', async () => {
    // Create a conversation
    const streamResponse = await apiPost('/chat/stream', {
      message: 'What is the Duelist class?',
      game_version: 'poe2',
    });
    const events = await collectSSEEvents(streamResponse);
    const convId = events.conversationId;
    expect(convId).toBeTruthy();

    // Delete the conversation
    const deleteResponse = await fetch(`${API_BASE}/chat/history/${convId}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.ok).toBe(true);

    // Verify it's gone
    const getResponse = await apiGet(`/chat/history/${convId}`);
    expect(getResponse.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Configuration Updates
// ---------------------------------------------------------------------------

test.describe('Configuration Updates', () => {
  test('PUT /api/config updates rag_top_k configuration', async () => {
    // Get current config first
    const configResponse = await apiGet('/config');
    expect(configResponse.ok).toBe(true);
    const originalConfig = await configResponse.json();
    const originalTopK = originalConfig.rag?.top_k_results ?? 5;

    // Update rag_top_k to a different value
    const newTopK = originalTopK === 5 ? 3 : 5;
    const updateResponse = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rag_top_k: newTopK }),
    });
    expect(updateResponse.ok).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData).toHaveProperty('success');
    expect(updateData.success).toBe(true);
    expect(updateData).toHaveProperty('updated_fields');
    expect(updateData.updated_fields).toContain('rag_top_k');

    // Verify the update took effect
    const verifyResponse = await apiGet('/config');
    const verifyData = await verifyResponse.json();
    expect(verifyData.rag.top_k_results).toBe(newTopK);

    // Restore original value
    await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rag_top_k: originalTopK }),
    });
  });

  test('PUT /api/config via frontend proxy works', async () => {
    const configResponse = await proxiedGet('/config');
    const originalConfig = await configResponse.json();
    const originalTopK = originalConfig.rag?.top_k_results ?? 5;

    const newTopK = originalTopK === 5 ? 3 : 5;
    const updateResponse = await fetch(`${FRONTEND_API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rag_top_k: newTopK }),
    });
    expect(updateResponse.ok).toBe(true);

    const updateData = await updateResponse.json();
    expect(updateData.success).toBe(true);

    // Restore
    await fetch(`${FRONTEND_API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rag_top_k: originalTopK }),
    });
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Error Handling
// ---------------------------------------------------------------------------

test.describe('Error Handling', () => {
  test('POST /api/chat/stream with empty message returns validation error', async () => {
    const response = await apiPost('/chat/stream', {
      message: '',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(422);
  });

  test('POST /api/chat/stream with missing message field returns validation error', async () => {
    const response = await apiPost('/chat/stream', {
      game_version: 'poe2',
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(422);
  });

  test('POST /api/chat/stream with invalid game_version returns validation error', async () => {
    const response = await apiPost('/chat/stream', {
      message: 'Hello',
      game_version: 'invalid_version',
    });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(422);
  });

  test('POST /api/chat/stream with whitespace-only message returns validation error', async () => {
    const response = await apiPost('/chat/stream', {
      message: '   ',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(false);
  });

  test('GET /api/nonexistent returns 404', async () => {
    const response = await apiGet('/nonexistent-endpoint');
    expect(response.status).toBe(404);
  });

  test('PUT /api/config with out-of-range rag_top_k returns error', async () => {
    const response = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rag_top_k: 999 }),
    });
    expect(response.ok).toBe(false);
  });

  test('Validation error response includes detail information', async () => {
    const response = await apiPost('/chat/stream', {
      message: '',
      game_version: 'poe2',
    });
    expect(response.ok).toBe(false);

    const data = await response.json();
    expect(data).toHaveProperty('detail');
    // FastAPI validation errors include detail array
    expect(Array.isArray(data.detail) || typeof data.detail === 'string').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Frontend UI Chat Flow (Playwright browser tests)
// ---------------------------------------------------------------------------

test.describe('Frontend UI Chat Flow', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto(FRONTEND_URL);
    // Wait for the app to load
    await page.waitForSelector('[data-testid="chat-input-textarea"]', {
      timeout: API_TIMEOUT,
    });
  });

  test.afterEach(async () => {
    await page.close();
  });

  test('Chat page loads with welcome banner', async () => {
    const welcomeBanner = page.getByTestId('welcome-banner');
    await expect(welcomeBanner).toBeVisible();

    // Verify the welcome text
    await expect(page.getByText('Welcome, Exile')).toBeVisible();
  });

  test('Chat input area is present and functional', async () => {
    const textarea = page.getByTestId('chat-input-textarea');
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeEnabled();

    // Type a message
    await textarea.fill('What is Flameblast?');
    const value = await textarea.inputValue();
    expect(value).toBe('What is Flameblast?');
  });

  test('Send button becomes enabled when text is entered', async () => {
    // Initially the send button should be disabled
    const sendButton = page.getByTestId('chat-send-button');
    await expect(sendButton).toBeDisabled();

    // Type text
    const textarea = page.getByTestId('chat-input-textarea');
    await textarea.fill('Hello');

    // Now the send button should be enabled
    await expect(sendButton).toBeEnabled();
  });

  test('Sending a message via the chat UI triggers streaming', async () => {
    const textarea = page.getByTestId('chat-input-textarea');
    await textarea.fill('What is the Witch class in Path of Exile?');

    const sendButton = page.getByTestId('chat-send-button');
    await sendButton.click();

    // The welcome banner should disappear once messages are present
    await expect(page.getByTestId('welcome-banner')).not.toBeVisible({ timeout: 5000 });

    // A user message bubble should appear with the data-message-role attribute
    const messageList = page.getByTestId('chat-message-list');
    await expect(messageList).toBeVisible();

    // Wait for messages to appear (user + assistant placeholder = at least 2)
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('[data-message-role]');
        return messages.length >= 2;
      },
      { timeout: STREAMING_TIMEOUT },
    );

    // Verify messages are displayed
    const messageBubbles = await page.locator('[data-message-role]').all();
    expect(messageBubbles.length).toBeGreaterThanOrEqual(2);

    // Take a screenshot for evidence
    await page.screenshot({
      path: 'screenshots/task-60-e2e-chat-message-sent.png',
      fullPage: false,
    });
  });

  test('Chat message display shows user and assistant message bubbles', async () => {
    const textarea = page.getByTestId('chat-input-textarea');
    await textarea.fill('Tell me about the Ranger class');
    await page.getByTestId('chat-send-button').click();

    // Wait for messages to render (at least user + assistant/system)
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('[data-message-role]');
        return messages.length >= 2;
      },
      { timeout: STREAMING_TIMEOUT },
    );

    // Check that a user message is present
    const userMessages = await page.locator('[data-message-role="user"]').count();
    expect(userMessages).toBeGreaterThanOrEqual(1);

    // After streaming, there should be either an assistant message (success)
    // or a system error message (when LLM API key is not configured)
    const assistantMessages = await page.locator('[data-message-role="assistant"]').count();
    const systemMessages = await page.locator('[data-message-role="system"]').count();
    expect(assistantMessages + systemMessages).toBeGreaterThanOrEqual(1);
  });

  test('Clear conversation button resets chat with confirmation', async () => {
    // Send a message first
    const textarea = page.getByTestId('chat-input-textarea');
    await textarea.fill('What is POE?');
    await page.getByTestId('chat-send-button').click();

    // Wait for messages to appear
    await page.waitForFunction(
      () => {
        const messages = document.querySelectorAll('[data-message-role]');
        return messages.length >= 2;
      },
      { timeout: STREAMING_TIMEOUT },
    );

    // The clear button should now be visible
    const clearButton = page.getByTestId('clear-conversation-button');
    await expect(clearButton).toBeVisible();

    // Click clear to open confirmation dialog
    await clearButton.click();

    // A confirmation dialog should appear
    const confirmDialog = page.getByTestId('confirmation-dialog');
    await expect(confirmDialog).toBeVisible({ timeout: 5000 });

    // Click "Clear All" confirm button
    const confirmButton = page.getByTestId('confirmation-dialog-confirm');
    await expect(confirmButton).toBeVisible();
    await confirmButton.click();

    // Welcome banner should reappear after clearing
    await expect(page.getByTestId('welcome-banner')).toBeVisible({ timeout: 5000 });
  });

  test('Settings panel opens and displays configuration sections', async () => {
    // Click settings button
    const settingsButton = page.getByTestId('settings-open-button');
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();

    // Settings panel should appear
    const settingsPanel = page.getByTestId('settings-panel');
    await expect(settingsPanel).toBeVisible({ timeout: 5000 });

    // Should show the main settings header (h2 in the settings panel)
    const settingsHeader = settingsPanel.locator('h2');
    await expect(settingsHeader).toHaveText('Settings');

    // Should show LLM Provider section heading
    await expect(settingsPanel.getByRole('heading', { name: 'LLM Provider' })).toBeVisible({ timeout: 5000 });

    // Should show RAG Configuration section heading
    await expect(settingsPanel.getByRole('heading', { name: 'RAG Configuration' })).toBeVisible({ timeout: 5000 });

    // Close settings
    const closeButton = page.getByTestId('settings-panel-close');
    await closeButton.click();

    // Settings panel should slide off-screen (translate-x-full class)
    // Wait for the transition and check the panel is no longer aria-modal
    await page.waitForFunction(
      () => {
        const panel = document.querySelector('[data-testid="settings-panel"]');
        if (!panel) return true;
        return panel.getAttribute('aria-hidden') === 'true' &&
               panel.classList.contains('translate-x-full');
      },
      { timeout: 5000 },
    );
  });

  test('Game version badge is present in header', async () => {
    // The game version label is displayed in the header
    // The default is "Path of Exile 2" (not "PoE2")
    const versionBadge = page.locator('text=Path of Exile 2').first();
    await expect(versionBadge).toBeVisible({ timeout: 5000 });
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Chat Stream Health Check
// ---------------------------------------------------------------------------

test.describe('Chat Stream Health', () => {
  test('GET /api/chat/stream/health returns health status', async () => {
    const response = await apiGet('/chat/stream/health');
    expect(response.ok).toBe(true);

    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data.success).toBe(true);
  });

  test('Streaming health check reports dependency status', async () => {
    const response = await apiGet('/chat/stream/health');
    const data = await response.json();

    // Health check should include status information
    expect(data).toHaveProperty('status');
    expect(typeof data.status).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Chat API with Conversation History
// ---------------------------------------------------------------------------

test.describe('Chat with Conversation History', () => {
  test('POST /api/chat/stream accepts conversation_history parameter', async () => {
    // Send first message to get a conversation_id
    const response1 = await apiPost('/chat/stream', {
      message: 'What is the Templar class?',
      game_version: 'poe2',
    });
    const events1 = await collectSSEEvents(response1);
    const convId = events1.conversationId;
    expect(convId).toBeTruthy();

    // Send second message with conversation history context
    const response2 = await apiPost('/chat/stream', {
      message: 'What are its ascendancies?',
      game_version: 'poe2',
      conversation_id: convId,
      conversation_history: [
        { role: 'user', content: 'What is the Templar class?' },
        { role: 'assistant', content: 'The Templar is...' },
      ],
    });
    expect(response2.ok).toBe(true);

    const events2 = await collectSSEEvents(response2);
    // Should receive events (sources or error)
    expect(events2.sources.length + events2.errors.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Test Suite: Data Freshness Endpoint
// ---------------------------------------------------------------------------

test.describe('Data Freshness', () => {
  test('GET /api/freshness returns data freshness information', async () => {
    const response = await apiGet('/freshness');
    expect(response.ok).toBe(true);

    const data = await response.json();
    // The response should contain freshness data
    expect(data).toBeDefined();
    expect(typeof data).toBe('object');
  });
});
