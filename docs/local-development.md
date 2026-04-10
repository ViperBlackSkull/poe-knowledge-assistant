# Local Development Setup

This guide covers setting up a local development environment for the PoE Knowledge Assistant.

## Prerequisites

### Required Software

| Software       | Version    | Installation                                     |
|----------------|------------|--------------------------------------------------|
| Python         | 3.10+      | [python.org](https://python.org)                 |
| Node.js        | 18+        | [nodejs.org](https://nodejs.org)                 |
| npm            | 9+         | Included with Node.js                            |
| Git            | 2.x        | [git-scm.com](https://git-scm.com)               |
| Make (optional)| Any        | System package manager                           |

### Optional Software (for local LLM support)

| Software   | Purpose                     | Installation                          |
|------------|-----------------------------|---------------------------------------|
| Ollama     | Run LLMs locally            | [ollama.ai](https://ollama.ai)        |
| LM Studio  | GUI for local LLMs          | [lmstudio.ai](https://lmstudio.ai)    |

## Step-by-Step Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd poe_knowledge_assistant
```

### 2. Backend Setup

#### 2.1 Create a Python Virtual Environment

```bash
cd backend
python3 -m venv venv
```

#### 2.2 Activate the Virtual Environment

Linux/macOS:
```bash
source venv/bin/activate
```

Windows:
```cmd
venv\Scripts\activate
```

#### 2.3 Install Python Dependencies

```bash
pip install --upgrade pip
pip install -r requirements.txt
```

This installs the following key packages:

| Package               | Purpose                        |
|-----------------------|--------------------------------|
| fastapi==0.109.0      | Web framework                  |
| uvicorn==0.27.0       | ASGI server                    |
| chromadb==0.4.22      | Vector database                |
| langchain==0.1.0      | LLM orchestration              |
| sentence-transformers | Local embeddings               |
| openai==1.10.0        | OpenAI API client              |
| anthropic==0.18.0     | Anthropic API client           |
| sqlalchemy==2.0.25    | Database ORM                   |
| beautifulsoup4        | Web scraping                   |

#### 2.4 Configure Environment Variables

```bash
cp .env.example .env
```

Edit `backend/.env` with your configuration. At minimum, set:

```ini
# Required for OpenAI
PROVIDER=openai
OPENAI_API_KEY=sk-your-actual-api-key-here

# Required for Anthropic
# PROVIDER=anthropic
# ANTHROPIC_API_KEY=your-anthropic-api-key-here

# Or use local LLM (no API key needed)
# PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
```

See [Environment Management](./environment-management.md) for the complete variable reference.

#### 2.5 Verify Backend Setup

```bash
# Quick sanity check
python -c "from src.config import get_settings; print('Config loaded:', get_settings().app_name)"
```

### 3. Frontend Setup

#### 3.1 Install Node.js Dependencies

```bash
cd ../frontend
npm install
```

This installs:
- React 18 with TypeScript
- Vite 5 build tool
- Tailwind CSS 3.4
- Axios for API communication
- Playwright for testing

#### 3.2 Configure Frontend Environment

The frontend uses a single environment variable. Create `frontend/.env`:

```ini
VITE_API_BASE_URL=/api
```

This is pre-configured to proxy API requests through Vite's dev server to the backend.

#### 3.3 Verify Frontend Setup

```bash
# Type check
npm run type-check

# Lint
npm run lint
```

### 4. Start Development Servers

#### Using the Init Script

The project includes an `init.sh` script for quick setup:

```bash
chmod +x init.sh
./init.sh
```

This script will:
1. Verify the project structure
2. Check for required files
3. Start the backend development server

Note: The init script starts the backend on port 8000 by default. For the project's configured ports (8460/9460), start servers manually as described below.

#### Starting Backend Manually

```bash
cd backend
source venv/bin/activate
uvicorn src.main:app --reload --host 0.0.0.0 --port 8460
```

The `--reload` flag enables automatic restart when code changes are detected.

#### Starting Frontend Manually

```bash
cd frontend
npm run dev
```

The frontend dev server runs on port 9460 with automatic API proxying to the backend on port 8460.

### 5. Verify Everything Works

1. Open http://localhost:9460 in your browser - you should see the PoE Knowledge Assistant UI
2. Open http://localhost:8460/docs in your browser - you should see the Swagger API documentation
3. Check the health endpoint:
   ```bash
   curl http://localhost:8460/api/health
   ```

## Development Workflow

### Backend Development

#### Project Structure
```
backend/
├── src/
│   ├── main.py           # FastAPI application entry point
│   ├── config.py          # Environment configuration
│   ├── api/               # API route handlers (reserved)
│   ├── models/            # Pydantic data models
│   │   ├── chat.py        # Chat-related models
│   │   ├── config.py      # Configuration models
│   │   ├── scraper.py     # Scraper models
│   │   └── system.py      # System models
│   └── services/          # Business logic services
│       ├── chroma_db.py   # ChromaDB connection management
│       ├── embeddings.py  # Embedding generation
│       ├── vector_store.py # Vector store operations
│       ├── llm_provider.py # LLM provider abstraction
│       ├── rag_chain.py   # RAG pipeline
│       ├── streaming.py   # SSE streaming
│       ├── scraper/       # Web scraping modules
│       ├── indexer.py     # Document indexing
│       ├── job_manager.py # Background job management
│       ├── conversation_history.py
│       ├── runtime_config.py
│       └── scrape_timestamps.py
├── data/                  # Runtime data (gitignored)
│   └── chroma/            # ChromaDB persistent storage
├── tests/                 # Backend tests
├── requirements.txt       # Python dependencies
├── .env.example           # Environment template
└── .env                   # Local configuration (gitignored)
```

#### Running Tests

```bash
cd backend
source venv/bin/activate

# Run all tests
pytest

# Run with coverage
pytest --cov=src --cov-report=html

# Run specific test file
pytest tests/test_specific.py

# Run with verbose output
pytest -v
```

#### Code Quality

```bash
# Format code
black src/ tests/
isort src/ tests/

# Lint
flake8 src/ tests/

# Type check
mypy src/
```

### Frontend Development

#### Project Structure
```
frontend/
├── src/
│   ├── App.tsx            # Main application component
│   ├── main.tsx           # Entry point
│   ├── index.css          # Global styles with PoE theme
│   ├── components/
│   │   ├── chat/          # Chat interface components
│   │   ├── common/        # Shared components
│   │   ├── items/         # Item display components
│   │   └── layout/        # Layout components
│   ├── hooks/             # Custom React hooks
│   ├── services/
│   │   └── api.ts         # Backend API client
│   ├── types/             # TypeScript type definitions
│   ├── utils/             # Utility functions
│   └── lib/               # Library configurations
├── tests/                 # Frontend tests
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── playwright.config.ts
```

#### Development Commands

```bash
cd frontend

# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type check
npm run type-check

# Lint
npm run lint

# Run unit tests
npm run test

# Run tests in watch mode
npm run test:watch
```

#### Vite Dev Server Configuration

The Vite dev server is configured in `vite.config.ts` with:

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

This means:
- Frontend dev server runs on port **9460**
- All requests to `/api/*` are proxied to the backend on port **8460**
- No CORS issues during development

## LLM Provider Setup

### OpenAI (Recommended for Best Quality)

1. Get an API key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Set in `backend/.env`:
   ```ini
   PROVIDER=openai
   OPENAI_API_KEY=sk-your-api-key-here
   OPENAI_MODEL=gpt-4
   ```

### Anthropic Claude

1. Get an API key from [console.anthropic.com](https://console.anthropic.com)
2. Set in `backend/.env`:
   ```ini
   PROVIDER=anthropic
   ANTHROPIC_API_KEY=your-api-key-here
   ANTHROPIC_MODEL=claude-3-sonnet-20240229
   ```

### Ollama (Free, Local)

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model:
   ```bash
   ollama pull llama2
   ```
3. Set in `backend/.env`:
   ```ini
   PROVIDER=ollama
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=llama2
   ```

### LM Studio (Free, Local, GUI)

1. Install LM Studio from [lmstudio.ai](https://lmstudio.ai)
2. Download a model through the LM Studio UI
3. Start the local server in LM Studio
4. Set in `backend/.env`:
   ```ini
   PROVIDER=lmstudio
   LMSTUDIO_BASE_URL=http://localhost:1234
   LMSTUDIO_MODEL=local-model
   ```

## Embedding Provider Setup

By default, the application uses local embeddings (`sentence-transformers`) which require no additional configuration:

```ini
EMBEDDING_PROVIDER=local
EMBEDDING_MODEL=all-MiniLM-L6-v2
```

For OpenAI embeddings (higher quality):
```ini
EMBEDDING_PROVIDER=openai
EMBEDDING_OPENAI_API_KEY=sk-your-api-key-here
EMBEDDING_OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
```

## Common Development Tasks

### Populating the Knowledge Base

The application requires indexed game data to provide answers. Use the scraper and indexer endpoints through the API:

1. Navigate to http://localhost:8460/docs
2. Use the scraper endpoints under the "Scraper" tag
3. Use the indexer endpoints under the "Indexer" tag

### Clearing and Rebuilding Data

To reset the vector database:

1. Stop the backend server
2. Delete `backend/data/chroma/` directory
3. Restart the backend
4. Re-index data using the API

### Viewing API Documentation

The backend provides interactive API documentation:

- Swagger UI: http://localhost:8460/docs
- ReDoc: http://localhost:8460/redoc

## IDE Recommendations

### VS Code

Recommended extensions:
- Python (Microsoft)
- Pylance
- ESLint
- Tailwind CSS IntelliSense
- TypeScript and JavaScript Language Features

### PyCharm

- Enable Python support
- Configure the venv interpreter at `backend/venv/bin/python`
- Enable pytest as the test runner

## Git Workflow

```bash
# Check status
git status

# Stage and commit
git add -A
git commit -m "description of changes"

# Create a feature branch
git checkout -b feature/my-feature
```

Note: The `.env` file is in `.gitignore` and should never be committed. Always use `.env.example` as the template for new environments.
