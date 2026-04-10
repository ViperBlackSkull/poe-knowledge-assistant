# PoE Knowledge Assistant

A Path of Exile knowledge assistant powered by FastAPI, React, and RAG (Retrieval-Augmented Generation) with ChromaDB.

## Project Overview

This application provides an intelligent chat interface for Path of Exile players to query game mechanics, items, and builds. It scrapes knowledge from poedb.tw and uses vector embeddings to provide contextual, game-version-aware responses.

## Features

- **Dual Game Support**: Separate knowledge bases for PoE1 and PoE2
- **RAG Pipeline**: ChromaDB vector store with semantic search
- **Scraper**: Automated poedb.tw scraper with rate limiting
- **Build Context**: Class/Ascendancy-aware responses
- **Item Cards**: Rich item display with PoE styling
- **Multi-LLM Support**: OpenAI, Anthropic, Ollama, LM Studio

## Tech Stack

### Backend
- FastAPI with uvicorn
- LangChain for LLM orchestration
- ChromaDB for vector storage
- sentence-transformers for embeddings
- BeautifulSoup for web scraping

### Frontend
- React with TypeScript
- Vite for build tooling
- Tailwind CSS with PoE theme
- Axios for API communication

## Project Structure

```
poe_knowledge_assistant/
├── backend/                 # FastAPI backend
│   ├── api/                # API route handlers
│   ├── models/             # Pydantic models
│   ├── services/           # Business logic
│   ├── config/             # Configuration
│   ├── utils/              # Utilities
│   ├── main.py             # FastAPI app
│   └── requirements.txt    # Python dependencies
├── frontend/               # React frontend
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── services/      # API client
│   │   ├── hooks/         # Custom hooks
│   │   ├── types/         # TypeScript types
│   │   └── utils/         # Utilities
│   ├── package.json
│   └── vite.config.ts
├── .github_project.json    # Task tracking
├── .task_breakdown.json    # Task definitions
└── README.md
```

## Quick Start

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your API keys
uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

### Access the Application

- Frontend: http://localhost:9460
- Backend API: http://localhost:8460
- API Documentation: http://localhost:8460/docs

## Configuration

The application supports multiple LLM and embedding providers:

- **LLM Providers**: OpenAI, Anthropic, Ollama, LM Studio
- **Embedding Providers**: Local (sentence-transformers), OpenAI, Ollama, LM Studio

See `backend/.env.example` for all configuration options. For the complete environment variable reference, see the [Environment Management documentation](docs/environment-management.md).

## Documentation

Comprehensive deployment and operations documentation is available in the `docs/` directory:

| Document | Description |
|----------|-------------|
| [Deployment Guide](docs/deployment.md) | Main deployment overview and quick start |
| [Local Development](docs/local-development.md) | Setting up a local development environment |
| [Production Deployment](docs/production-deployment.md) | Deploying to production servers |
| [Docker Configuration](docs/docker.md) | Docker and Docker Compose setup |
| [Environment Management](docs/environment-management.md) | Complete environment variable reference |
| [Reverse Proxy Setup](docs/reverse-proxy.md) | Nginx reverse proxy configuration |
| [Monitoring and Logging](docs/monitoring.md) | Health checks, logging, and alerting |
| [Troubleshooting](docs/troubleshooting.md) | Common issues and solutions |

## Development

### Task Management

This project uses a task-based development system. See `.task_breakdown.json` for the complete task list and `.github_project.json` for current progress.

### API Documentation

Once running, visit `http://localhost:8460/docs` for interactive Swagger API documentation, or `http://localhost:8460/redoc` for ReDoc documentation.

## License

MIT License - see LICENSE file for details
