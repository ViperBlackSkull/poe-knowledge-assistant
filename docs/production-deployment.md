# Production Deployment

This guide covers deploying the PoE Knowledge Assistant to a production environment.

## Deployment Overview

### Recommended Stack

| Component     | Production Choice        | Alternative           |
|---------------|--------------------------|-----------------------|
| OS            | Ubuntu 22.04 LTS         | Debian 12, CentOS 9   |
| Reverse Proxy | Nginx                    | Caddy, Traefik        |
| WSGI Server   | Gunicorn + Uvicorn workers | Uvicorn standalone  |
| Database      | PostgreSQL 15+           | SQLite (low traffic)  |
| Vector DB     | ChromaDB (embedded)      | ChromaDB (embedded)   |
| SSL/TLS       | Let's Encrypt            | Cloud provider certs  |
| Process Manager | systemd                | Docker, PM2           |
| Monitoring    | Prometheus + Grafana     | CloudWatch, Datadog   |

### Production Checklist

Before deploying to production, verify all of the following:

- [ ] `ENVIRONMENT` is set to `production` in `.env`
- [ ] `API_DEBUG` is set to `False`
- [ ] `API_RELOAD` is set to `False`
- [ ] `SECRET_KEY` is changed to a strong random string
- [ ] All API keys are secured and not using placeholder values
- [ ] `CORS_ORIGINS` is restricted to your actual domain(s)
- [ ] `DATABASE_URL` points to a PostgreSQL database
- [ ] `LOG_LEVEL` is set to `WARNING` or `ERROR`
- [ ] `LOG_FILE_PATH` is configured with proper log rotation
- [ ] `ACCESS_TOKEN_EXPIRE_MINUTES` is set appropriately (15-30 recommended)
- [ ] `.env` file has restrictive permissions (`chmod 600`)
- [ ] SSL/TLS certificates are configured
- [ ] Firewall rules allow only ports 80 and 443
- [ ] Database backups are configured
- [ ] Health check monitoring is set up

## Server Setup

### 1. Provision a Server

Minimum requirements:

| Resource   | Minimum      | Recommended    |
|------------|--------------|----------------|
| CPU        | 2 cores      | 4 cores        |
| RAM        | 4 GB         | 8 GB           |
| Storage    | 20 GB SSD    | 50 GB SSD      |
| Network    | 5 Mbps       | 20 Mbps        |

Note: If using local embeddings (`sentence-transformers`), additional RAM may be needed for model loading (~2 GB).

### 2. Install System Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Python and tools
sudo apt install -y python3 python3-pip python3-venv

# Install Node.js (via NodeSource)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Install Nginx
sudo apt install -y nginx

# Install PostgreSQL (optional, recommended for production)
sudo apt install -y postgresql postgresql-contrib

# Install other tools
sudo apt install -y git curl wget ufw
```

### 3. Configure Firewall

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

## Backend Deployment

### 1. Clone and Set Up the Application

```bash
# Create application directory
sudo mkdir -p /opt/poe-knowledge
sudo chown $USER:$USER /opt/poe-knowledge

# Clone the repository
cd /opt/poe-knowledge
git clone <repository-url> .

# Set up Python virtual environment
cd backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 2. Configure Production Environment

```bash
cp .env.example .env
chmod 600 .env
```

Edit `.env` for production:

```ini
# Application
APP_NAME=POE Knowledge Assistant
APP_VERSION=1.0.0
ENVIRONMENT=production

# Server - bind to localhost (Nginx handles external traffic)
API_HOST=127.0.0.1
API_PORT=8460
API_DEBUG=False
API_RELOAD=False
API_WORKERS=4

# Database (PostgreSQL)
DATABASE_URL=postgresql://poe_user:STRONG_PASSWORD@localhost:5432/poe_knowledge
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

# ChromaDB
CHROMA_PERSIST_DIRECTORY=/opt/poe-knowledge/backend/data/chroma
CHROMA_COLLECTION_NAME=poe_knowledge

# LLM Provider
PROVIDER=openai
OPENAI_API_KEY=sk-your-actual-production-key
OPENAI_MODEL=gpt-4
OPENAI_TEMPERATURE=0.7
OPENAI_MAX_TOKENS=2000

# Embeddings
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=all-MiniLM-L6-v2
EMBEDDING_EMBEDDING_DIMENSION=384

# CORS - restrict to your domain
CORS_ORIGINS=https://yourdomain.com,https://www.yourdomain.com
CORS_ALLOW_CREDENTIALS=True

# Security
SECRET_KEY=<generate-with-python-secrets-token-urlsafe-32>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# Logging
LOG_LEVEL=WARNING
LOG_FORMAT=%(asctime)s - %(name)s - %(levelname)s - %(message)s
LOG_FILE_PATH=/var/log/poe-knowledge/app.log
LOG_MAX_BYTES=10485760
LOG_BACKUP_COUNT=5

# RAG
RAG_TOP_K_RESULTS=3
RAG_CHUNK_SIZE=1000
RAG_CHUNK_OVERLAP=200
RAG_SCORE_THRESHOLD=0.7

# Scraper
SCRAPER_RATE_LIMIT_DELAY=2.0
SCRAPER_MAX_RETRIES=3
SCRAPER_TIMEOUT=30
```

Generate a strong SECRET_KEY:
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(32))"
```

### 3. Set Up PostgreSQL (Optional but Recommended)

```bash
# Switch to postgres user
sudo -u postgres psql

# Create database and user
CREATE USER poe_user WITH PASSWORD 'STRONG_PASSWORD';
CREATE DATABASE poe_knowledge OWNER poe_user;
GRANT ALL PRIVILEGES ON DATABASE poe_knowledge TO poe_user;
\q
```

### 4. Set Up Log Directory

```bash
sudo mkdir -p /var/log/poe-knowledge
sudo chown $USER:$USER /var/log/poe-knowledge
```

### 5. Create Systemd Service

Create `/etc/systemd/system/poe-knowledge-backend.service`:

```ini
[Unit]
Description=PoE Knowledge Assistant Backend
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=notify
User=www-data
Group=www-data
WorkingDirectory=/opt/poe-knowledge/backend
Environment="PATH=/opt/poe-knowledge/backend/venv/bin"
ExecStart=/opt/poe-knowledge/backend/venv/bin/gunicorn \
    src.main:app \
    --workers 4 \
    --worker-class uvicorn.workers.UvicornWorker \
    --bind 127.0.0.1:8460 \
    --timeout 120 \
    --graceful-timeout 30 \
    --access-logfile /var/log/poe-knowledge/access.log \
    --error-logfile /var/log/poe-knowledge/error.log \
    --log-level warning
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Enable and start the service:

```bash
# Fix ownership
sudo chown -R www-data:www-data /opt/poe-knowledge

# Enable and start
sudo systemctl daemon-reload
sudo systemctl enable poe-knowledge-backend
sudo systemctl start poe-knowledge-backend

# Check status
sudo systemctl status poe-knowledge-backend

# View logs
sudo journalctl -u poe-knowledge-backend -f
```

## Frontend Deployment

### 1. Build the Production Frontend

```bash
cd /opt/poe-knowledge/frontend
npm install
npm run build
```

This creates optimized static files in `frontend/dist/`.

### 2. Configure Environment for Build

The production frontend needs the correct API URL. Create `frontend/.env.production`:

```ini
VITE_API_BASE_URL=/api
```

Or if the API is on a different domain:
```ini
VITE_API_BASE_URL=https://api.yourdomain.com/api
```

Then rebuild:
```bash
npm run build
```

### 3. Deploy Static Files

Copy the built files to the web server directory:

```bash
sudo mkdir -p /var/www/poe-knowledge
sudo cp -r dist/* /var/www/poe-knowledge/
sudo chown -R www-data:www-data /var/www/poe-knowledge
```

## Nginx Configuration

See [Reverse Proxy Setup](./reverse-proxy.md) for the complete Nginx configuration.

## SSL/TLS with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Certbot will automatically modify the Nginx config
# It also sets up auto-renewal via systemd timer
```

Verify auto-renewal:
```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## Post-Deployment Verification

### 1. Check Backend Health

```bash
curl http://127.0.0.1:8460/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "chromadb_status": "connected",
  "embeddings_status": "ready",
  "vectorstore_status": "ready"
}
```

### 2. Check Nginx Proxy

```bash
curl https://yourdomain.com/api/health
```

### 3. Check Frontend

```bash
curl -I https://yourdomain.com
```

Expected: `200 OK` with content headers.

### 4. Test WebSocket/Streaming

The application uses Server-Sent Events (SSE) for streaming chat. Verify:

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"message":"hello","game_version":"poe1"}' \
  https://yourdomain.com/api/chat/stream
```

## Database Backups

### PostgreSQL Backup Script

Create `/opt/poe-knowledge/scripts/backup.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/opt/poe-knowledge/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/poe_knowledge_$TIMESTAMP.sql.gz"

mkdir -p $BACKUP_DIR
pg_dump -U poe_user poe_knowledge | gzip > $BACKUP_FILE

# Keep only last 30 days of backups
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup created: $BACKUP_FILE"
```

Set up a cron job for daily backups:
```bash
chmod +x /opt/poe-knowledge/scripts/backup.sh
crontab -e
# Add: 0 2 * * * /opt/poe-knowledge/scripts/backup.sh >> /var/log/poe-knowledge/backup.log 2>&1
```

### ChromaDB Backup

Since ChromaDB uses file-based storage, a simple file copy suffices:

```bash
# Add to the backup script
cp -r /opt/poe-knowledge/backend/data/chroma $BACKUP_DIR/chroma_$TIMESTAMP
```

## Updating the Application

### 1. Pull Latest Code

```bash
cd /opt/poe-knowledge
git pull origin main
```

### 2. Update Backend

```bash
cd backend
source venv/bin/activate
pip install -r requirements.txt
sudo systemctl restart poe-knowledge-backend
```

### 3. Update Frontend

```bash
cd frontend
npm install
npm run build
sudo cp -r dist/* /var/www/poe-knowledge/
```

### 4. Verify

```bash
curl https://yourdomain.com/api/health
```

## Rollback Procedure

If an update causes issues:

```bash
# 1. Roll back the code
cd /opt/poe-knowledge
git log --oneline -5  # Find the last working commit
git checkout <commit-hash>

# 2. Reinstall dependencies
cd backend
source venv/bin/activate
pip install -r requirements.txt

cd ../frontend
npm install
npm run build

# 3. Redeploy
sudo cp -r frontend/dist/* /var/www/poe-knowledge/
sudo systemctl restart poe-knowledge-backend

# 4. Verify
curl https://yourdomain.com/api/health
```

## Scaling Considerations

### Horizontal Scaling

For high-traffic deployments:

1. Use a load balancer (Nginx, HAProxy, or cloud LB)
2. Run multiple backend instances on different ports
3. Use a shared PostgreSQL database
4. Share the ChromaDB data directory via network storage or use a dedicated vector DB

### Worker Configuration

For Gunicorn workers:
```bash
# Recommended formula: (2 x CPU cores) + 1
# For a 4-core server:
--workers 9

# For I/O bound (LLM API calls):
--workers 4
--worker-class uvicorn.workers.UvicornWorker
--threads 2
```

### Memory Considerations

- Each worker loads the embedding model (~500 MB for all-MiniLM-L6-v2)
- Plan for: Workers x (model_size + 200 MB base) = total memory needed
- Example: 4 workers x 700 MB = 2.8 GB just for the backend
