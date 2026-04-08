# OpenAI Embeddings Service Implementation

## Issue #5: Create OpenAI embeddings service option

This document describes the implementation of OpenAI embeddings support for the POE Knowledge Assistant.

## Implementation Summary

### Files Modified

1. **`backend/src/services/embeddings.py`**
   - Added `OpenAIEmbeddings` class
   - Added `create_embeddings()` factory function
   - Maintained `LocalEmbeddings` class (already existed)

2. **`backend/src/services/__init__.py`**
   - Exported `OpenAIEmbeddings` class
   - Exported `create_embeddings` function

3. **`backend/src/main.py`**
   - Added test endpoints for OpenAI embeddings
   - Added test endpoint for factory function

### Acceptance Criteria Met

✅ **OpenAIEmbeddings class exists**
- Located in `src/services/embeddings.py`
- Implements all required methods

✅ **Uses LangChain's OpenAI embeddings integration**
- Imports from `langchain_openai`
- Uses `OpenAIEmbeddings` from LangChain

✅ **Requires OPENAI_API_KEY when provider is 'openai'**
- Validates API key in `__init__` method
- Raises `EmbeddingError` if key is missing
- Supports multiple sources for API key:
  - Direct parameter `api_key`
  - Environment variable `EMBEDDING_OPENAI_API_KEY`
  - Environment variable `OPENAI_API_KEY`
  - Config setting `embedding.openai_api_key`

✅ **Validates API key is present**
- Checks for API key during initialization
- Raises descriptive error if missing

✅ **Same interface as LocalEmbeddings**
Both classes implement:
- `embed_query(text: str) -> List[float]`
- `embed_documents(texts: List[str]) -> List[List[float]]`
- `health_check() -> dict`
- `is_ready() -> bool`
- `embedding_dimension` property

✅ **Factory function to create embeddings based on provider**
- `create_embeddings(provider, **kwargs)` function
- Supports 'local' and 'openai' providers
- Returns appropriate embeddings instance
- Handles invalid providers gracefully

## Usage Examples

### Using Factory Function (Recommended)

```python
from src.services.embeddings import create_embeddings

# Create local embeddings (default)
embeddings = create_embeddings(provider='local')
vector = embeddings.embed_query("test query")

# Create OpenAI embeddings
embeddings = create_embeddings(provider='openai', api_key='sk-...')
vector = embeddings.embed_query("test query")

# Use environment variables for configuration
# export EMBEDDING_PROVIDER=openai
# export OPENAI_API_KEY=sk-...
embeddings = create_embeddings()  # Uses EMBEDDING_PROVIDER from env
```

### Using Classes Directly

```python
from src.services.embeddings import LocalEmbeddings, OpenAIEmbeddings

# Local embeddings
local_emb = LocalEmbeddings(model_name='all-MiniLM-L6-v2')
vector = local_emb.embed_query("test query")

# OpenAI embeddings
openai_emb = OpenAIEmbeddings(
    api_key='sk-...',
    model_name='text-embedding-ada-002'
)
vector = openai_emb.embed_query("test query")
```

### Configuration via Environment Variables

```bash
# Set provider
export EMBEDDING_PROVIDER=openai  # or 'local'

# Set OpenAI API key (choose one)
export OPENAI_API_KEY=sk-...
# or
export EMBEDDING_OPENAI_API_KEY=sk-...

# Set OpenAI embedding model
export OPENAI_EMBEDDING_MODEL=text-embedding-ada-002
```

## API Endpoints

The following test endpoints are available:

### POST /api/test/embeddings/factory
Test the factory function with different providers.

**Request Body:**
```json
{
  "provider": "openai",  // or "local"
  "api_key": "sk-...",   // optional, for OpenAI
  "model_name": "text-embedding-ada-002",  // optional
  "test_text": "This is a test query"
}
```

**Response:**
```json
{
  "success": true,
  "provider_requested": "openai",
  "provider_created": "openai",
  "model_name": "text-embedding-ada-002",
  "embedding_dimension": 1536,
  "is_ready": true,
  "test_embedding_dimension": 1536,
  "test_embedding_preview": [0.123, -0.456, ...],
  "message": "Successfully created openai embeddings and generated test embedding"
}
```

### POST /api/test/embeddings/openai
Test OpenAI embeddings directly.

**Request Body:**
```json
{
  "text": "This is a test query"
}
```

**Response:**
```json
{
  "success": true,
  "provider": "openai",
  "model_name": "text-embedding-ada-002",
  "embedding_dimension": 1536,
  "is_ready": true,
  "test_embedding_dimension": 1536,
  "test_embedding_preview": [0.123, -0.456, ...],
  "message": "OpenAI embeddings created and test embedding generated successfully"
}
```

## Supported Models

### Local Models (sentence-transformers)
- `all-MiniLM-L6-v2` (default, 384 dimensions)
- Any model from HuggingFace Hub

### OpenAI Models
- `text-embedding-ada-002` (default, 1536 dimensions)
- `text-embedding-3-small` (1536 dimensions)
- `text-embedding-3-large` (3072 dimensions)

## Error Handling

The implementation includes comprehensive error handling:

1. **Missing API Key**
   ```python
   try:
       embeddings = OpenAIEmbeddings()
   except EmbeddingError as e:
       print("API key required:", str(e))
   ```

2. **Invalid Provider**
   ```python
   try:
       embeddings = create_embeddings(provider='invalid')
   except EmbeddingError as e:
       print("Invalid provider:", str(e))
   ```

3. **API Errors**
   ```python
   try:
       embeddings = OpenAIEmbeddings(api_key='invalid-key')
       vector = embeddings.embed_query("test")
   except EmbeddingError as e:
       print("API error:", str(e))
   ```

## Testing

### Verification Script
Run `verify_openai_embeddings.py` to verify the implementation structure:

```bash
cd backend
python verify_openai_embeddings.py
```

This checks:
- Class existence and structure
- Method signatures
- Factory function
- Configuration support
- Interface compatibility

### Functional Tests
Run `test_openai_embeddings.py` for functional tests:

```bash
cd backend
python test_openai_embeddings.py
```

This tests:
- Factory function with different providers
- API key validation
- Embedding generation
- Error handling

## Dependencies

The implementation requires:

```
langchain-openai>=0.0.2
sentence-transformers>=2.2.2
pydantic>=2.0.0
pydantic-settings>=2.1.0
```

All dependencies are already listed in `backend/requirements.txt`.

## Architecture

```
src/services/embeddings.py
├── EmbeddingError (Exception class)
├── LocalEmbeddings
│   ├── __init__(model_name)
│   ├── embed_query(text) -> List[float]
│   ├── embed_documents(texts) -> List[List[float]]
│   ├── health_check() -> dict
│   └── is_ready() -> bool
├── OpenAIEmbeddings
│   ├── __init__(api_key, model_name)
│   ├── embed_query(text) -> List[float]
│   ├── embed_documents(texts) -> List[List[float]]
│   ├── health_check() -> dict
│   └── is_ready() -> bool
└── create_embeddings(provider, **kwargs) -> Union[LocalEmbeddings, OpenAIEmbeddings]
```

## Configuration Schema

The `EmbeddingSettings` class in `src/config.py` supports:

```python
class EmbeddingSettings(BaseSettings):
    provider: EmbeddingProvider = EmbeddingProvider.LOCAL
    model: str = "all-MiniLM-L6-v2"
    openai_api_key: Optional[str] = None
    openai_embedding_model: str = "text-embedding-ada-002"
    embedding_dimension: int = 384
    batch_size: int = 32
```

## Future Enhancements

Potential improvements:
1. Support for additional OpenAI models as they're released
2. Caching layer for frequently used embeddings
3. Rate limiting for API calls
4. Async embedding generation
5. Batch size optimization for OpenAI API

## Notes

- The OpenAI embeddings client is initialized lazily to avoid import errors if `langchain-openai` is not installed
- API key validation happens at initialization time, not at import time
- The factory function makes it easy to switch between providers without changing code
- Both classes implement the same interface, making them interchangeable
