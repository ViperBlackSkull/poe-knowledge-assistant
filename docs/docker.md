# Docker Configuration

This guide covers deploying the PoE Knowledge Assistant using Docker and Docker Compose.

## Prerequisites

- Docker 20.10+
- Docker Compose v2+

```bash
# Verify Docker installation
docker --version
docker compose version
```

## Dockerfile for Backend

Create `backend/Dockerfile`:

```dockerfile
# ---- Stage 1: Build dependencies ----
FROM python:3.12-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

# ---- Stage 2: Production image ----
FROM python:3.12-slim

LABEL maintainer="PoE Knowledge Assistant"
LABEL description="FastAPI backend for PoE Knowledge Assistant"

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r appuser \
    && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY . .

# Create data directories
RUN mkdir -p /app/data/chroma && \
    chown -R appuser:appuser /app

# Switch to non-root user
USER appuser

# Expose port
EXPOSE 8460

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8460/api/health || exit 1

# Run with gunicorn for production
CMD ["gunicorn", "src.main:app", \
     "--workers", "4", \
     "--worker-class", "uvicorn.workers.UvicornWorker", \
     "--bind", "0.0.0.0:8460", \
     "--timeout", "120", \
     "--graceful-timeout", "30", \
     "--access-logfile", "-", \
     "--error-logfile", "-", \
     "--log-level", "info"]
```

## Dockerfile for Frontend

Create `frontend/Dockerfile`:

```dockerfile
# ---- Stage 1: Build the application ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy source code
COPY . .

# Build for production
RUN npm run build

# ---- Stage 2: Serve with Nginx ----
FROM nginx:1.25-alpine

LABEL maintainer="PoE Knowledge Assistant"
LABEL description="Frontend for PoE Knowledge Assistant served by Nginx"

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy built files from builder
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose port
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

## Frontend Nginx Config for Docker

Create `frontend/nginx.conf`:

```nginx
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss application/atom+xml image/svg+xml;

    # API proxy to backend container
    location /api/ {
        proxy_pass http://backend:8460/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support for streaming
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # WebSocket upgrade support
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }

    # Static files with cache headers
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

## Docker Compose Configuration

Create `docker-compose.yml` in the project root:

```yaml
version: "3.8"

services:
  # Backend API server
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: poe-backend
    restart: unless-stopped
    ports:
      - "8460:8460"
    env_file:
      - ./backend/.env
    environment:
      - ENVIRONMENT=production
      - API_HOST=0.0.0.0
      - API_PORT=8460
      - API_DEBUG=False
      - API_RELOAD=False
      - DATABASE_URL=postgresql://poe_user:${POSTGRES_PASSWORD}@postgres:5432/poe_knowledge
      - CHROMA_PERSIST_DIRECTORY=/app/data/chroma
    volumes:
      - backend-data:/app/data
      - backend-logs:/var/log/poe-knowledge
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - poe-network
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8460/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 60s

  # Frontend web server
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: poe-frontend
    restart: unless-stopped
    ports:
      - "80:80"
    depends_on:
      backend:
        condition: service_healthy
    networks:
      - poe-network
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost/"]
      interval: 30s
      timeout: 5s
      retries: 3

  # PostgreSQL database
  postgres:
    image: postgres:15-alpine
    container_name: poe-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: poe_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: poe_knowledge
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - poe-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U poe_user -d poe_knowledge"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres-data:
    driver: local
  backend-data:
    driver: local
  backend-logs:
    driver: local

networks:
  poe-network:
    driver: bridge
```

## Docker Compose for Development

Create `docker-compose.dev.yml`:

```yaml
version: "3.8"

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile.dev
    container_name: poe-backend-dev
    ports:
      - "8460:8460"
    env_file:
      - ./backend/.env
    environment:
      - ENVIRONMENT=development
      - API_DEBUG=True
      - API_RELOAD=True
    volumes:
      - ./backend/src:/app/src
      - ./backend/data:/app/data
    networks:
      - poe-network

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    container_name: poe-frontend-dev
    ports:
      - "9460:9460"
    volumes:
      - ./frontend/src:/app/src
      - ./frontend/public:/app/public
    networks:
      - poe-network
    depends_on:
      - backend

networks:
  poe-network:
    driver: bridge
```

### Development Dockerfiles

Create `backend/Dockerfile.dev`:

```dockerfile
FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8460

CMD ["uvicorn", "src.main:app", "--reload", "--host", "0.0.0.0", "--port", "8460"]
```

Create `frontend/Dockerfile.dev`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 9460

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
```

## Using Docker Compose

### Production Deployment

```bash
# Create .env file for docker compose passwords
echo "POSTGRES_PASSWORD=$(python3 -c 'import secrets; print(secrets.token_urlsafe(32))')" > .env.docker

# Build and start all services
docker compose up -d --build

# Check status
docker compose ps

# View logs
docker compose logs -f

# View specific service logs
docker compose logs -f backend
docker compose logs -f frontend

# Stop all services
docker compose down

# Stop and remove volumes (WARNING: deletes all data)
docker compose down -v
```

### Development with Docker

```bash
# Start development environment
docker compose -f docker-compose.dev.yml up --build

# Stop
docker compose -f docker-compose.dev.yml down
```

### Useful Docker Commands

```bash
# Rebuild a specific service
docker compose build backend
docker compose up -d backend

# Execute commands in a running container
docker compose exec backend python -c "from src.config import get_settings; print(get_settings().app_name)"

# Check backend health inside container
docker compose exec backend curl -f http://localhost:8460/api/health

# View resource usage
docker compose stats

# Pull latest images and rebuild
docker compose pull
docker compose up -d --build
```

## .dockerignore Files

Create `backend/.dockerignore`:

```
__pycache__
*.pyc
*.pyo
*.pyd
.Python
venv/
env/
.venv/
*.egg-info/
dist/
build/
.env
.git/
.gitignore
*.md
.pytest_cache/
htmlcov/
.coverage
data/chroma/
*.db
*.log
screenshots/
tests/
```

Create `frontend/.dockerignore`:

```
node_modules/
dist/
.env
.env.local
.git/
.gitignore
*.md
screenshots/
test-results/
playwright-report/
tests/
coverage/
```

## Data Persistence

Docker volumes ensure data persists across container restarts:

| Volume           | Mount Point                    | Purpose                    |
|------------------|--------------------------------|----------------------------|
| postgres-data    | /var/lib/postgresql/data       | PostgreSQL database files  |
| backend-data     | /app/data                      | ChromaDB + application data |
| backend-logs     | /var/log/poe-knowledge         | Application logs           |

### Backup Volumes

```bash
# Backup a volume
docker run --rm -v poe_knowledge_assistant_postgres-data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore a volume
docker run --rm -v poe_knowledge_assistant_postgres-data:/data -v $(pwd):/backup alpine tar xzf /backup/postgres-backup.tar.gz -C /data
```

## Container Health Monitoring

All containers have built-in health checks. Monitor with:

```bash
# Check health status
docker compose ps

# Inspect health check details
docker inspect --format='{{json .State.Health}}' poe-backend | python3 -m json.tool
```
