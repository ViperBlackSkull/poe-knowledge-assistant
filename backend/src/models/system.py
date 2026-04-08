"""
System models for API responses and error handling.
Provides standard response wrappers and error models.
"""
from datetime import datetime
from typing import Any, Dict, Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field


# Generic type for API response data
T = TypeVar("T")


class HealthStatus(BaseModel):
    """
    Health check response model.

    Attributes:
        status: Overall health status (healthy/unhealthy)
        version: Application version
        timestamp: Current timestamp
        services: Status of individual services
    """
    status: str = Field(
        ...,
        description="Overall health status"
    )
    version: str = Field(
        ...,
        description="Application version"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Current timestamp"
    )
    services: Dict[str, str] = Field(
        default_factory=dict,
        description="Status of individual services"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "status": "healthy",
                    "version": "1.0.0",
                    "timestamp": "2024-01-15T10:30:00Z",
                    "services": {
                        "database": "connected",
                        "chromadb": "connected",
                        "llm": "ready"
                    }
                }
            ]
        }
    }


class APIResponse(BaseModel, Generic[T]):
    """
    Standard API response wrapper.

    Provides a consistent response format for all API endpoints.

    Attributes:
        success: Whether the request was successful
        data: Response data (if successful)
        message: Human-readable message
        timestamp: Response timestamp
    """
    success: bool = Field(
        ...,
        description="Whether the request was successful"
    )
    data: Optional[T] = Field(
        default=None,
        description="Response data"
    )
    message: str = Field(
        ...,
        description="Human-readable message"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "success": True,
                    "data": {"key": "value"},
                    "message": "Operation completed successfully",
                    "timestamp": "2024-01-15T10:30:00Z"
                }
            ]
        }
    }


class ErrorDetail(BaseModel):
    """
    Detailed error information.

    Attributes:
        field: Field that caused the error (if applicable)
        message: Error message
        code: Error code
    """
    field: Optional[str] = Field(
        default=None,
        description="Field that caused the error"
    )
    message: str = Field(
        ...,
        description="Error message"
    )
    code: Optional[str] = Field(
        default=None,
        description="Error code"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "field": "message",
                    "message": "Message cannot be empty",
                    "code": "VALIDATION_ERROR"
                }
            ]
        }
    }


class ValidationError(BaseModel):
    """
    Validation error response model.

    Attributes:
        type: Error type identifier
        title: Human-readable error title
        status: HTTP status code
        detail: Detailed error message
        errors: List of specific validation errors
        timestamp: When the error occurred
    """
    type: str = Field(
        default="validation_error",
        description="Error type identifier"
    )
    title: str = Field(
        default="Validation Error",
        description="Human-readable error title"
    )
    status: int = Field(
        default=422,
        description="HTTP status code"
    )
    detail: str = Field(
        ...,
        description="Detailed error message"
    )
    errors: List[ErrorDetail] = Field(
        default_factory=list,
        description="List of validation errors"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the error occurred"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "type": "validation_error",
                    "title": "Validation Error",
                    "status": 422,
                    "detail": "Request validation failed",
                    "errors": [
                        {
                            "field": "message",
                            "message": "Message cannot be empty",
                            "code": "REQUIRED_FIELD"
                        }
                    ],
                    "timestamp": "2024-01-15T10:30:00Z"
                }
            ]
        }
    }


class APIError(BaseModel):
    """
    General API error response model.

    Attributes:
        type: Error type identifier
        title: Human-readable error title
        status: HTTP status code
        detail: Detailed error message
        instance: Request path that caused the error
        timestamp: When the error occurred
        additional_info: Additional error context
    """
    type: str = Field(
        default="api_error",
        description="Error type identifier"
    )
    title: str = Field(
        ...,
        description="Human-readable error title"
    )
    status: int = Field(
        ...,
        description="HTTP status code"
    )
    detail: str = Field(
        ...,
        description="Detailed error message"
    )
    instance: Optional[str] = Field(
        default=None,
        description="Request path that caused the error"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="When the error occurred"
    )
    additional_info: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Additional error context"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "type": "api_error",
                    "title": "Not Found",
                    "status": 404,
                    "detail": "Resource not found",
                    "instance": "/api/chat/conv-123",
                    "timestamp": "2024-01-15T10:30:00Z",
                    "additional_info": None
                }
            ]
        }
    }


class ErrorResponse(BaseModel):
    """
    Standard error response wrapper.

    Attributes:
        success: Always False for errors
        error: Error details
        timestamp: Response timestamp
    """
    success: bool = Field(
        default=False,
        description="Always False for error responses"
    )
    error: APIError = Field(
        ...,
        description="Error details"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "success": False,
                    "error": {
                        "type": "api_error",
                        "title": "Internal Server Error",
                        "status": 500,
                        "detail": "An unexpected error occurred",
                        "timestamp": "2024-01-15T10:30:00Z"
                    },
                    "timestamp": "2024-01-15T10:30:00Z"
                }
            ]
        }
    }


class PaginatedResponse(BaseModel, Generic[T]):
    """
    Paginated response wrapper for list endpoints.

    Attributes:
        success: Whether the request was successful
        data: List of items
        total: Total number of items available
        page: Current page number
        page_size: Number of items per page
        total_pages: Total number of pages
        message: Human-readable message
        timestamp: Response timestamp
    """
    success: bool = Field(
        default=True,
        description="Whether the request was successful"
    )
    data: List[T] = Field(
        default_factory=list,
        description="List of items"
    )
    total: int = Field(
        ...,
        description="Total number of items available",
        ge=0
    )
    page: int = Field(
        ...,
        description="Current page number",
        ge=1
    )
    page_size: int = Field(
        ...,
        description="Number of items per page",
        ge=1,
        le=100
    )
    total_pages: int = Field(
        ...,
        description="Total number of pages",
        ge=0
    )
    message: str = Field(
        default="Results retrieved successfully",
        description="Human-readable message"
    )
    timestamp: datetime = Field(
        default_factory=datetime.utcnow,
        description="Response timestamp"
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "success": True,
                    "data": [{"id": 1}, {"id": 2}],
                    "total": 100,
                    "page": 1,
                    "page_size": 10,
                    "total_pages": 10,
                    "message": "Results retrieved successfully",
                    "timestamp": "2024-01-15T10:30:00Z"
                }
            ]
        }
    }


__all__ = [
    "HealthStatus",
    "APIResponse",
    "ErrorDetail",
    "ValidationError",
    "APIError",
    "ErrorResponse",
    "PaginatedResponse",
]
