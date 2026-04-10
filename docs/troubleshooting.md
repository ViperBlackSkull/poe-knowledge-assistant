# Troubleshooting Guide

Common issues and solutions for the PoE Knowledge Assistant.

## Table of Contents

1. [Backend Issues](#backend-issues)
2. [Frontend Issues](#frontend-issues)
3. [Database Issues](#database-issues)
4. [LLM Provider Issues](#llm-provider-issues)
5. [Embedding Issues](#embedding-issues)
6. [Docker Issues](#docker-issues)
7. [Nginx Issues](#nginx-issues)
8. [Performance Issues](#performance-issues)
9. [Scraping Issues](#scraping-issues)

---

## Backend Issues

### Backend Won't Start

**Symptom:** `uvicorn` command fails or exits immediately.

**Solutions:**

1. Verify Python version:
   ```bash
   python3 --version  # Should be 3.10+
   ```

2. Verify virtual environment is activated:
   ```bash
   which python  # Should point to backend/venv/bin/python
   ```

3. Reinstall dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Check for syntax errors:
   ```bash
   python -c "from src.main import app; print('OK')"
   ```

5. Check for port conflicts:
   ```bash
   lsof -i :8460
   # or
   ss -tlnp | grep 8460
   ```

### Module Import Errors

**Symptom:** `ModuleNotFoundError: No module named 'src'`

**Solutions:**

1. Ensure you are in the `backend/` directory:
   ```bash
   cd backend
   uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
   ```

2. Check `PYTHONPATH`:
   ```bash
   export PYTHONPATH="${PYTHONPATH}:/path/to/backend"
   ```

3. Verify the virtual environment has all packages:
   ```bash
   pip list | grep fastapi
   pip list | grep chromadb
   ```

### Environment Variable Issues

**Symptom:** Config values are not being read or defaulting incorrectly.

**Solutions:**

1. Verify `.env` file exists:
   ```bash
   ls -la backend/.env
   ```

2. Check for common `.env` mistakes:
   ```bash
   # WRONG - no spaces around =
   PROVIDER = openai

   # CORRECT
   PROVIDER=openai

   # WRONG - quoted when not needed
   API_PORT="8460"

   # CORRECT
   API_PORT=8460
   ```

3. Verify specific settings:
   ```bash
   cd backend
   source venv/bin/activate
   python -c "from src.config import get_settings; s = get_settings(); print(f'Provider: {s.provider}, Port: {s.api_port}')"
   ```

### Health Check Returns 503

**Symptom:** `/api/health` returns status 503 with "degraded" status.

**Solutions:**

1. Check which subsystem is failing:
   ```bash
   curl -s http://localhost:8460/api/health | python3 -m json.tool
   ```

2. Check ChromaDB:
   ```bash
   curl -s http://localhost:8460/api/test/vectorstore/health | python3 -m json.tool
   ```

3. Check embeddings:
   ```bash
   # Ensure the embedding model can be loaded
   python -c "from sentence_transformers import SentenceTransformer; m = SentenceTransformer('all-MiniLM-L6-v2'); print('OK')"
   ```

4. Verify ChromaDB data directory exists and has correct permissions:
   ```bash
   ls -la backend/data/chroma/
   ```

---

## Frontend Issues

### npm install Fails

**Symptom:** Errors during `npm install`.

**Solutions:**

1. Clear npm cache:
   ```bash
   npm cache clean --force
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Check Node.js version:
   ```bash
   node --version  # Should be 18+
   npm --version   # Should be 9+
   ```

3. If behind a proxy:
   ```bash
   npm config set proxy http://proxy:port
   npm config set https-proxy http://proxy:port
   ```

### Build Fails with TypeScript Errors

**Symptom:** `npm run build` shows TypeScript errors.

**Solutions:**

1. Run type check to see specific errors:
   ```bash
   npm run type-check
   ```

2. Ensure all type definitions are installed:
   ```bash
   npm install --save-dev @types/react @types/react-dom
   ```

### Frontend Shows Blank Page

**Symptom:** Browser shows a blank white page.

**Solutions:**

1. Open browser developer tools (F12) and check the Console for errors.

2. Verify the API proxy is working:
   ```bash
   # Check if the backend is running
   curl http://localhost:8460/api/health

   # Check if the proxy is configured in vite.config.ts
   cat frontend/vite.config.ts
   ```

3. Verify `VITE_API_BASE_URL` in `frontend/.env`:
   ```bash
   cat frontend/.env
   # Should contain: VITE_API_BASE_URL=/api
   ```

### API Proxy Not Working (Development)

**Symptom:** Frontend requests to `/api/*` return 404 or connection refused.

**Solutions:**

1. Verify Vite proxy configuration in `vite.config.ts`:
   ```typescript
   server: {
     port: 9460,
     proxy: {
       '/api': {
         target: 'http://localhost:8460',
         changeOrigin: true,
       },
     },
   }
   ```

2. Ensure the backend is running on port 8460:
   ```bash
   curl http://localhost:8460/api/health
   ```

3. Restart the Vite dev server after changing config.

### CORS Errors in Browser Console

**Symptom:** "Access-Control-Allow-Origin" errors in browser console.

**Solutions:**

1. Check backend CORS settings in `.env`:
   ```ini
   CORS_ORIGINS=http://localhost:9460
   ```

2. Restart the backend after changing `.env`.

3. For production, ensure the actual domain is listed:
   ```ini
   CORS_ORIGINS=https://yourdomain.com
   ```

---

## Database Issues

### SQLite Database Locked

**Symptom:** "database is locked" errors.

**Solutions:**

1. Reduce concurrent access:
   ```ini
   DATABASE_POOL_SIZE=1
   DATABASE_MAX_OVERFLOW=0
   ```

2. For production, switch to PostgreSQL:
   ```ini
   DATABASE_URL=postgresql://user:password@localhost:5432/poe_knowledge
   ```

3. Check for stale lock files:
   ```bash
   ls -la backend/data/*.db-journal
   rm backend/data/*.db-journal
   ```

### PostgreSQL Connection Refused

**Symptom:** "could not connect to server: Connection refused"

**Solutions:**

1. Verify PostgreSQL is running:
   ```bash
   sudo systemctl status postgresql
   ```

2. Check connection parameters:
   ```bash
   psql -U poe_user -d poe_knowledge -h localhost -p 5432
   ```

3. Verify `pg_hba.conf` allows password authentication:
   ```bash
   sudo vi /etc/postgresql/15/main/pg_hba.conf
   # Should have:
   # host    poe_knowledge    poe_user    127.0.0.1/32    md5
   ```

4. Restart PostgreSQL after config changes:
   ```bash
   sudo systemctl restart postgresql
   ```

### ChromaDB Issues

**Symptom:** ChromaDB errors, collection not found, or data corruption.

**Solutions:**

1. Check ChromaDB data directory:
   ```bash
   ls -la backend/data/chroma/
   ```

2. Reset ChromaDB (warning: deletes all indexed data):
   ```bash
   rm -rf backend/data/chroma/*
   # Restart the backend - it will create a fresh database
   ```

3. Verify ChromaDB version compatibility:
   ```bash
   pip show chromadb
   # Should be 0.4.22
   ```

---

## LLM Provider Issues

### OpenAI API Errors

**Symptom:** "Invalid API Key" or "Rate limit exceeded".

**Solutions:**

1. Verify API key format:
   ```bash
   # Should start with sk-
   echo $OPENAI_API_KEY | head -c 5
   ```

2. Test API key directly:
   ```bash
   curl https://api.openai.com/v1/models \
     -H "Authorization: Bearer $OPENAI_API_KEY"
   ```

3. Check rate limits and billing:
   - Visit [platform.openai.com/usage](https://platform.openai.com/usage)

4. Try a different model:
   ```ini
   OPENAI_MODEL=gpt-3.5-turbo  # Cheaper, faster
   ```

### Anthropic API Errors

**Symptom:** Authentication errors or model not found.

**Solutions:**

1. Verify API key is set:
   ```bash
   grep ANTHROPIC_API_KEY backend/.env
   ```

2. Check model name spelling:
   ```ini
   # Correct model names
   ANTHROPIC_MODEL=claude-3-sonnet-20240229
   ANTHROPIC_MODEL=claude-3-opus-20240229
   ANTHROPIC_MODEL=claude-3-haiku-20240307
   ```

### Ollama Connection Errors

**Symptom:** "Connection refused" to Ollama.

**Solutions:**

1. Verify Ollama is running:
   ```bash
   curl http://localhost:11434/api/tags
   ```

2. List available models:
   ```bash
   ollama list
   ```

3. Pull a model if not available:
   ```bash
   ollama pull llama2
   ```

4. Check Ollama URL in config:
   ```ini
   OLLAMA_BASE_URL=http://localhost:11434
   ```

### LM Studio Connection Errors

**Symptom:** Cannot connect to LM Studio server.

**Solutions:**

1. Ensure LM Studio is running with a model loaded.
2. Verify the server is started in LM Studio (Local Server tab).
3. Check the URL and port:
   ```ini
   LMSTUDIO_BASE_URL=http://localhost:1234
   ```

---

## Embedding Issues

### Model Download Fails

**Symptom:** Error downloading sentence-transformers model.

**Solutions:**

1. Pre-download the model:
   ```bash
   python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
   ```

2. If behind a proxy or firewall, set HuggingFace mirror:
   ```bash
   export HF_ENDPOINT=https://hf-mirror.com
   ```

3. Manually download and specify cache directory:
   ```bash
   export TRANSFORMERS_CACHE=/path/to/cache
   ```

### Out of Memory During Embedding

**Symptom:** OOM errors when processing large documents.

**Solutions:**

1. Reduce batch size:
   ```ini
   EMBEDDING_BATCH_SIZE=8
   ```

2. Use a smaller model:
   ```ini
   EMBEDDING_MODEL=all-MiniLM-L6-v2  # 384 dimensions, smaller memory footprint
   ```

3. Increase available memory or reduce number of workers.

---

## Docker Issues

### Container Won't Start

**Symptom:** Docker container exits immediately.

**Solutions:**

1. Check container logs:
   ```bash
   docker compose logs backend
   ```

2. Check if ports are already in use:
   ```bash
   ss -tlnp | grep 8460
   ```

3. Rebuild the container:
   ```bash
   docker compose build --no-cache backend
   docker compose up -d backend
   ```

### Container Health Check Failing

**Symptom:** Container shows "unhealthy" status.

**Solutions:**

1. Check health check details:
   ```bash
   docker inspect --format='{{json .State.Health}}' poe-backend | python3 -m json.tool
   ```

2. Check if the application started:
   ```bash
   docker compose exec backend curl -f http://localhost:8460/api/health
   ```

3. Increase health check startup period in `docker-compose.yml`:
   ```yaml
   healthcheck:
     start_period: 120s  # More time for startup
   ```

### Volume Permission Issues

**Symptom:** Permission denied writing to volumes.

**Solutions:**

1. Check volume ownership:
   ```bash
   docker compose exec backend ls -la /app/data/
   ```

2. Fix permissions:
   ```bash
   docker compose exec backend chown -R appuser:appuser /app/data
   ```

---

## Nginx Issues

### 502 Bad Gateway

**Symptom:** Nginx returns "502 Bad Gateway".

**Solutions:**

1. Verify the backend is running:
   ```bash
   curl http://127.0.0.1:8460/api/health
   ```

2. Check Nginx error log:
   ```bash
   sudo tail -50 /var/log/nginx/error.log
   ```

3. Verify upstream configuration:
   ```nginx
   upstream poe_backend {
       server 127.0.0.1:8460;
   }
   ```

4. Restart backend service:
   ```bash
   sudo systemctl restart poe-knowledge-backend
   ```

### 504 Gateway Timeout

**Symptom:** Requests timeout through Nginx.

**Solutions:**

1. Increase timeout values:
   ```nginx
   proxy_read_timeout 600s;
   proxy_send_timeout 600s;
   ```

2. Check if the backend is overloaded:
   ```bash
   top -p $(pgrep -f uvicorn)
   ```

### Static Files Not Found (404)

**Symptom:** Frontend returns 404 for JS/CSS files.

**Solutions:**

1. Verify the dist directory exists:
   ```bash
   ls -la /var/www/poe-knowledge/
   ```

2. Rebuild and redeploy:
   ```bash
   cd frontend
   npm run build
   sudo cp -r dist/* /var/www/poe-knowledge/
   ```

3. Check Nginx root directive:
   ```nginx
   root /var/www/poe-knowledge;
   ```

### SSE Streaming Not Working Through Nginx

**Symptom:** Chat streaming responses are buffered or delayed.

**Solutions:**

1. Add streaming-specific proxy settings:
   ```nginx
   location /api/chat/stream {
       proxy_pass http://poe_backend/api/chat/stream;
       proxy_buffering off;
       proxy_cache off;
       chunked_transfer_encoding on;
       proxy_read_timeout 600s;
   }
   ```

2. Ensure `proxy_buffering off` is set for all `/api/` locations.

---

## Performance Issues

### Slow API Responses

**Symptom:** API endpoints take several seconds to respond.

**Solutions:**

1. Check embedding model loading time:
   ```bash
   time python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"
   ```

2. Increase worker count:
   ```ini
   API_WORKERS=4
   ```

3. Check database query performance:
   ```ini
   LOG_LEVEL=DEBUG  # Temporarily to see query times
   ```

4. Monitor system resources:
   ```bash
   htop
   iotop
   ```

### High Memory Usage

**Symptom:** Backend process uses excessive memory.

**Solutions:**

1. Each worker loads its own embedding model. Reduce workers:
   ```ini
   API_WORKERS=2
   ```

2. Use a lighter embedding model:
   ```ini
   EMBEDDING_MODEL=all-MiniLM-L6-v2  # Smallest
   ```

3. Reduce ChromaDB cache by using smaller collections.

### Slow ChromaDB Queries

**Symptom:** Vector search queries are slow.

**Solutions:**

1. Check collection size:
   ```bash
   curl -s http://localhost:8460/api/test/indexer/health | python3 -m json.tool
   ```

2. Reduce `RAG_TOP_K_RESULTS`:
   ```ini
   RAG_TOP_K_RESULTS=3
   ```

3. Ensure ChromaDB data is on SSD storage.

---

## Scraping Issues

### Scraper Connection Errors

**Symptom:** Cannot connect to poedb.tw.

**Solutions:**

1. Check internet connectivity:
   ```bash
   curl -I https://poedb.tw
   ```

2. Increase timeout:
   ```ini
   SCRAPER_TIMEOUT=60
   ```

3. Check if IP is rate-limited:
   ```ini
   SCRAPER_RATE_LIMIT_DELAY=5.0  # Increase delay
   ```

### Scraper Returns Empty Results

**Symptom:** Scraped pages have no content.

**Solutions:**

1. The website may have changed its HTML structure.
2. Check scraper health endpoint for connectivity info.
3. Review the scraper selectors in the code.

---

## Getting Help

If you cannot resolve an issue with this guide:

1. Check the application logs for detailed error messages
2. Review the health check endpoint output for subsystem status
3. Search existing issues in the repository
4. Include the following information when reporting:
   - Application version (`APP_VERSION`)
   - Environment (`development` / `production`)
   - Backend logs (sanitized of API keys)
   - Health check response
   - Steps to reproduce
