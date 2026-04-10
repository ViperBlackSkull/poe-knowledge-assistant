# Monitoring and Logging

This guide covers monitoring, health checks, and logging for the PoE Knowledge Assistant.

## Health Check Endpoints

The application provides several health check endpoints for monitoring different subsystems.

### Main Health Check

```bash
curl http://localhost:8460/api/health
```

Returns the overall system health:
```json
{
  "status": "healthy",
  "version": "1.0.0",
  "chromadb_status": "connected",
  "embeddings_status": "ready",
  "vectorstore_status": "ready",
  "chromadb_message": "ChromaDB is accessible",
  "embeddings_message": "Embeddings service is ready",
  "vectorstore_message": "Vector store is ready",
  "timestamp": "2024-01-15T12:00:00.000000+00:00"
}
```

| HTTP Status | Meaning                                    |
|-------------|--------------------------------------------|
| 200         | All subsystems are healthy                 |
| 503         | One or more subsystems are degraded        |

### Subsystem Health Checks

Each subsystem has its own health endpoint:

| Endpoint                         | Subsystem            |
|----------------------------------|----------------------|
| `GET /api/health`                | Overall health       |
| `GET /api/test/vectorstore/health` | Vector store       |
| `GET /api/test/llm/health`       | LLM provider         |
| `GET /api/test/scraper/health`   | Web scraper          |
| `GET /api/test/indexer/health`   | Document indexer     |
| `GET /api/jobs/health`           | Job manager          |
| `GET /api/scrape-timestamps/health` | Scrape timestamps |
| `GET /api/chat/stream/health`    | Streaming service    |

### Example: Check Individual Subsystem

```bash
# Vector store health
curl http://localhost:8460/api/test/vectorstore/health

# LLM provider health
curl http://localhost:8460/api/test/llm/health

# Scraper connectivity
curl http://localhost:8460/api/test/scraper/health

# Indexer health
curl http://localhost:8460/api/test/indexer/health
```

## Logging Configuration

### Backend Logging

The backend uses Python's standard logging module, configurable via environment variables:

```ini
# Log level: DEBUG, INFO, WARNING, ERROR, CRITICAL
LOG_LEVEL=INFO

# Log format
LOG_FORMAT=%(asctime)s - %(name)s - %(levelname)s - %(message)s

# Log to file (leave empty for console only)
LOG_FILE_PATH=/var/log/poe-knowledge/app.log

# Log rotation
LOG_MAX_BYTES=10485760   # 10 MB
LOG_BACKUP_COUNT=5       # Keep 5 backup files
```

### Log Levels by Environment

| Environment | Recommended Level | Purpose                                    |
|-------------|-------------------|--------------------------------------------|
| Development | DEBUG             | Detailed request/response data             |
| Testing     | DEBUG             | Full visibility for debugging tests        |
| Production  | WARNING           | Only warnings and errors, reduced volume   |

### Application Logs

#### Console Logging

When running with uvicorn directly, logs appear in the terminal:

```bash
source venv/bin/activate
uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
```

#### File Logging

When `LOG_FILE_PATH` is set, logs are written to the specified file with automatic rotation.

```bash
# View recent logs
tail -f /var/log/poe-knowledge/app.log

# Search for errors
grep "ERROR" /var/log/poe-knowledge/app.log

# View logs from today
grep "$(date +%Y-%m-%d)" /var/log/poe-knowledge/app.log
```

#### Gunicorn Access Logs

When running with Gunicorn in production:

```bash
# Access log (HTTP requests)
tail -f /var/log/poe-knowledge/access.log

# Error log
tail -f /var/log/poe-knowledge/error.log
```

### Nginx Logs

```bash
# Access log
tail -f /var/log/nginx/poe-knowledge-access.log

# Error log
tail -f /var/log/nginx/poe-knowledge-error.log

# Filter by status code
grep " 502 " /var/log/nginx/poe-knowledge-access.log
grep " 500 " /var/log/nginx/poe-knowledge-access.log
```

### Systemd Journal

```bash
# Backend service logs
sudo journalctl -u poe-knowledge-backend -f

# Recent 100 lines
sudo journalctl -u poe-knowledge-backend -n 100

# Logs since yesterday
sudo journalctl -u poe-knowledge-backend --since yesterday
```

### Docker Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f backend
docker compose logs -f frontend

# Last 100 lines
docker compose logs --tail 100 backend
```

## Monitoring with Cron

### Simple Health Check Script

Create `/opt/poe-knowledge/scripts/health-check.sh`:

```bash
#!/bin/bash
# PoE Knowledge Assistant Health Check

HEALTH_URL="http://127.0.0.1:8460/api/health"
ALERT_EMAIL="admin@yourdomain.com"
LOG_FILE="/var/log/poe-knowledge/health-check.log"

TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Check the health endpoint
RESPONSE=$(curl -s -w "\n%{http_code}" "$HEALTH_URL" 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
    echo "[$TIMESTAMP] ALERT: Health check failed (HTTP $HTTP_CODE)" >> "$LOG_FILE"
    echo "[$TIMESTAMP] Response: $BODY" >> "$LOG_FILE"

    # Optional: send email alert
    # echo "Health check failed at $TIMESTAMP. HTTP code: $HTTP_CODE" | \
    #     mail -s "PoE Knowledge Assistant Alert" "$ALERT_EMAIL"

    # Optional: restart the service
    # sudo systemctl restart poe-knowledge-backend

    exit 1
fi

STATUS=$(echo "$BODY" | python3 -c "import sys, json; print(json.load(sys.stdin)['status'])" 2>/dev/null)

if [ "$STATUS" != "healthy" ]; then
    echo "[$TIMESTAMP] WARNING: System is degraded ($STATUS)" >> "$LOG_FILE"
    echo "[$TIMESTAMP] Response: $BODY" >> "$LOG_FILE"
    exit 1
fi

echo "[$TIMESTAMP] OK: System is healthy" >> "$LOG_FILE"
exit 0
```

Set up cron for regular health checks:

```bash
chmod +x /opt/poe-knowledge/scripts/health-check.sh

# Run every 5 minutes
crontab -e
# Add: */5 * * * * /opt/poe-knowledge/scripts/health-check.sh
```

### Disk Space Monitoring

```bash
# Check data directory size
du -sh /opt/poe-knowledge/backend/data/

# Check ChromaDB size
du -sh /opt/poe-knowledge/backend/data/chroma/

# Check logs size
du -sh /var/log/poe-knowledge/

# Check disk usage
df -h
```

## Monitoring with Prometheus (Optional)

### Backend Metrics Endpoint

For Prometheus integration, you can add a metrics endpoint or use the existing health check. A basic approach using the health endpoint:

### Prometheus Configuration

Create `prometheus.yml`:

```yaml
global:
  scrape_interval: 30s

scrape_configs:
  - job_name: 'poe-knowledge-backend'
    metrics_path: '/api/health'
    scheme: http
    static_configs:
      - targets: ['localhost:8460']
```

### Grafana Dashboard

Key metrics to monitor:

| Metric                    | Source                    | Alert Threshold         |
|---------------------------|---------------------------|-------------------------|
| Overall health status     | `/api/health`             | status != "healthy"     |
| ChromaDB status           | `/api/health`             | status != "connected"   |
| Embeddings status         | `/api/health`             | status != "ready"       |
| Vector store status       | `/api/health`             | status != "ready"       |
| HTTP error rate           | Nginx access log          | > 5% 5xx responses     |
| Response time             | Nginx access log          | > 5s average           |
| Disk usage                | System metrics            | > 80%                   |
| Memory usage              | System metrics            | > 85%                   |
| CPU usage                 | System metrics            | > 80% sustained         |

## Log Rotation

### Application Log Rotation

The application handles log rotation internally via the `LOG_MAX_BYTES` and `LOG_BACKUP_COUNT` settings.

### Nginx Log Rotation

Nginx log rotation is typically handled by logrotate. Create `/etc/logrotate.d/poe-knowledge-nginx`:

```
/var/log/nginx/poe-knowledge-*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 $(cat /var/run/nginx.pid)
    endpostrotate
}
```

### System Log Rotation

For systemd journal:

```bash
# Configure journal size limit
sudo vi /etc/systemd/journald.conf
# SystemMaxUse=500M

sudo systemctl restart systemd-journald
```

## Alerting

### Simple Email Alerts

Using the health check script above, add email alerts:

```bash
# Install mail utilities
sudo apt install -y mailutils

# Test
echo "Test alert" | mail -s "PoE Assistant Test" admin@yourdomain.com
```

### Recommended Alert Conditions

| Condition                        | Severity  | Action                          |
|----------------------------------|-----------|---------------------------------|
| Health check fails               | Critical  | Restart service + notify admin  |
| System degraded (503)            | Warning   | Notify admin                    |
| Disk usage > 80%                 | Warning   | Clean up logs/data              |
| Disk usage > 95%                 | Critical  | Immediate action                |
| Memory usage > 90%               | Warning   | Restart service                 |
| Backend process not running      | Critical  | Auto-restart + notify           |
| SSL certificate expiring < 7 days| Warning   | Renew certificate               |

## Uptime Monitoring

For external uptime monitoring, use services like:
- UptimeRobot (free tier available)
- Pingdom
- Healthchecks.io
- AWS CloudWatch Synthetics

Configure them to monitor:
- `https://yourdomain.com/api/health` (every 5 minutes)
- `https://yourdomain.com/` (every 5 minutes)

Expected response: HTTP 200 with `{"status": "healthy"}`
