# Reverse Proxy Setup (Nginx)

This guide covers configuring Nginx as a reverse proxy for the PoE Knowledge Assistant.

## Overview

Nginx serves as:
- A reverse proxy to route requests to the backend API
- A static file server for the frontend
- An SSL/TLS termination point
- A cache and compression layer
- A security barrier between the internet and the application

## Architecture

```
Internet ---> [Nginx :80/:443] ---> [Backend :8460]
                   |
                   +--> Static files (/var/www/poe-knowledge)
```

## Installation

```bash
sudo apt update
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## Basic Configuration

### Non-production / Development with Nginx

Create `/etc/nginx/sites-available/poe-knowledge`:

```nginx
# Upstream backend server
upstream poe_backend {
    server 127.0.0.1:8460;
    keepalive 32;
}

server {
    listen 80;
    server_name localhost;

    # Frontend static files
    root /opt/poe-knowledge/frontend/dist;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # API proxy
    location /api/ {
        proxy_pass http://poe_backend/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / Streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Connection keepalive
        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # Swagger / API docs
    location /docs {
        proxy_pass http://poe_backend/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /redoc {
        proxy_pass http://poe_backend/redoc;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    location /openapi.json {
        proxy_pass http://poe_backend/openapi.json;
        proxy_set_header Host $host;
    }

    # Static assets with long cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Production Configuration with SSL

Create `/etc/nginx/sites-available/poe-knowledge-ssl`:

```nginx
# Upstream backend server
upstream poe_backend {
    server 127.0.0.1:8460;
    keepalive 32;
}

# Rate limiting zones
limit_req_zone $binary_remote_addr zone=api_limit:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=chat_limit:10m rate=10r/m;

# HTTP -> HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name yourdomain.com www.yourdomain.com;

    # Let's Encrypt challenge
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect all other traffic to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}

# HTTPS server
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name yourdomain.com www.yourdomain.com;

    # SSL configuration
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;

    # Modern TLS configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;

    # HSTS header
    add_header Strict-Transport-Security "max-age=63072000" always;

    # Logging
    access_log /var/log/nginx/poe-knowledge-access.log;
    error_log /var/log/nginx/poe-knowledge-error.log;

    # Maximum request body size
    client_max_body_size 10M;

    # Frontend static files
    root /var/www/poe-knowledge;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_min_length 256;
    gzip_types
        text/plain
        text/css
        text/xml
        application/json
        application/javascript
        application/xml+rss
        application/atom+xml
        image/svg+xml;

    # API endpoints with rate limiting
    location /api/ {
        limit_req zone=api_limit burst=20 nodelay;

        proxy_pass http://poe_backend/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE / Streaming support
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;

        # Connection keepalive
        proxy_http_version 1.1;
        proxy_set_header Connection "";

        # Security headers for API
        add_header X-Content-Type-Options "nosniff" always;
    }

    # Chat streaming endpoint with stricter rate limiting
    location /api/chat/stream {
        limit_req zone=chat_limit burst=5 nodelay;

        proxy_pass http://poe_backend/api/chat/stream;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding on;
        proxy_read_timeout 600s;
        proxy_send_timeout 600s;

        proxy_http_version 1.1;
        proxy_set_header Connection "";
    }

    # API documentation (restrict in production if desired)
    location /docs {
        proxy_pass http://poe_backend/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;

        # Optional: restrict access by IP
        # allow 10.0.0.0/8;
        # allow 192.168.0.0/16;
        # deny all;
    }

    location /redoc {
        proxy_pass http://poe_backend/redoc;
        proxy_set_header Host $host;
    }

    location /openapi.json {
        proxy_pass http://poe_backend/openapi.json;
    }

    # Static assets with long cache (Vite hashed filenames)
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Deny access to hidden files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
```

## Enable the Configuration

```bash
# Create symbolic link to enable the site
sudo ln -s /etc/nginx/sites-available/poe-knowledge /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Reload Nginx
sudo systemctl reload nginx
```

## SSL/TLS with Let's Encrypt

```bash
# Install Certbot
sudo apt install -y certbot python3-certbot-nginx

# Create directory for challenges
sudo mkdir -p /var/www/certbot

# Obtain certificate
sudo certbot certonly --webroot \
    -w /var/www/certbot \
    -d yourdomain.com \
    -d www.yourdomain.com \
    --email your-email@example.com \
    --agree-tos \
    --non-interactive

# Update Nginx config with SSL paths
# Then reload:
sudo nginx -t && sudo systemctl reload nginx

# Set up auto-renewal (usually automatic with certbot timer)
sudo systemctl enable certbot.timer
sudo certbot renew --dry-run
```

## Performance Tuning

### Connection Keepalive

Add to `http` block in `/etc/nginx/nginx.conf`:

```nginx
keepalive_timeout 65;
keepalive_requests 100;
```

### Worker Configuration

In `/etc/nginx/nginx.conf`:

```nginx
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
    use epoll;
}
```

### Buffer Settings

```nginx
proxy_buffer_size 4k;
proxy_buffers 8 4k;
proxy_busy_buffers_size 8k;
```

### Client Caching

For the frontend static files, aggressive caching of hashed assets:

```nginx
location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    add_header X-Content-Type-Options "nosniff";
}
```

## Verifying the Setup

### Test Configuration Syntax

```bash
sudo nginx -t
# Expected: syntax is ok / test is successful
```

### Test Backend Connectivity

```bash
# From the Nginx server
curl http://127.0.0.1:8460/api/health

# Through Nginx
curl http://localhost/api/health
```

### Test SSL

```bash
curl -v https://yourdomain.com/api/health
```

### Test Streaming

```bash
curl -N https://yourdomain.com/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"message":"hello","game_version":"poe1"}'
```

## Common Issues

### 502 Bad Gateway

The backend is not running or not accessible at the configured address.

```bash
# Check backend status
sudo systemctl status poe-knowledge-backend

# Check if backend is listening
ss -tlnp | grep 8460

# Check Nginx error logs
sudo tail -50 /var/log/nginx/error.log
```

### 504 Gateway Timeout

The backend is taking too long to respond.

```bash
# Increase timeout in Nginx config
proxy_read_timeout 600s;
proxy_send_timeout 600s;
```

### CORS Errors

Ensure `CORS_ORIGINS` in the backend `.env` includes the frontend URL:
```ini
CORS_ORIGINS=https://yourdomain.com
```

### SSE Streaming Issues

If streaming responses are buffered or delayed, ensure:
1. `proxy_buffering off;` is set
2. `proxy_cache off;` is set
3. `proxy_read_timeout` is high enough (300s+)
4. No intermediate proxies are buffering
