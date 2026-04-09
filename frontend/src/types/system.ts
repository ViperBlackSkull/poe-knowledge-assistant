/**
 * System types for API responses, error handling, and pagination.
 * Mirrors backend Pydantic models from backend/src/models/system.py
 */

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Health check response model.
 *
 * Backend model: HealthStatus (system.py)
 */
export interface HealthStatus {
  /** Overall health status ("healthy" or "unhealthy") */
  status: string;
  /** Application version */
  version: string;
  /** ISO 8601 timestamp of the health check */
  timestamp: string;
  /** Status of individual services (e.g., { database: "connected" }) */
  services: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Generic response wrappers
// ---------------------------------------------------------------------------

/**
 * Standard API response wrapper.
 *
 * Backend model: APIResponse[T] (system.py)
 *
 * The generic parameter `T` represents the shape of the `data` payload.
 * When `success` is false, `data` will typically be null.
 */
export interface APIResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (present when successful) */
  data: T | null;
  /** Human-readable message */
  message: string;
  /** ISO 8601 response timestamp */
  timestamp: string;
}

/**
 * Paginated response wrapper for list endpoints.
 *
 * Backend model: PaginatedResponse[T] (system.py)
 */
export interface PaginatedResponse<T = unknown> {
  /** Whether the request was successful */
  success: boolean;
  /** List of items for the current page */
  data: T[];
  /** Total number of items available */
  total: number;
  /** Current page number (>= 1) */
  page: number;
  /** Number of items per page (1 - 100) */
  page_size: number;
  /** Total number of pages (>= 0) */
  total_pages: number;
  /** Human-readable message */
  message: string;
  /** ISO 8601 response timestamp */
  timestamp: string;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

/**
 * Detailed error information for a single field.
 *
 * Backend model: ErrorDetail (system.py)
 */
export interface ErrorDetail {
  /** Field that caused the error (if applicable) */
  field?: string | null;
  /** Error message */
  message: string;
  /** Error code (e.g., "VALIDATION_ERROR") */
  code?: string | null;
}

/**
 * Validation error response model.
 *
 * Backend model: ValidationError (system.py)
 */
export interface ValidationError {
  /** Error type identifier */
  type: string;
  /** Human-readable error title */
  title: string;
  /** HTTP status code (default 422) */
  status: number;
  /** Detailed error message */
  detail: string;
  /** List of specific validation errors */
  errors: ErrorDetail[];
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
}

/**
 * General API error response model.
 *
 * Backend model: APIError (system.py)
 */
export interface APIError {
  /** Error type identifier */
  type: string;
  /** Human-readable error title */
  title: string;
  /** HTTP status code */
  status: number;
  /** Detailed error message */
  detail: string;
  /** Request path that caused the error */
  instance?: string | null;
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
  /** Additional error context */
  additional_info?: Record<string, unknown> | null;
}

/**
 * Standard error response wrapper.
 *
 * Backend model: ErrorResponse (system.py)
 */
export interface ErrorResponse {
  /** Always false for error responses */
  success: false;
  /** Error details */
  error: APIError;
  /** ISO 8601 response timestamp */
  timestamp: string;
}
