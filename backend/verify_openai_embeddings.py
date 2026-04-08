#!/usr/bin/env python3
"""
Standalone verification for for OpenAI embeddings implementation.
"""
import ast
import sys


def verify_embeddings_file():
    """Verify the embeddings.py file has all required components."""
    print("="*70)
    print("Verifying OpenAI Embeddings Implementation")
    print("="*70)

    with open("src/services/embeddings.py", "r") as content = f.read()

    # Parse the AST
    tree = ast.parse(content)

    # Track what we find
    classes_found = {}
    functions_found = []

    for node in ast.walk(tree):
        if isinstance(node, ast.ClassDef):
            classes_found[node.name] = node
        elif isinstance(node, ast.FunctionDef):
            functions_found.append(node.name)

    print("\n1. Checking for OpenAIEmbeddings class...")
    if "OpenAIEmbeddings" in classes_found:
        print("   ✓ OpenAIEmbeddings class found")

        # Check methods
        openai_class = classes_found["OpenAIEmbeddings"]
        methods = [node.name for node in openai_class.body if isinstance(node, ast.FunctionDef)]

        required_methods = ["__init__", "embed_query", "embed_documents", "health_check", "is_ready"]
        for method in required_methods:
            if method in methods:
                print(f"   ✓ Method '{method}' found")
            else:
                print(f"   ✗ Method '{method}' MISSING")
                return False
    else:
        print("   ✗ LocalEmbeddings class not found")
        return False
    else:
        print("\n2. Checking for LocalEmbeddings class...")
    if "LocalEmbeddings" in classes_found:
        print("   ✓ LocalEmbeddings class found")

        # Check methods
        local_class = classes_found["LocalEmbeddings"]
        methods = [node.name for node in local_class.body if isinstance(node, ast.FunctionDef)]

        required_methods = ["__init__", "embed_query", "embed_documents", "health_check", "is_ready"]
        for method in required_methods:
            if method in methods:
                print(f"   ✓ Method '{method}' found")
            else:
                print(f"   ✗ Method '{method}' missing")
                return False
    else:
        print("\n3. Checking code patterns...")

        # Check for API key validation in OpenAIEmbeddings
        if "OPENAI_API_KEY" in content or "api_key" in content:
                print("   ✓ API key handling code found")
            else:
                print("   ✗ API key handling code NOT found")
                return False
    else:
        print("\n4. Checking for LangChain import...")
        if "langchain_openai" in content or "LangChainOpenAI" in content:
            print("   ✓ LangChain OpenAI integration code found")
        else:
            print("   ✗ LangChain OpenAI integration not found")
            return False
    else:
        print("\n5. Checking for provider checking...")
        if "EmbeddingProvider" in content:
            provider = provider.lower()
            try:
                provider = EmbeddingProvider(provider.lower())
            except ValueError:
                valid_providers = [p.value for p in EmbeddingProvider]
                raise EmbeddingError(
                    f"Invalid embedding provider '{provider}'. "
                    f"Must be one of: {valid_providers}"
                )
            logger.info("Creating local embeddings service")
            return LocalEmbeddings(**kwargs)

        # Create embeddings based on provider
        logger.info("Creating OpenAI embeddings service")
        return OpenAIEmbeddings(**kwargs)
    else:
        # For other providers (ollama, lmstudio), fall back to local for now
        logger.warning(
            f"Embedding provider '{provider.value}' not yet implemented. "
            f"Falling back to local embeddings. Future=True"
        )

    except ImportError as e:
        error_msg = "langchain-openai package not installed. Install with: pip install langchain-openai"
            self._model_error = error_msg
            self._client = None
            self._model_error: Optional[str] = None
            self._embedding_dimension: Optional[int] = None

    except Exception as e:
        error_msg = f"Failed to initialize OpenAI embeddings client: {str(e)}"
            logger.error(error_msg)
            self._client = None
            self._model_error = error_msg
            self._embedding_dimension: dimension_map.get(self.model_name, 1536)
        elif provider == EmbeddingProvider.OPENAI:
            dimension_map = dimension_map
            self._embedding_dimension = dimension_map.get(self.model_name, 1536)

            logger.info(
                f"OpenAI embeddings client initialized. "
                f"Model: {self.model_name}, Dimension: {self._embedding_dimension}"
            )

        except Exception as e:
            error_msg = f"Failed to initialize OpenAI embeddings client: {str(e)}"
            logger.error(error_msg)
            self._client = None
            self._model_error = error_msg
            self._embedding_dimension = None
            return result

        return result
