"""
DeepSpace Error Handling — standardized error codes and custom exceptions.

All DeepSpace modules should use these instead of bare strings/exceptions.
This makes error handling predictable, testable, and user-friendly.
"""
from __future__ import annotations

from enum import Enum
from typing import Optional


class ErrorCode(str, Enum):
    """Standard error codes for all DeepSpace operations."""

    # ── Configuration ──
    CONFIG_NOT_FOUND = "CONFIG_NOT_FOUND"
    CONFIG_INVALID = "CONFIG_INVALID"
    API_KEY_MISSING = "API_KEY_MISSING"
    API_KEY_INVALID = "API_KEY_INVALID"

    # ── LLM ──
    LLM_CONNECTION_FAILED = "LLM_CONNECTION_FAILED"
    LLM_RATE_LIMITED = "LLM_RATE_LIMITED"
    LLM_TIMEOUT = "LLM_TIMEOUT"
    LLM_INVALID_RESPONSE = "LLM_INVALID_RESPONSE"
    LLM_EMBEDDING_FAILED = "LLM_EMBEDDING_FAILED"

    # ── Storage ──
    DB_CONNECTION_FAILED = "DB_CONNECTION_FAILED"
    DB_SCHEMA_INIT_FAILED = "DB_SCHEMA_INIT_FAILED"
    DB_QUERY_FAILED = "DB_QUERY_FAILED"
    DB_WRITE_FAILED = "DB_WRITE_FAILED"
    DB_NOT_FOUND = "DB_NOT_FOUND"

    # ── Knowledge Graph ──
    GRAPH_CONNECTION_FAILED = "GRAPH_CONNECTION_FAILED"
    GRAPH_ENTITY_NOT_FOUND = "GRAPH_ENTITY_NOT_FOUND"
    GRAPH_CONSTRAINT_FAILED = "GRAPH_CONSTRAINT_FAILED"
    GRAPH_RELATION_FAILED = "GRAPH_RELATION_FAILED"

    # ── Execution ──
    EXEC_SAFETY_BLOCKED = "EXEC_SAFETY_BLOCKED"
    EXEC_TIMEOUT = "EXEC_TIMEOUT"
    EXEC_COMMAND_FAILED = "EXEC_COMMAND_FAILED"
    EXEC_APPROVAL_REQUIRED = "EXEC_APPROVAL_REQUIRED"
    EXEC_RECOVERY_FAILED = "EXEC_RECOVERY_FAILED"

    # ── Memory ──
    MEMORY_NOT_FOUND = "MEMORY_NOT_FOUND"
    MEMORY_IMPORT_FAILED = "MEMORY_IMPORT_FAILED"
    MEMORY_EXPORT_FAILED = "MEMORY_EXPORT_FAILED"

    # ── General ──
    INTERNAL_ERROR = "INTERNAL_ERROR"
    NOT_IMPLEMENTED = "NOT_IMPLEMENTED"
    VALIDATION_ERROR = "VALIDATION_ERROR"
    TIMEOUT = "TIMEOUT"


class DeepSpaceError(Exception):
    """Base exception for all DeepSpace errors."""

    def __init__(
        self,
        code: ErrorCode,
        message: str = "",
        details: Optional[dict] = None,
        cause: Optional[Exception] = None,
    ):
        self.code = code
        self.message = message or code.value
        self.details = details or {}
        self.cause = cause
        super().__init__(self._format())

    def _format(self) -> str:
        parts = [f"[{self.code.value}] {self.message}"]
        if self.details:
            parts.append(f"  details={self.details}")
        if self.cause:
            parts.append(f"  caused by: {type(self.cause).__name__}: {self.cause}")
        return "\n".join(parts)

    def to_dict(self) -> dict:
        """Serialize error for API responses."""
        return {
            "error": True,
            "code": self.code.value,
            "message": self.message,
            "details": self.details,
        }


# ── Specific Exception Classes ──


class ConfigError(DeepSpaceError):
    """Configuration-related errors."""
    pass


class LLMError(DeepSpaceError):
    """LLM API interaction errors."""
    pass


class StorageError(DeepSpaceError):
    """Database/storage errors."""
    pass


class GraphError(DeepSpaceError):
    """Knowledge graph errors."""
    pass


class ExecutionError(DeepSpaceError):
    """Command execution errors."""
    pass


class MemoryError(DeepSpaceError):
    """Memory operations errors."""
    pass


# ── Convenience constructors ──


def config_not_found(path: str) -> ConfigError:
    return ConfigError(ErrorCode.CONFIG_NOT_FOUND, f"Config file not found: {path}")

def api_key_missing() -> ConfigError:
    return ConfigError(ErrorCode.API_KEY_MISSING, "API key not configured. Set DASHSCOPE_API_KEY env var.")

def llm_timeout(seconds: int, cause: Optional[Exception] = None) -> LLMError:
    return LLMError(ErrorCode.LLM_TIMEOUT, f"LLM request timed out after {seconds}s", cause=cause)

def llm_connection_failed(cause: Optional[Exception] = None) -> LLMError:
    return LLMError(ErrorCode.LLM_CONNECTION_FAILED, "Failed to connect to LLM API", cause=cause)

def db_connection_failed(cause: Optional[Exception] = None) -> StorageError:
    return StorageError(ErrorCode.DB_CONNECTION_FAILED, "Database connection failed", cause=cause)

def memory_not_found(memory_id: str) -> MemoryError:
    return MemoryError(ErrorCode.MEMORY_NOT_FOUND, f"Memory not found: {memory_id}")

def exec_safety_blocked(reason: str) -> ExecutionError:
    return ExecutionError(ErrorCode.EXEC_SAFETY_BLOCKED, f"Command blocked by safety: {reason}")

def exec_timeout(seconds: int) -> ExecutionError:
    return ExecutionError(ErrorCode.EXEC_TIMEOUT, f"Command timed out after {seconds}s")