"""
LLM provider services for POE Knowledge Assistant.
Provides LLM functionality using OpenAI, Anthropic, Ollama, or LM Studio.
"""
import logging
import os
from typing import Any, Dict, List, Optional, Union

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage

from src.config import get_settings, LLMProvider

logger = logging.getLogger(__name__)


class LLMProviderError(Exception):
    """Custom exception for LLM provider errors."""
    pass


class OpenAILLM:
    """
    OpenAI LLM service using LangChain's OpenAI chat integration.

    This class provides:
    - OpenAI chat completion via LangChain
    - Support for GPT-4, GPT-3.5-turbo, and other OpenAI models
    - Configurable temperature and max tokens
    - API key validation
    - Error handling for API calls
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        """
        Initialize the OpenAI LLM service.

        Args:
            api_key: OpenAI API key. Falls back to OPENAI_API_KEY env var or config.
            model_name: OpenAI model name. Defaults to config setting (gpt-4).
            temperature: Temperature for response generation. Defaults to config setting.
            max_tokens: Maximum tokens for responses. Defaults to config setting.

        Raises:
            LLMProviderError: If API key is not provided and not found in environment
        """
        settings = get_settings()

        # Get API key from parameter, env var, or settings
        self.api_key = api_key or os.getenv(
            "OPENAI_API_KEY",
            settings.llm.openai_api_key
        )

        # Validate API key is present
        if not self.api_key:
            raise LLMProviderError(
                "OpenAI API key is required. Set OPENAI_API_KEY environment variable "
                "or provide api_key parameter."
            )

        # Get model configuration
        self.model_name = model_name or settings.llm.openai_model
        self.temperature = temperature if temperature is not None else settings.llm.openai_temperature
        self.max_tokens = max_tokens or settings.llm.openai_max_tokens

        self._client: Optional[BaseChatModel] = None
        self._init_error: Optional[str] = None

        # Initialize the client
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the LangChain OpenAI chat client."""
        try:
            logger.info(f"Initializing OpenAI LLM with model: {self.model_name}")

            from langchain_openai import ChatOpenAI

            self._client = ChatOpenAI(
                openai_api_key=self.api_key,
                model=self.model_name,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
            )

            logger.info(
                f"OpenAI LLM client initialized. "
                f"Model: {self.model_name}, Temperature: {self.temperature}, "
                f"Max tokens: {self.max_tokens}"
            )

        except ImportError as e:
            error_msg = "langchain-openai package not installed. Install with: pip install langchain-openai"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None
        except Exception as e:
            error_msg = f"Failed to initialize OpenAI LLM client: {str(e)}"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None

    @property
    def client(self) -> Optional[BaseChatModel]:
        """Get the LangChain chat model instance."""
        return self._client

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "openai"

    def is_ready(self) -> bool:
        """
        Check if the LLM service is ready for use.

        Returns:
            bool: True if client is initialized and ready, False otherwise
        """
        return self._client is not None

    def generate(
        self,
        messages: List[BaseMessage],
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from the LLM.

        Args:
            messages: List of LangChain message objects (SystemMessage, HumanMessage, etc.)
            **kwargs: Additional arguments passed to the underlying model

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If client is not initialized or generation fails
        """
        if not self.is_ready():
            if self._init_error:
                raise LLMProviderError(self._init_error)
            raise LLMProviderError("OpenAI LLM client not initialized")

        if not messages:
            raise LLMProviderError("Messages list cannot be empty")

        try:
            response = self._client.invoke(messages, **kwargs)
            return response.content
        except Exception as e:
            error_msg = f"Failed to generate OpenAI response: {str(e)}"
            logger.error(error_msg)
            raise LLMProviderError(error_msg)

    def generate_from_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from a simple text prompt.

        Args:
            prompt: The user prompt text
            system_prompt: Optional system prompt
            **kwargs: Additional arguments passed to generate()

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If generation fails
        """
        if not prompt or not isinstance(prompt, str):
            raise LLMProviderError("Prompt must be a non-empty string")

        messages: List[BaseMessage] = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))

        return self.generate(messages, **kwargs)

    def health_check(self) -> dict:
        """
        Perform a health check on the LLM service.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - provider: "openai"
                - model_name: Name of the model
                - temperature: Temperature setting
                - max_tokens: Max tokens setting
                - message: Description of the status
        """
        result: Dict[str, Any] = {
            "status": "error",
            "provider": "openai",
            "model_name": self.model_name,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "message": "Client not initialized",
        }

        if self._init_error:
            result["message"] = self._init_error
            return result

        if not self.is_ready():
            result["message"] = "OpenAI client not initialized"
            return result

        result["status"] = "ready"
        result["message"] = f"OpenAI LLM service ready with model {self.model_name}"
        return result


class AnthropicLLM:
    """
    Anthropic LLM service using LangChain's Anthropic chat integration.

    This class provides:
    - Anthropic Claude chat completion via LangChain
    - Support for Claude 3 and other Anthropic models
    - Configurable temperature and max tokens
    - API key validation
    - Error handling for API calls
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
        max_tokens: Optional[int] = None,
    ):
        """
        Initialize the Anthropic LLM service.

        Args:
            api_key: Anthropic API key. Falls back to ANTHROPIC_API_KEY env var or config.
            model_name: Anthropic model name. Defaults to config setting.
            temperature: Temperature for response generation. Defaults to config setting.
            max_tokens: Maximum tokens for responses. Defaults to config setting.

        Raises:
            LLMProviderError: If API key is not provided and not found in environment
        """
        settings = get_settings()

        # Get API key from parameter, env var, or settings
        self.api_key = api_key or os.getenv(
            "ANTHROPIC_API_KEY",
            settings.llm.anthropic_api_key
        )

        # Validate API key is present
        if not self.api_key:
            raise LLMProviderError(
                "Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable "
                "or provide api_key parameter."
            )

        # Get model configuration
        self.model_name = model_name or settings.llm.anthropic_model
        self.temperature = temperature if temperature is not None else settings.llm.anthropic_temperature
        self.max_tokens = max_tokens or settings.llm.anthropic_max_tokens
        self.base_url = settings.llm.anthropic_base_url

        self._client: Optional[BaseChatModel] = None
        self._init_error: Optional[str] = None

        # Initialize the client
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the LangChain Anthropic chat client."""
        try:
            logger.info(f"Initializing Anthropic LLM with model: {self.model_name}")

            from langchain_anthropic import ChatAnthropic

            kwargs = {
                "anthropic_api_key": self.api_key,
                "model": self.model_name,
                "temperature": self.temperature,
                "max_tokens": self.max_tokens,
            }
            if self.base_url:
                kwargs["anthropic_api_url"] = self.base_url

            self._client = ChatAnthropic(**kwargs)

            logger.info(
                f"Anthropic LLM client initialized. "
                f"Model: {self.model_name}, Temperature: {self.temperature}, "
                f"Max tokens: {self.max_tokens}"
            )

        except ImportError as e:
            error_msg = "langchain-anthropic package not installed. Install with: pip install langchain-anthropic"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None
        except Exception as e:
            error_msg = f"Failed to initialize Anthropic LLM client: {str(e)}"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None

    @property
    def client(self) -> Optional[BaseChatModel]:
        """Get the LangChain chat model instance."""
        return self._client

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "anthropic"

    def is_ready(self) -> bool:
        """
        Check if the LLM service is ready for use.

        Returns:
            bool: True if client is initialized and ready, False otherwise
        """
        return self._client is not None

    def generate(
        self,
        messages: List[BaseMessage],
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from the LLM.

        Args:
            messages: List of LangChain message objects (SystemMessage, HumanMessage, etc.)
            **kwargs: Additional arguments passed to the underlying model

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If client is not initialized or generation fails
        """
        if not self.is_ready():
            if self._init_error:
                raise LLMProviderError(self._init_error)
            raise LLMProviderError("Anthropic LLM client not initialized")

        if not messages:
            raise LLMProviderError("Messages list cannot be empty")

        try:
            response = self._client.invoke(messages, **kwargs)
            return response.content
        except Exception as e:
            error_msg = f"Failed to generate Anthropic response: {str(e)}"
            logger.error(error_msg)
            raise LLMProviderError(error_msg)

    def generate_from_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from a simple text prompt.

        Args:
            prompt: The user prompt text
            system_prompt: Optional system prompt
            **kwargs: Additional arguments passed to generate()

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If generation fails
        """
        if not prompt or not isinstance(prompt, str):
            raise LLMProviderError("Prompt must be a non-empty string")

        messages: List[BaseMessage] = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))

        return self.generate(messages, **kwargs)

    def health_check(self) -> dict:
        """
        Perform a health check on the LLM service.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - provider: "anthropic"
                - model_name: Name of the model
                - temperature: Temperature setting
                - max_tokens: Max tokens setting
                - message: Description of the status
        """
        result: Dict[str, Any] = {
            "status": "error",
            "provider": "anthropic",
            "model_name": self.model_name,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "message": "Client not initialized",
        }

        if self._init_error:
            result["message"] = self._init_error
            return result

        if not self.is_ready():
            result["message"] = "Anthropic client not initialized"
            return result

        result["status"] = "ready"
        result["message"] = f"Anthropic LLM service ready with model {self.model_name}"
        return result


class OllamaLLM:
    """
    Ollama LLM service using LangChain's Ollama integration.

    This class provides:
    - Ollama chat completion via LangChain
    - Support for locally running models (llama2, mistral, etc.)
    - Configurable base URL for Ollama server
    - Error handling for connection issues
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
    ):
        """
        Initialize the Ollama LLM service.

        Args:
            base_url: Ollama server base URL. Defaults to config setting.
            model_name: Model name. Defaults to config setting.
            temperature: Temperature for response generation. Defaults to config setting.

        Raises:
            LLMProviderError: If initialization fails
        """
        settings = get_settings()

        # Get configuration
        self.base_url = base_url or settings.llm.ollama_base_url
        self.model_name = model_name or settings.llm.ollama_model
        self.temperature = temperature if temperature is not None else settings.llm.ollama_temperature

        self._client: Optional[BaseChatModel] = None
        self._init_error: Optional[str] = None

        # Initialize the client
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the LangChain Ollama chat client."""
        try:
            logger.info(
                f"Initializing Ollama LLM with model: {self.model_name} "
                f"at {self.base_url}"
            )

            from langchain_community.chat_models import ChatOllama

            self._client = ChatOllama(
                base_url=self.base_url,
                model=self.model_name,
                temperature=self.temperature,
            )

            logger.info(
                f"Ollama LLM client initialized. "
                f"Model: {self.model_name}, Base URL: {self.base_url}, "
                f"Temperature: {self.temperature}"
            )

        except ImportError as e:
            error_msg = "langchain-community package not installed. Install with: pip install langchain-community"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None
        except Exception as e:
            error_msg = f"Failed to initialize Ollama LLM client: {str(e)}"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None

    @property
    def client(self) -> Optional[BaseChatModel]:
        """Get the LangChain chat model instance."""
        return self._client

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "ollama"

    def is_ready(self) -> bool:
        """
        Check if the LLM service is ready for use.

        Returns:
            bool: True if client is initialized and ready, False otherwise
        """
        return self._client is not None

    def generate(
        self,
        messages: List[BaseMessage],
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from the LLM.

        Args:
            messages: List of LangChain message objects
            **kwargs: Additional arguments passed to the underlying model

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If client is not initialized or generation fails
        """
        if not self.is_ready():
            if self._init_error:
                raise LLMProviderError(self._init_error)
            raise LLMProviderError("Ollama LLM client not initialized")

        if not messages:
            raise LLMProviderError("Messages list cannot be empty")

        try:
            response = self._client.invoke(messages, **kwargs)
            return response.content
        except Exception as e:
            error_msg = f"Failed to generate Ollama response: {str(e)}"
            logger.error(error_msg)
            raise LLMProviderError(error_msg)

    def generate_from_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from a simple text prompt.

        Args:
            prompt: The user prompt text
            system_prompt: Optional system prompt
            **kwargs: Additional arguments passed to generate()

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If generation fails
        """
        if not prompt or not isinstance(prompt, str):
            raise LLMProviderError("Prompt must be a non-empty string")

        messages: List[BaseMessage] = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))

        return self.generate(messages, **kwargs)

    def health_check(self) -> dict:
        """
        Perform a health check on the LLM service.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - provider: "ollama"
                - model_name: Name of the model
                - base_url: Base URL of the Ollama server
                - temperature: Temperature setting
                - message: Description of the status
        """
        result: Dict[str, Any] = {
            "status": "error",
            "provider": "ollama",
            "model_name": self.model_name,
            "base_url": self.base_url,
            "temperature": self.temperature,
            "message": "Client not initialized",
        }

        if self._init_error:
            result["message"] = self._init_error
            return result

        if not self.is_ready():
            result["message"] = "Ollama client not initialized"
            return result

        result["status"] = "ready"
        result["message"] = f"Ollama LLM service ready with model {self.model_name} at {self.base_url}"
        return result


class LMStudioLLM:
    """
    LM Studio LLM service using LangChain's OpenAI-compatible integration.

    This class provides:
    - LM Studio chat completion via OpenAI-compatible API
    - Support for locally running models
    - Configurable base URL for LM Studio server
    - Error handling for connection issues
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        model_name: Optional[str] = None,
        temperature: Optional[float] = None,
    ):
        """
        Initialize the LM Studio LLM service.

        Args:
            base_url: LM Studio server base URL. Defaults to config setting.
            model_name: Model name/identifier. Defaults to config setting.
            temperature: Temperature for response generation. Defaults to config setting.

        Raises:
            LLMProviderError: If initialization fails
        """
        settings = get_settings()

        # Get configuration
        self.base_url = base_url or settings.llm.lmstudio_base_url
        self.model_name = model_name or settings.llm.lmstudio_model
        self.temperature = temperature if temperature is not None else settings.llm.lmstudio_temperature

        self._client: Optional[BaseChatModel] = None
        self._init_error: Optional[str] = None

        # Initialize the client
        self._initialize_client()

    def _initialize_client(self) -> None:
        """Initialize the LangChain LM Studio chat client (OpenAI-compatible)."""
        try:
            logger.info(
                f"Initializing LM Studio LLM with model: {self.model_name} "
                f"at {self.base_url}"
            )

            from langchain_openai import ChatOpenAI

            # LM Studio uses an OpenAI-compatible API
            # Ensure the URL has the /v1 suffix for compatibility
            api_base = self.base_url
            if not api_base.endswith("/v1"):
                api_base = f"{api_base}/v1"

            self._client = ChatOpenAI(
                openai_api_key="lm-studio",  # LM Studio doesn't require a real key
                openai_api_base=api_base,
                model=self.model_name,
                temperature=self.temperature,
            )

            logger.info(
                f"LM Studio LLM client initialized. "
                f"Model: {self.model_name}, Base URL: {self.base_url}, "
                f"Temperature: {self.temperature}"
            )

        except ImportError as e:
            error_msg = "langchain-openai package not installed. Install with: pip install langchain-openai"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None
        except Exception as e:
            error_msg = f"Failed to initialize LM Studio LLM client: {str(e)}"
            logger.error(error_msg)
            self._init_error = error_msg
            self._client = None

    @property
    def client(self) -> Optional[BaseChatModel]:
        """Get the LangChain chat model instance."""
        return self._client

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "lmstudio"

    def is_ready(self) -> bool:
        """
        Check if the LLM service is ready for use.

        Returns:
            bool: True if client is initialized and ready, False otherwise
        """
        return self._client is not None

    def generate(
        self,
        messages: List[BaseMessage],
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from the LLM.

        Args:
            messages: List of LangChain message objects
            **kwargs: Additional arguments passed to the underlying model

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If client is not initialized or generation fails
        """
        if not self.is_ready():
            if self._init_error:
                raise LLMProviderError(self._init_error)
            raise LLMProviderError("LM Studio LLM client not initialized")

        if not messages:
            raise LLMProviderError("Messages list cannot be empty")

        try:
            response = self._client.invoke(messages, **kwargs)
            return response.content
        except Exception as e:
            error_msg = f"Failed to generate LM Studio response: {str(e)}"
            logger.error(error_msg)
            raise LLMProviderError(error_msg)

    def generate_from_text(
        self,
        prompt: str,
        system_prompt: Optional[str] = None,
        **kwargs: Any,
    ) -> str:
        """
        Generate a response from a simple text prompt.

        Args:
            prompt: The user prompt text
            system_prompt: Optional system prompt
            **kwargs: Additional arguments passed to generate()

        Returns:
            str: The generated response text

        Raises:
            LLMProviderError: If generation fails
        """
        if not prompt or not isinstance(prompt, str):
            raise LLMProviderError("Prompt must be a non-empty string")

        messages: List[BaseMessage] = []
        if system_prompt:
            messages.append(SystemMessage(content=system_prompt))
        messages.append(HumanMessage(content=prompt))

        return self.generate(messages, **kwargs)

    def health_check(self) -> dict:
        """
        Perform a health check on the LLM service.

        Returns:
            dict with keys:
                - status: "ready" or "error"
                - provider: "lmstudio"
                - model_name: Name of the model
                - base_url: Base URL of the LM Studio server
                - temperature: Temperature setting
                - message: Description of the status
        """
        result: Dict[str, Any] = {
            "status": "error",
            "provider": "lmstudio",
            "model_name": self.model_name,
            "base_url": self.base_url,
            "temperature": self.temperature,
            "message": "Client not initialized",
        }

        if self._init_error:
            result["message"] = self._init_error
            return result

        if not self.is_ready():
            result["message"] = "LM Studio client not initialized"
            return result

        result["status"] = "ready"
        result["message"] = f"LM Studio LLM service ready with model {self.model_name} at {self.base_url}"
        return result


def create_llm(
    provider: Optional[Union[str, LLMProvider]] = None,
    **kwargs: Any,
) -> Union[OpenAILLM, AnthropicLLM, OllamaLLM, LMStudioLLM]:
    """
    Factory function to create an LLM provider instance based on configuration.

    This is the main entry point for creating LLM instances. It supports
    multiple providers (OpenAI, Anthropic, Ollama, LM Studio) and returns
    the appropriate instance based on the provider parameter.

    Args:
        provider: LLM provider to use ('openai', 'anthropic', 'ollama', 'lmstudio',
                 or LLMProvider enum). Defaults to config setting (LLM_PROVIDER env var).
        **kwargs: Additional arguments passed to the provider constructor:
                 - For OpenAI: api_key, model_name, temperature, max_tokens
                 - For Anthropic: api_key, model_name, temperature, max_tokens
                 - For Ollama: base_url, model_name, temperature
                 - For LM Studio: base_url, model_name, temperature

    Returns:
        Union[OpenAILLM, AnthropicLLM, OllamaLLM, LMStudioLLM]:
            LLM provider instance based on the requested provider

    Raises:
        LLMProviderError: If provider is invalid or initialization fails

    Example:
        >>> # Create OpenAI LLM
        >>> llm = create_llm(provider='openai', api_key='sk-...')
        >>> response = llm.generate_from_text("Hello, world!")
        >>>
        >>> # Create Anthropic LLM
        >>> llm = create_llm(provider='anthropic', api_key='sk-ant-...')
        >>>
        >>> # Create Ollama LLM
        >>> llm = create_llm(provider='ollama', base_url='http://localhost:11434')
        >>>
        >>> # Use default provider from config
        >>> llm = create_llm()
    """
    settings = get_settings()

    # Get provider from parameter or config
    if provider is None:
        provider = settings.llm.provider

    # Convert string to enum if needed
    if isinstance(provider, str):
        try:
            provider = LLMProvider(provider.lower())
        except ValueError:
            valid_providers = [p.value for p in LLMProvider]
            raise LLMProviderError(
                f"Invalid LLM provider '{provider}'. "
                f"Must be one of: {valid_providers}"
            )

    # Create LLM based on provider
    if provider == LLMProvider.OPENAI:
        logger.info("Creating OpenAI LLM provider")
        return OpenAILLM(**kwargs)
    elif provider == LLMProvider.ANTHROPIC:
        logger.info("Creating Anthropic LLM provider")
        return AnthropicLLM(**kwargs)
    elif provider == LLMProvider.OLLAMA:
        logger.info("Creating Ollama LLM provider")
        return OllamaLLM(**kwargs)
    elif provider == LLMProvider.LMSTUDIO:
        logger.info("Creating LM Studio LLM provider")
        return LMStudioLLM(**kwargs)
    else:
        valid_providers = [p.value for p in LLMProvider]
        raise LLMProviderError(
            f"Unsupported LLM provider '{provider.value}'. "
            f"Must be one of: {valid_providers}"
        )


# Global instance for convenience
_llm_instance: Optional[Union[OpenAILLM, AnthropicLLM, OllamaLLM, LMStudioLLM]] = None


def get_llm() -> Union[OpenAILLM, AnthropicLLM, OllamaLLM, LMStudioLLM]:
    """
    Get the global LLM instance.

    Returns the cached global LLM instance, creating it from config
    if it does not yet exist.

    Returns:
        LLM provider instance based on current config
    """
    global _llm_instance
    if _llm_instance is None:
        _llm_instance = create_llm()
    return _llm_instance


def check_llm_health() -> dict:
    """
    Check LLM service health status.

    This is a convenience function that gets the global
    LLM instance and performs a health check.

    Returns:
        dict with health status information
    """
    try:
        llm = get_llm()
        return llm.health_check()
    except LLMProviderError as e:
        return {
            "status": "error",
            "provider": "unknown",
            "message": f"LLM provider error: {str(e)}",
        }
    except Exception as e:
        return {
            "status": "error",
            "provider": "unknown",
            "message": f"Unexpected error: {str(e)}",
        }


__all__ = [
    "OpenAILLM",
    "AnthropicLLM",
    "OllamaLLM",
    "LMStudioLLM",
    "LLMProviderError",
    "create_llm",
    "get_llm",
    "check_llm_health",
]
