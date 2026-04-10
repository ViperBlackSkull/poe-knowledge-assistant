# POE Knowledge Assistant API Documentation

Complete API reference for the POE Knowledge Assistant backend service.

- **Base URL**: `http://localhost:8460/api` (development)
- **OpenAPI Spec**: `/docs` (Swagger UI) or `/redoc` (ReDoc)
- **Version**: 1.0.0

---

## Table of Contents

1. [Authentication](#authentication)
2. [Error Handling](#error-handling)
3. [Common Response Format](#common-response-format)
4. [Root](#root)
5. [Health Check](#health-check)
6. [Configuration](#configuration)
7. [Chat](#chat)
8. [Chat History](#chat-history)
9. [Streaming (SSE)](#streaming-sse)
10. [Jobs](#jobs)
11. [Scraper](#scraper)
12. [Scrape Timestamps](#scrape-timestamps)
13. [Data Freshness](#data-freshness)
14. [Admin](#admin)
15. [Indexer](#indexer)
16. [SDK / Client Examples](#sdk--client-examples)
17. [Postman Collection](#postman-collection)

---

## Authentication

The API supports optional API key authentication via the `X-API-Key` header.

```
X-API-Key: your-api-key-here
```

**Security Notes:**
- API keys are stored in environment variables and never returned in API responses
- The `api_key_set` boolean in the config response indicates whether a key is configured
- In development mode, API keys are optional
- In production mode, provider-specific API keys are required (OpenAI, Anthropic)

**Setting API Keys:**

```bash
# Via environment variables
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...

# Via the configuration endpoint
curl -X PUT http://localhost:8460/api/config \
  -H "Content-Type: application/json" \
  -d '{"openai_api_key": "sk-..."}'
```

---

## Error Handling

All errors follow a consistent format. The API uses standard HTTP status codes.

### Error Response Schema

```json
{
  "detail": "Human-readable error message"
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request succeeded |
| 400 | Bad Request | Invalid input, validation error |
| 404 | Not Found | Resource not found |
| 422 | Unprocessable Entity | Request body validation failed |
| 500 | Internal Server Error | Unexpected server error |
| 502 | Bad Gateway | Upstream service error (scraper) |
| 503 | Service Unavailable | Health check indicates degraded services |

### Validation Error Example

```json
{
  "detail": "Configuration update failed: No fields provided for update."
}
```

### Common Error Scenarios

| Scenario | Status | Example Detail |
|----------|--------|---------------|
| Missing required field | 422 | `"field required"` |
| Invalid game version | 400 | `"Game version must be 'poe1' or 'poe2'"` |
| Empty message | 422 | `"Message cannot be empty or only whitespace"` |
| Job not found | 404 | `"Job 'job-123' not found"` |
| Conversation not found | 404 | `"Conversation 'conv-123' not found"` |
| Scraper upstream failure | 502 | `"Failed to connect to poedb.tw"` |
| Service degraded | 503 | `"embeddings_status: error"` |

---

## Common Response Format

Most endpoints return responses in this format:

```json
{
  "success": true,
  "message": "Human-readable status message",
  ...
}
```

Paginated responses include:

```json
{
  "success": true,
  "data": [...],
  "total": 100,
  "message": "Results retrieved"
}
```

---

## Root

### GET /api/

Returns basic API information.

**Request:**
```bash
curl http://localhost:8460/api/
```

**Response (200):**
```json
{
  "message": "POE Knowledge Assistant API",
  "version": "1.0.0",
  "status": "operational"
}
```

---

## Health Check

### GET /api/health

Returns the health status of all services.

**Request:**
```bash
curl http://localhost:8460/api/health
```

**Response (200 - Healthy):**
```json
{
  "status": "healthy",
  "chromadb_status": "connected",
  "embeddings_status": "ready",
  "vectorstore_status": "ready",
  "version": "1.0.0",
  "chromadb_message": "ChromaDB is connected",
  "embeddings_message": "Local embeddings ready",
  "vectorstore_message": "Vector store ready",
  "timestamp": "2024-01-15T10:30:00+00:00"
}
```

**Response (503 - Degraded):**
```json
{
  "status": "degraded",
  "chromadb_status": "disconnected",
  "embeddings_status": "error",
  "vectorstore_status": "error",
  "version": "1.0.0",
  "chromadb_message": "ChromaDB connection failed",
  "embeddings_message": "Embeddings not initialized",
  "vectorstore_message": "Vector store not ready",
  "timestamp": "2024-01-15T10:30:00+00:00"
}
```

| Field | Type | Description |
|-------|------|-------------|
| status | string | `"healthy"` or `"degraded"` |
| chromadb_status | string | `"connected"` or `"disconnected"` |
| embeddings_status | string | `"ready"` or `"error"` |
| vectorstore_status | string | `"ready"` or `"error"` |
| version | string | Application version |
| timestamp | string | ISO 8601 timestamp |

---

## Configuration

### GET /api/config

Get the current application configuration with sensitive data masked.

**Request:**
```bash
curl http://localhost:8460/api/config
```

**Response (200):**
```json
{
  "app_name": "POE Knowledge Assistant",
  "app_version": "1.0.0",
  "environment": "development",
  "server": {
    "host": "0.0.0.0",
    "port": 8000,
    "debug": true,
    "workers": 1
  },
  "database": {
    "database_url": "sqlite:///./data/poe_knowledge.db",
    "pool_size": 5,
    "max_overflow": 10
  },
  "chromadb": {
    "persist_directory": "./data/chroma",
    "collection_name": "poe_knowledge"
  },
  "rag": {
    "top_k_results": 3,
    "chunk_size": 1000,
    "chunk_overlap": 200,
    "score_threshold": 0.7
  },
  "cors": {
    "origins": ["http://localhost:3000", "http://localhost:5173"],
    "allow_credentials": true,
    "allow_methods": ["*"],
    "allow_headers": ["*"]
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4",
    "temperature": 0.7,
    "max_tokens": 2000,
    "api_key_set": false
  },
  "embedding": {
    "provider": "local",
    "model": "all-MiniLM-L6-v2",
    "dimension": 384,
    "batch_size": 32
  },
  "scraper": {
    "rate_limit_delay": 2.0,
    "max_retries": 3,
    "timeout": 30,
    "concurrent_requests": 5
  }
}
```

### PUT /api/config

Update application configuration at runtime. Only provided fields are modified.

**Hot-reloadable settings (no restart required):**
- LLM provider, model, temperature, max_tokens
- API keys (OpenAI, Anthropic)
- Embedding provider, model
- RAG parameters (top_k, score_threshold, chunk_size, chunk_overlap)
- Ollama / LM Studio base URLs

**Request:**
```bash
curl -X PUT http://localhost:8460/api/config \
  -H "Content-Type: application/json" \
  -d '{
    "llm_provider": "anthropic",
    "llm_model": "claude-3-sonnet-20240229",
    "anthropic_api_key": "sk-ant-...",
    "rag_top_k": 5
  }'
```

**Request Schema:**

| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| llm_provider | string | enum: openai, anthropic, ollama, lmstudio | LLM provider |
| llm_model | string | nullable | Model name |
| llm_temperature | float | 0.0-2.0, nullable | Temperature |
| llm_max_tokens | int | 1-32000, nullable | Max tokens |
| openai_api_key | string | min 8 chars, nullable | OpenAI key (never returned) |
| anthropic_api_key | string | min 8 chars, nullable | Anthropic key (never returned) |
| embedding_provider | string | enum: local, ollama, lmstudio, openai | Embedding provider |
| embedding_model | string | nullable | Embedding model name |
| openai_embedding_api_key | string | min 8 chars, nullable | OpenAI embedding key |
| rag_top_k | int | 1-20, nullable | Number of docs to retrieve |
| rag_score_threshold | float | 0.0-1.0, nullable | Min similarity score |
| rag_chunk_size | int | 100-4000, nullable | Chunk size in chars |
| rag_chunk_overlap | int | 0-1000, nullable | Overlap in chars |
| ollama_base_url | string | nullable | Ollama URL |
| lmstudio_base_url | string | nullable | LM Studio URL |

**Response (200):**
```json
{
  "success": true,
  "message": "Configuration updated successfully. 3 field(s) changed.",
  "updated_fields": ["llm_provider", "llm_model", "anthropic_api_key"],
  "requires_restart": false,
  "config": { ... }
}
```

---

## Chat

### POST /api/chat

Main chat endpoint. Accepts a question and returns a streaming SSE response with citations.

**Request:**
```bash
curl -X POST http://localhost:8460/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What are the best skills for a Witch in PoE2?",
    "game_version": "poe2",
    "build_context": "Witch - Blood Mage",
    "conversation_id": "conv-abc123"
  }'
```

**Request Schema:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| question | string | Yes | - | User question (1-10000 chars) |
| game_version | string | No | `"poe2"` | Game version: `poe1` or `poe2` |
| build_context | string | No | null | Build context (max 500 chars) |
| conversation_id | string | No | null | Conversation ID for context |
| conversation_history | array | No | null | Previous messages `[{role, content}]` |

**Response:** SSE stream (see [Streaming (SSE)](#streaming-sse))

### POST /api/chat/stream

Alternative streaming endpoint with identical SSE behavior.

**Request:**
```bash
curl -X POST http://localhost:8460/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Tell me about Fireball skill",
    "game_version": "poe2"
  }'
```

**Request Schema:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| message | string | Yes | - | User message (1-10000 chars) |
| game_version | string | No | `"poe2"` | Game version: `poe1` or `poe2` |
| build_context | string | No | null | Build context (max 500 chars) |
| conversation_id | string | No | null | Conversation ID |
| conversation_history | array | No | null | Previous messages |

### GET /api/chat/stream/health

Health check for the streaming service.

**Response (200):**
```json
{
  "success": true,
  "status": "ready",
  "message": "Streaming service is ready"
}
```

---

## Chat History

### GET /api/chat/history/stats

Get conversation store statistics.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total_conversations": 5,
    "total_messages": 23,
    "max_conversations": 100,
    "max_messages_per_conversation": 50
  },
  "message": "Conversation store statistics retrieved"
}
```

### GET /api/chat/history

List all stored conversations.

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "conversation_id": "conv-abc123",
      "message_count": 4,
      "created_at": "2024-01-15T10:00:00",
      "updated_at": "2024-01-15T10:30:00",
      "game_version": "poe2",
      "build_context": "Witch - Blood Mage"
    }
  ],
  "total": 1,
  "message": "Conversations retrieved successfully"
}
```

### GET /api/chat/history/{conversation_id}

Get full conversation history by ID.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "conversation_id": "conv-abc123",
    "messages": [
      {
        "role": "user",
        "content": "What are the best skills for Witch?",
        "timestamp": "2024-01-15T10:00:00",
        "metadata": null
      },
      {
        "role": "assistant",
        "content": "Based on the current meta...",
        "timestamp": "2024-01-15T10:00:05",
        "metadata": {"sources_count": 3}
      }
    ],
    "created_at": "2024-01-15T10:00:00",
    "updated_at": "2024-01-15T10:00:05",
    "game_version": "poe2",
    "build_context": "Witch - Blood Mage",
    "message_count": 2
  },
  "message": "Conversation history retrieved successfully"
}
```

**Response (404):**
```json
{
  "detail": "Conversation 'conv-nonexistent' not found"
}
```

### DELETE /api/chat/history/{conversation_id}

Delete a conversation and all its messages.

**Response (200):**
```json
{
  "success": true,
  "message": "Conversation 'conv-abc123' deleted successfully"
}
```

**Response (404):**
```json
{
  "detail": "Conversation 'conv-nonexistent' not found"
}
```

---

## Streaming (SSE)

Chat responses are delivered via Server-Sent Events (SSE). The response content type is `text/event-stream`.

### SSE Event Format

Each event follows this format:

```
event: <event_type>
data: <json_payload>

```

### Event Types

| Event | Description | Payload |
|-------|-------------|---------|
| `sources` | Retrieved source citations (sent first) | `{sources, conversation_id, document_count}` |
| `token` | Each token/chunk of the LLM response | `{token, chunk_index}` |
| `done` | Stream completed successfully | `{conversation_id, game, total_chunks, timestamp}` |
| `error` | Error occurred during streaming | `{error, code}` |
| `partial_complete` | Stream interrupted with partial content | `{conversation_id, partial_content}` |

### Example SSE Stream

```
event: sources
data: {"sources": [{"content": "The Blood Mage ascendancy focuses on...", "source": "https://poedb.tw/us/Blood_Mage", "relevance_score": 0.92}], "conversation_id": "conv-abc", "document_count": 3}

event: token
data: {"token": "Based", "chunk_index": 1}

event: token
data: {"token": " on", "chunk_index": 2}

event: token
data: {"token": " the", "chunk_index": 3}

event: done
data: {"conversation_id": "conv-abc", "game": "poe2", "total_chunks": 42, "timestamp": "2024-01-15T10:30:05"}
```

### Consuming SSE in JavaScript

```javascript
const response = await fetch('http://localhost:8460/api/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    message: 'What are the best Witch builds?',
    game_version: 'poe2'
  })
});

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';

while (true) {
  const { done, value } = await reader.read();
  if (done) break;

  buffer += decoder.decode(value, { stream: true });
  const lines = buffer.split('\n');
  buffer = lines.pop() || '';

  for (const line of lines) {
    if (line.startsWith('event:')) {
      currentEvent = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      const data = JSON.parse(line.slice(5).trim());
      switch (currentEvent) {
        case 'sources': handleSources(data); break;
        case 'token': handleToken(data); break;
        case 'done': handleDone(data); break;
        case 'error': handleError(data); break;
      }
    }
  }
}
```

### Consuming SSE with EventSource (GET only)

Note: The chat endpoints use POST, so EventSource cannot be used directly. Use `fetch` + `ReadableStream` as shown above.

### Consuming SSE in Python

```python
import requests
import json

url = "http://localhost:8460/api/chat/stream"
payload = {
    "message": "What are the best Witch builds?",
    "game_version": "poe2"
}

response = requests.post(url, json=payload, stream=True)
response.raise_for_status()

for line in response.iter_lines():
    line = line.decode('utf-8')
    if line.startswith('event:'):
        event_type = line[6:].strip()
    elif line.startswith('data:'):
        data = json.loads(line[5:].strip())
        if event_type == 'sources':
            print(f"Got {data['document_count']} sources")
        elif event_type == 'token':
            print(data['token'], end='', flush=True)
        elif event_type == 'done':
            print(f"\nDone! {data['total_chunks']} chunks")
        elif event_type == 'error':
            print(f"Error: {data['error']}")
```

---

## Jobs

The job manager handles asynchronous scraping operations with priority queuing, rate limiting, and concurrency control.

### GET /api/jobs/health

Job manager health check.

**Response (200):**
```json
{
  "success": true,
  "status": "healthy",
  "message": "Job manager is running"
}
```

### GET /api/jobs/stats

Get comprehensive job statistics.

**Response (200):**
```json
{
  "success": true,
  "queue_size": 5,
  "running_jobs": 2,
  "completed_count": 15,
  "failed_count": 1,
  "max_concurrent_jobs": 3,
  "rate_limiter": {
    "requests_per_minute": 30,
    "current_usage": 5
  },
  "job_timeout_seconds": 300
}
```

### POST /api/jobs/add

Add a new scraping job to the queue.

**Request:**
```bash
curl -X POST http://localhost:8460/api/jobs/add \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Scrape Unique Weapons",
    "job_type": "category",
    "url": "https://poedb.tw/us/Unique_Weapon",
    "priority": 5,
    "game": "poe1",
    "category": "Unique Weapon"
  }'
```

**Request Schema:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| name | string | Yes | - | Job name (1-200 chars) |
| job_type | string | No | `"category"` | `category`, `item_detail`, `batch_items`, `full_category` |
| url | string | No | null | Target URL |
| priority | int | No | 5 | 1=critical, 3=high, 5=normal, 7=low, 10=background |
| max_retries | int | No | null | Max retries (0-10) |
| metadata | object | No | null | Additional metadata |
| urls | array | No | null | URLs for batch jobs (max 500) |
| game | string | No | null | Game version: `poe1` or `poe2` |
| category | string | No | null | Category name (max 200 chars) |

**Response (200):**
```json
{
  "success": true,
  "job_id": "job-category-abc123",
  "status": "pending",
  "message": "Job added to queue"
}
```

### GET /api/jobs/{job_id}

Get the status of a specific job.

**Response (200):**
```json
{
  "success": true,
  "job_id": "job-category-abc123",
  "status": "completed",
  "name": "Scrape Unique Weapons",
  "progress": 100.0,
  "result": { "items_scraped": 45 }
}
```

**Response (404):**
```json
{
  "detail": "Job 'job-nonexistent' not found"
}
```

### POST /api/jobs/list

List jobs with optional filters and pagination.

**Request:**
```json
{
  "status": "completed",
  "job_type": "category",
  "limit": 50,
  "offset": 0
}
```

### POST /api/jobs/{job_id}/cancel

Cancel a pending or running job.

### POST /api/jobs/start

Start the job processing loop.

### POST /api/jobs/stop

Stop job processing gracefully.

### POST /api/jobs/clear

Clear completed, failed, and cancelled jobs from history.

### GET /api/jobs/config/info

Get job manager configuration, supported job types and statuses.

**Response (200):**
```json
{
  "success": true,
  "config": {
    "max_concurrent_jobs": 3,
    "rate_limiter": { "requests_per_minute": 30 },
    "job_timeout_seconds": 300
  },
  "supported_job_types": ["category", "item_detail", "batch_items", "full_category"],
  "supported_statuses": ["pending", "running", "completed", "failed", "cancelled"],
  "priority_levels": {
    "critical": 1,
    "high": 3,
    "normal": 5,
    "low": 7,
    "background": 10
  }
}
```

---

## Scraper

### GET /api/test/scraper/health

Verify connectivity to poedb.tw.

### POST /api/test/scraper/fetch

Fetch a single page synchronously.

```bash
curl -X POST http://localhost:8460/api/test/scraper/fetch \
  -H "Content-Type: application/json" \
  -d '{"path": "/us/Unique_Weapon"}'
```

### POST /api/test/scraper/fetch-async

Fetch a page asynchronously with structured response.

### GET /api/test/scraper/config

Get scraper configuration.

### GET /api/test/scraper/modules

List all scraper sub-modules and exports.

### POST /api/test/scraper/parse

Fetch and parse a page with DOM extraction.

### POST /api/test/scraper/category

Scrape a category index page.

```bash
curl -X POST http://localhost:8460/api/test/scraper/category \
  -H "Content-Type: application/json" \
  -d '{
    "category_name": "Unique Weapon",
    "url": "https://poedb.tw/us/Unique_Weapon",
    "follow_pagination": true,
    "max_pages": 10
  }'
```

### GET /api/test/scraper/category/categories

List known poedb.tw categories.

### POST /api/test/scraper/item

Scrape a single item detail page.

```bash
curl -X POST http://localhost:8460/api/test/scraper/item \
  -H "Content-Type: application/json" \
  -d '{"url": "https://poedb.tw/us/Tabula_Rasa", "category": "Unique Body Armour"}'
```

### POST /api/test/scraper/item/batch

Scrape multiple item detail pages (max 50).

### GET /api/test/scraper/item/examples

List example item URLs for testing.

### POST /api/test/scraper/game-version

Detect whether a URL belongs to PoE1 or PoE2.

### POST /api/test/scraper/game-version/batch

Detect game versions for multiple URLs.

---

## Scrape Timestamps

### GET /api/scrape-timestamps/health

Timestamp storage health check.

### GET /api/scrape-timestamps

Get last scrape timestamps for all games.

**Response (200):**
```json
{
  "success": true,
  "timestamps": {
    "poe1": {
      "last_scraped_at": "2024-01-15T10:00:00",
      "items_scraped": 150,
      "categories_scraped": 12
    },
    "poe2": {
      "last_scraped_at": null,
      "items_scraped": 0,
      "categories_scraped": 0
    }
  },
  "message": "Scrape timestamps retrieved successfully"
}
```

### GET /api/scrape-timestamps/{game}

Get timestamp for a specific game (`poe1` or `poe2`).

### POST /api/scrape-timestamps/update

Manually update a scrape timestamp.

### POST /api/scrape-timestamps/reset

Reset timestamps for a game or all games.

---

## Data Freshness

### GET /api/freshness

Get data freshness information with staleness warnings.

**Response (200):**
```json
{
  "success": true,
  "freshness": {
    "poe1": {
      "game": "poe1",
      "last_scraped_at": "2024-01-15T10:00:00",
      "relative_time": "2 hours ago",
      "is_stale": false,
      "staleness_warning": null,
      "has_data": true,
      "items_scraped": 150,
      "categories_scraped": 12
    },
    "poe2": {
      "game": "poe2",
      "last_scraped_at": null,
      "relative_time": null,
      "is_stale": false,
      "staleness_warning": null,
      "has_data": false,
      "items_scraped": 0,
      "categories_scraped": 0
    }
  },
  "summary": {
    "any_stale": false,
    "any_data_available": true,
    "staleness_threshold_days": 30
  },
  "message": "Data freshness retrieved successfully"
}
```

**Staleness Warning Example:**
```json
{
  "is_stale": true,
  "staleness_warning": "Data for POE1 is more than 30 days old. Consider running a new scrape to update the knowledge base."
}
```

---

## Admin

### POST /api/admin/scrape

Trigger a scraping operation for one or both games.

**Request:**
```bash
curl -X POST http://localhost:8460/api/admin/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "game": "poe1",
    "depth": "shallow"
  }'
```

| Parameter | Values | Description |
|-----------|--------|-------------|
| game | `poe1`, `poe2`, null | Game to scrape (null = both) |
| depth | `shallow`, `deep` | shallow = categories only, deep = categories + items |

**Response (200):**
```json
{
  "success": true,
  "job_ids": ["job-cat-001", "job-cat-002", "..."],
  "games": ["poe1"],
  "depth": "shallow",
  "total_jobs": 12,
  "status": "started",
  "message": "Scraping triggered for POE1 with shallow depth. 12 jobs created."
}
```

### GET /api/admin/scrape/status?job_id={id}

Get the status of a scrape job.

**Response (200):**
```json
{
  "success": true,
  "job_id": "job-category-abc123",
  "status": "running",
  "name": "Shallow scrape: Unique Weapon (POE1)",
  "job_type": "category",
  "game": "poe1",
  "category": "Unique Weapon",
  "pages_scraped": 3,
  "documents_indexed": 45,
  "progress": 75.0,
  "message": "Job is currently running (75.0% complete)"
}
```

---

## Indexer

### GET /api/test/indexer/health

ChromaDB indexer health check.

### GET /api/test/indexer/stats

Get indexing statistics.

### POST /api/test/indexer/index

Index items into ChromaDB.

```bash
curl -X POST http://localhost:8460/api/test/indexer/index \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {
        "name": "Tabula Rasa",
        "item_type": "armor",
        "url": "https://poedb.tw/us/Tabula_Rasa",
        "game": "poe1",
        "description": "Simple Robe with 6 linked white sockets"
      }
    ],
    "upsert": true
  }'
```

### POST /api/test/indexer/index-samples

Generate and index sample items for testing.

```bash
curl -X POST http://localhost:8460/api/test/indexer/index-samples \
  -H "Content-Type: application/json" \
  -d '{"game": "poe2", "count": 5}'
```

### POST /api/test/indexer/delete

Delete indexed items by URL.

### POST /api/test/indexer/search

Search indexed items with optional game filter.

---

## SDK / Client Examples

### JavaScript/TypeScript Client

The project includes a built-in API client at `frontend/src/lib/api-client.ts`.

```typescript
import {
  fetchRoot,
  fetchHealth,
  fetchConfig,
  updateConfig,
  streamChat,
  setApiKey,
} from '@/lib/api-client';

// Set API key (optional)
setApiKey('your-api-key');

// Health check
const health = await fetchHealth();
console.log(health.status); // "healthy" or "degraded"

// Get config
const config = await fetchConfig();
console.log(config.llm.provider); // "openai"

// Update config
const result = await updateConfig({
  llm_provider: 'anthropic',
  llm_model: 'claude-3-sonnet-20240229',
});

// Stream chat
await streamChat(
  {
    message: 'What are the best Witch builds?',
    game_version: 'poe2',
    build_context: 'Witch - Blood Mage',
  },
  {
    onSources: (e) => console.log('Sources:', e.sources),
    onToken: (e) => process.stdout.write(e.token),
    onDone: (e) => console.log('\nDone!', e.total_chunks),
    onError: (e) => console.error('Error:', e.error),
  }
);
```

### Python Client (requests)

```python
import requests
import json

BASE_URL = "http://localhost:8460/api"

def get_health():
    response = requests.get(f"{BASE_URL}/health")
    return response.json()

def get_config():
    response = requests.get(f"{BASE_URL}/config")
    return response.json()

def update_config(updates: dict):
    response = requests.put(f"{BASE_URL}/config", json=updates)
    response.raise_for_status()
    return response.json()

def chat_stream(question: str, game_version: str = "poe2"):
    response = requests.post(
        f"{BASE_URL}/chat",
        json={"question": question, "game_version": game_version},
        stream=True
    )
    response.raise_for_status()

    full_text = ""
    event_type = ""
    for line in response.iter_lines():
        line = line.decode("utf-8")
        if line.startswith("event:"):
            event_type = line[6:].strip()
        elif line.startswith("data:"):
            data = json.loads(line[5:].strip())
            if event_type == "token":
                full_text += data["token"]
            elif event_type == "sources":
                print(f"Retrieved {data['document_count']} sources")
            elif event_type == "done":
                return full_text, data
            elif event_type == "error":
                raise Exception(data["error"])
    return full_text, {}

def trigger_scrape(game: str = None, depth: str = "shallow"):
    response = requests.post(
        f"{BASE_URL}/admin/scrape",
        json={"game": game, "depth": depth}
    )
    response.raise_for_status()
    return response.json()

# Usage
health = get_health()
print(f"Status: {health['status']}")

text, meta = chat_stream("What are the best builds for Witch?")
print(text)
```

### cURL Examples

```bash
# Health check
curl http://localhost:8460/api/health

# Get configuration
curl http://localhost:8460/api/config | jq .

# Update LLM provider
curl -X PUT http://localhost:8460/api/config \
  -H "Content-Type: application/json" \
  -d '{"llm_provider": "ollama", "llm_model": "llama2"}'

# Chat with streaming
curl -N -X POST http://localhost:8460/api/chat \
  -H "Content-Type: application/json" \
  -d '{"question": "What is Tabula Rasa?", "game_version": "poe1"}'

# List conversations
curl http://localhost:8460/api/chat/history

# Get conversation
curl http://localhost:8460/api/chat/history/conv-abc123

# Delete conversation
curl -X DELETE http://localhost:8460/api/chat/history/conv-abc123

# Trigger scrape
curl -X POST http://localhost:8460/api/admin/scrape \
  -H "Content-Type: application/json" \
  -d '{"game": "poe1", "depth": "shallow"}'

# Check scrape status
curl "http://localhost:8460/api/admin/scrape/status?job_id=job-category-abc123"

# Get data freshness
curl http://localhost:8460/api/freshness | jq .

# Add a scraping job
curl -X POST http://localhost:8460/api/jobs/add \
  -H "Content-Type: application/json" \
  -d '{"name": "Test scrape", "job_type": "category", "url": "https://poedb.tw/us/Gem"}'

# Get job status
curl http://localhost:8460/api/jobs/job-category-abc123

# List jobs
curl -X POST http://localhost:8460/api/jobs/list \
  -H "Content-Type: application/json" \
  -d '{"status": "completed", "limit": 10}'

# Index sample items
curl -X POST http://localhost:8460/api/test/indexer/index-samples \
  -H "Content-Type: application/json" \
  -d '{"game": "poe2", "count": 5}'

# Search indexed items
curl -X POST http://localhost:8460/api/test/indexer/search \
  -H "Content-Type: application/json" \
  -d '{"query": "unique body armour", "game": "poe1", "k": 5}'
```

---

## Postman Collection

A Postman-compatible collection is available at `docs/api/postman-collection.json`. Import it into Postman to explore all endpoints interactively.

### Environment Variables

Set these variables in your Postman environment:

| Variable | Value | Description |
|----------|-------|-------------|
| `base_url` | `http://localhost:8460/api` | API base URL |
| `api_key` | (optional) | API key for authentication |
