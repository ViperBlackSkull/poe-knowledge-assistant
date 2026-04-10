# Deployment Guide

Complete deployment documentation for the PoE Knowledge Assistant application.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Local Development Setup](./local-development.md)
3. [Production Deployment](./production-deployment.md)
4. [Docker Configuration](./docker.md)
5. [Environment Management](./environment-management.md)
6. [Reverse Proxy Setup (Nginx)](./reverse-proxy.md)
7. [Monitoring and Logging](./monitoring.md)
8. [Troubleshooting](./troubleshooting.md)

## Architecture Overview

```
                    +-----------------+
                    |    Nginx        |
                    |  (reverse proxy)|
                    +--------+--------+
                             |
               +-------------+-------------+
               |                           |
      +--------v--------+        +---------v--------+
      |    Frontend      |        |     Backend      |
      |  React + Vite    |        |  FastAPI + Uvicorn|
      |  (static files)  |        |   (API server)    |
      +------------------+        +---------+---------+
                                            |
                        +-------------------+-------------------+
                        |                   |                   |
               +--------v--------+ +-------v--------+ +--------v--------+
               |   ChromaDB      | |   SQLite /     | |  LLM Provider  |
               |  (vector store) | |  PostgreSQL    | | (OpenAI, etc.) |
               +-----------------+ +----------------+ +----------------+
```

## Tech Stack Summary

| Component     | Technology                          |
|---------------|-------------------------------------|
| Backend       | FastAPI 0.109.0, uvicorn 0.27.0     |
| Frontend      | React 18, TypeScript 5, Vite 5      |
| Vector DB     | ChromaDB 0.4.22                     |
| Embeddings    | sentence-transformers 2.2.2         |
| LLM           | OpenAI / Anthropic / Ollama / LM Studio |
| Database      | SQLite (dev) / PostgreSQL (prod)    |
| Styling       | Tailwind CSS 3.4                    |
| API Client    | Axios, Fetch API                    |

## Quick Start

### Prerequisites

- Python 3.10+
- Node.js 18+ and npm
- Git
- An LLM API key (OpenAI or Anthropic) or a local LLM (Ollama/LM Studio)

### 1. Clone the Repository

```bash
git clone <repository-url>
cd poe_knowledge_assistant
```

### 2. Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Linux/macOS
# or: venv\Scripts\activate  # Windows
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys and configuration
```

### 3. Frontend Setup

```bash
cd ../frontend
npm install
```

### 4. Start Development Servers

Terminal 1 (Backend):
```bash
cd backend
source venv/bin/activate
uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
```

Terminal 2 (Frontend):
```bash
cd frontend
npm run dev
```

### 5. Access the Application

- Frontend: http://localhost:9460
- Backend API: http://localhost:8460
- API Documentation: http://localhost:8460/docs

## Ports Reference

| Service     | Development Port | Production Port |
|-------------|-----------------|-----------------|
| Frontend    | 9460            | 80/443 (via Nginx) |
| Backend API | 8460            | 8460 (internal)  |
| PostgreSQL  | N/A             | 5432            |
| ChromaDB    | N/A (embedded)  | N/A (embedded)  |

## Health Check Endpoint

The application provides a comprehensive health check endpoint at `GET /api/health`:

```bash
curl http://localhost:8460/api/health
```

Response example:
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

HTTP Status Codes:
- `200` - System is healthy (all services ready)
- `503` - System is degraded (any service not ready)

## Next Steps

- For detailed local development instructions, see [Local Development Setup](./local-development.md)
- For production deployment, see [Production Deployment](./production-deployment.md)
- For Docker-based deployment, see [Docker Configuration](./docker.md)
- For environment variable reference, see [Environment Management](./environment-management.md)
- For reverse proxy configuration, see [Reverse Proxy Setup](./reverse-proxy.md)
- For monitoring setup, see [Monitoring and Logging](./monitoring.md)
- For fixing common issues, see [Troubleshooting](./troubleshooting.md)
