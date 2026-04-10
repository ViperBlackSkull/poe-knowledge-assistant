# Environment Management

Complete reference for environment variables and configuration management in the PoE Knowledge Assistant.

## Configuration Methods

The application uses a layered configuration approach:

1. **Environment Variables** (highest priority) - set via `.env` file or system env vars
2. **Pydantic Settings** - validated configuration models with defaults
3. **Runtime Configuration API** - dynamic configuration updates via the API
4. **Hardcoded Defaults** (lowest priority) - fallback values in code

## Environment File Locations

| File                     | Location       | Purpose                          |
|--------------------------|----------------|----------------------------------|
| `.env.example`           | `backend/`     | Template with all options        |
| `.env`                   | `backend/`     | Active backend configuration     |
| `.env`                   | `frontend/`    | Frontend build configuration     |
| `.env.docker`            | project root   | Docker Compose secrets           |
| `.env.production`        | `frontend/`    | Production frontend build vars   |

## Complete Environment Variable Reference

### Section 1: Application Metadata

| Variable       | Required | Default                    | Description                    |
|----------------|----------|----------------------------|--------------------------------|
| `APP_NAME`     | No       | `POE Knowledge Assistant`  | Application display name       |
| `APP_VERSION`  | No       | `1.0.0`                    | Application version string     |
| `ENVIRONMENT`  | Yes      | `development`              | `development`, `testing`, or `production` |

### Section 2: Server Configuration

| Variable       | Required | Default    | Description                            |
|----------------|----------|------------|----------------------------------------|
| `API_HOST`     | No       | `0.0.0.0`  | Server bind address                    |
| `API_PORT`     | No       | `8000`     | Server port number (1-65535)           |
| `API_DEBUG`    | No       | `True`     | Enable debug mode. **Disable in production** |
| `API_RELOAD`   | No       | `True`     | Auto-reload on code changes. **Disable in production** |
| `API_WORKERS`  | No       | `1`        | Number of worker processes             |

**Production recommendations:**
- `API_HOST=127.0.0.1` (behind reverse proxy)
- `API_DEBUG=False`
- `API_RELOAD=False`
- `API_WORKERS=4` (or CPU cores * 2 + 1)

### Section 3: Database Configuration

| Variable               | Required | Default                         | Description                  |
|------------------------|----------|---------------------------------|------------------------------|
| `DATABASE_URL`         | Yes      | `sqlite:///./data/poe_knowledge.db` | Database connection URL  |
| `DATABASE_POOL_SIZE`   | No       | `5`                             | Connection pool size         |
| `DATABASE_MAX_OVERFLOW`| No       | `10`                            | Max overflow connections     |

**Development:**
```ini
DATABASE_URL=sqlite:///./data/poe_knowledge.db
```

**Production (PostgreSQL):**
```ini
DATABASE_URL=postgresql://user:password@localhost:5432/poe_knowledge
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

### Section 4: Vector Database (ChromaDB)

| Variable                   | Required | Default              | Description                  |
|----------------------------|----------|----------------------|------------------------------|
| `CHROMA_PERSIST_DIRECTORY` | No       | `./data/chroma`      | Persistent storage directory |
| `CHROMA_COLLECTION_NAME`   | No       | `poe_knowledge`      | Collection name              |

### Section 5: LLM Provider Configuration

#### Provider Selection

| Variable    | Required | Default  | Description                                   |
|-------------|----------|----------|-----------------------------------------------|
| `PROVIDER`  | Yes      | `openai` | `openai`, `anthropic`, `ollama`, or `lmstudio` |

#### OpenAI Settings

| Variable              | Required | Default  | Description                         |
|-----------------------|----------|----------|-------------------------------------|
| `OPENAI_API_KEY`      | If OpenAI | -        | API key (starts with `sk-`)         |
| `OPENAI_MODEL`        | No       | `gpt-4`  | Model name                          |
| `OPENAI_TEMPERATURE`  | No       | `0.7`    | Response randomness (0.0-2.0)       |
| `OPENAI_MAX_TOKENS`   | No       | `2000`   | Max tokens in response              |

#### Anthropic Settings

| Variable                | Required | Default                    | Description                    |
|-------------------------|----------|----------------------------|--------------------------------|
| `ANTHROPIC_API_KEY`     | If Anthropic | -                      | API key                        |
| `ANTHROPIC_MODEL`       | No       | `claude-3-sonnet-20240229` | Model name                    |
| `ANTHROPIC_TEMPERATURE` | No       | `0.7`                      | Response randomness (0.0-1.0) |
| `ANTHROPIC_MAX_TOKENS`  | No       | `2000`                     | Max tokens in response         |

#### Ollama Settings

| Variable              | Required | Default                    | Description         |
|-----------------------|----------|----------------------------|---------------------|
| `OLLAMA_BASE_URL`     | No       | `http://localhost:11434`   | Ollama server URL   |
| `OLLAMA_MODEL`        | No       | `llama2`                   | Model name          |
| `OLLAMA_TEMPERATURE`  | No       | `0.7`                      | Response randomness |

#### LM Studio Settings

| Variable                | Required | Default                  | Description           |
|-------------------------|----------|--------------------------|-----------------------|
| `LMSTUDIO_BASE_URL`     | No       | `http://localhost:1234`  | LM Studio server URL  |
| `LMSTUDIO_MODEL`        | No       | `local-model`            | Model identifier      |
| `LMSTUDIO_TEMPERATURE`  | No       | `0.7`                    | Response randomness   |

### Section 6: Embedding Provider Configuration

| Variable                     | Required | Default              | Description                        |
|------------------------------|----------|----------------------|------------------------------------|
| `EMBEDDING_PROVIDER`         | Yes      | `local`              | `local`, `openai`, `ollama`, `lmstudio` |
| `EMBEDDING_MODEL`            | No       | `all-MiniLM-L6-v2`   | Embedding model name               |
| `EMBEDDING_EMBEDDING_DIMENSION` | No    | `384`                | Vector dimension (must match model)|
| `EMBEDDING_BATCH_SIZE`       | No       | `32`                 | Batch size for embedding generation|

#### OpenAI Embeddings

| Variable                          | Required | Default                  | Description            |
|-----------------------------------|----------|--------------------------|------------------------|
| `EMBEDDING_OPENAI_API_KEY`        | If OpenAI| -                        | API key for embeddings |
| `EMBEDDING_OPENAI_EMBEDDING_MODEL`| No       | `text-embedding-ada-002` | Embedding model        |

#### Ollama Embeddings

| Variable                          | Required | Default               | Description           |
|-----------------------------------|----------|-----------------------|-----------------------|
| `EMBEDDING_OLLAMA_BASE_URL`       | No       | `http://localhost:11434` | Server URL         |
| `EMBEDDING_OLLAMA_EMBEDDING_MODEL`| No       | `nomic-embed-text`    | Embedding model       |

#### LM Studio Embeddings

| Variable                            | Required | Default                  | Description       |
|-------------------------------------|----------|--------------------------|-------------------|
| `EMBEDDING_LMSTUDIO_BASE_URL`       | No       | `http://localhost:1234`  | Server URL        |

### Section 7: RAG Pipeline Settings

| Variable             | Required | Default | Description                          |
|----------------------|----------|---------|--------------------------------------|
| `RAG_TOP_K_RESULTS`  | No       | `3`     | Number of documents to retrieve (1-20)|
| `RAG_CHUNK_SIZE`     | No       | `1000`  | Document chunk size in characters    |
| `RAG_CHUNK_OVERLAP`  | No       | `200`   | Overlap between chunks               |
| `RAG_SCORE_THRESHOLD`| No       | `0.7`   | Minimum similarity score (0.0-1.0)   |

### Section 8: Scraper Settings

| Variable                    | Required | Default                                           | Description              |
|-----------------------------|----------|---------------------------------------------------|--------------------------|
| `SCRAPER_RATE_LIMIT_DELAY`  | No       | `2.0`                                             | Delay between requests (s)|
| `SCRAPER_MAX_RETRIES`       | No       | `3`                                               | Max retry attempts        |
| `SCRAPER_TIMEOUT`           | No       | `30`                                              | Request timeout (s)       |
| `SCRAPER_USER_AGENT`        | No       | `Mozilla/5.0 (compatible; POEKnowledgeBot/1.0)`   | HTTP user agent           |
| `SCRAPER_CONCURRENT_REQUESTS`| No      | `5`                                               | Max concurrent requests   |

### Section 9: CORS Settings

| Variable                | Required | Default                                  | Description              |
|-------------------------|----------|------------------------------------------|--------------------------|
| `CORS_ORIGINS`          | Yes      | `http://localhost:3000,http://localhost:5173` | Comma-separated origins |
| `CORS_ALLOW_CREDENTIALS`| No       | `True`                                   | Allow credentials        |
| `CORS_ALLOW_METHODS`    | No       | `*`                                      | Allowed HTTP methods     |
| `CORS_ALLOW_HEADERS`    | No       | `*`                                      | Allowed HTTP headers     |

**Production:**
```ini
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
```

### Section 10: Security Settings

| Variable                    | Required | Default                                    | Description               |
|-----------------------------|----------|--------------------------------------------|---------------------------|
| `SECRET_KEY`                | Yes      | `your-secret-key-change-in-production-please` | JWT encoding key       |
| `ALGORITHM`                 | No       | `HS256`                                    | JWT algorithm             |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| No      | `30`                                       | Token expiration (min)    |
| `API_KEY_HEADER`            | No       | `X-API-Key`                                | API key header name       |

**Generate a production SECRET_KEY:**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### Section 11: Logging Settings

| Variable           | Required | Default                                                  | Description          |
|--------------------|----------|----------------------------------------------------------|----------------------|
| `LOG_LEVEL`        | No       | `INFO`                                                   | `DEBUG`, `INFO`, `WARNING`, `ERROR`, `CRITICAL` |
| `LOG_FORMAT`       | No       | `%(asctime)s - %(name)s - %(levelname)s - %(message)s`   | Log format string    |
| `LOG_FILE_PATH`    | No       | (empty - console only)                                    | Log file path        |
| `LOG_MAX_BYTES`    | No       | `10485760` (10MB)                                         | Max log file size    |
| `LOG_BACKUP_COUNT` | No       | `5`                                                       | Number of backup logs|

## Frontend Environment Variables

| Variable             | File                | Default | Description                        |
|----------------------|---------------------|---------|------------------------------------|
| `VITE_API_BASE_URL`  | `frontend/.env`     | `/api`  | Backend API URL path               |

During development, `/api` is proxied by Vite to `http://localhost:8460`.

For production deployment with a separate API server:
```ini
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

## Environment-Specific Configurations

### Development

```ini
ENVIRONMENT=development
API_DEBUG=True
API_RELOAD=True
API_WORKERS=1
DATABASE_URL=sqlite:///./data/poe_knowledge.db
LOG_LEVEL=DEBUG
CORS_ORIGINS=http://localhost:3000,http://localhost:5173,http://localhost:9460
```

### Testing

```ini
ENVIRONMENT=testing
API_DEBUG=True
API_RELOAD=False
API_WORKERS=1
DATABASE_URL=sqlite:///./data/test_poe_knowledge.db
LOG_LEVEL=DEBUG
CHROMA_PERSIST_DIRECTORY=./data/test_chroma
CHROMA_COLLECTION_NAME=test_poe_knowledge
```

### Production

```ini
ENVIRONMENT=production
API_DEBUG=False
API_RELOAD=False
API_WORKERS=4
DATABASE_URL=postgresql://user:password@localhost:5432/poe_knowledge
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
LOG_LEVEL=WARNING
LOG_FILE_PATH=/var/log/poe-knowledge/app.log
CORS_ORIGINS=https://yourdomain.com
SECRET_KEY=<strong-random-key>
ACCESS_TOKEN_EXPIRE_MINUTES=15
```

## Runtime Configuration API

The application provides runtime configuration endpoints that allow changing settings without restarting:

- `GET /api/config` - Get current configuration
- `PUT /api/config` - Update configuration

```bash
# Get current config
curl http://localhost:8460/api/config

# Update a setting
curl -X PUT http://localhost:8460/api/config \
  -H "Content-Type: application/json" \
  -d '{"provider": "anthropic", "model": "claude-3-sonnet-20240229"}'
```

Note: Runtime changes are in-memory only and reset on application restart. For persistent changes, update the `.env` file.

## Security Best Practices

1. **Never commit `.env` files** - They are in `.gitignore` by default
2. **Restrict file permissions** - `chmod 600 backend/.env`
3. **Rotate API keys regularly** - Especially after any team member leaves
4. **Use different keys per environment** - Never share production keys with development
5. **Use strong SECRET_KEY** - Minimum 32 characters, randomly generated
6. **Restrict CORS origins** - Only list your actual domains in production
7. **Disable debug mode** - `API_DEBUG=False` in production
8. **Disable auto-reload** - `API_RELOAD=False` in production
9. **Use HTTPS** - All API keys are sent in headers; TLS is essential
10. **Set appropriate log level** - `WARNING` or `ERROR` in production to avoid logging sensitive data
