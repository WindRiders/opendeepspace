"""
Tests for DeepSpace error handling system.
"""
import pytest
from core.errors import (
    ErrorCode, DeepSpaceError, ConfigError, LLMError, StorageError,
    GraphError, ExecutionError, MemoryError,
    config_not_found, api_key_missing, llm_timeout, llm_connection_failed,
    db_connection_failed, memory_not_found, exec_safety_blocked, exec_timeout,
)


class TestErrorCode:
    """Test ErrorCode enumeration."""

    def test_all_codes_have_meaningful_values(self):
        for code in ErrorCode:
            assert code.value, f"Empty value for {code}"
            assert "_" in code.value or code.value.isupper()

    def test_categories_are_distinct(self):
        config_codes = {c.value for c in ErrorCode if c.value.startswith("CONFIG")}
        llm_codes = {c.value for c in ErrorCode if c.value.startswith("LLM")}
        db_codes = {c.value for c in ErrorCode if c.value.startswith("DB")}
        graph_codes = {c.value for c in ErrorCode if c.value.startswith("GRAPH")}
        exec_codes = {c.value for c in ErrorCode if c.value.startswith("EXEC")}

        assert len(config_codes) >= 2
        assert len(llm_codes) >= 4
        assert len(db_codes) >= 4
        assert len(graph_codes) >= 3
        assert len(exec_codes) >= 4


class TestDeepSpaceError:
    """Test the base error class."""

    def test_error_creation(self):
        e = DeepSpaceError(ErrorCode.INTERNAL_ERROR, "something went wrong")
        assert e.code == ErrorCode.INTERNAL_ERROR
        assert e.message == "something went wrong"
        assert str(e).startswith("[INTERNAL_ERROR]")

    def test_error_with_details(self):
        e = DeepSpaceError(ErrorCode.VALIDATION_ERROR, "bad input", {"field": "name"})
        assert e.details == {"field": "name"}

    def test_error_with_cause(self):
        cause = ValueError("root")
        e = DeepSpaceError(ErrorCode.INTERNAL_ERROR, "wrapper", cause=cause)
        assert e.cause is cause

    def test_to_dict(self):
        e = DeepSpaceError(ErrorCode.API_KEY_MISSING, "no key", {"hint": "set env"})
        d = e.to_dict()
        assert d["error"] is True
        assert d["code"] == "API_KEY_MISSING"
        assert d["message"] == "no key"
        assert d["details"] == {"hint": "set env"}


class TestConvenienceConstructors:
    """Test convenience factory functions."""

    def test_config_not_found(self):
        e = config_not_found("/tmp/conf.yaml")
        assert isinstance(e, ConfigError)
        assert e.code == ErrorCode.CONFIG_NOT_FOUND

    def test_api_key_missing(self):
        e = api_key_missing()
        assert isinstance(e, ConfigError)
        assert e.code == ErrorCode.API_KEY_MISSING

    def test_llm_timeout(self):
        e = llm_timeout(30)
        assert isinstance(e, LLMError)
        assert e.code == ErrorCode.LLM_TIMEOUT

    def test_llm_connection_failed(self):
        cause = ConnectionError("refused")
        e = llm_connection_failed(cause)
        assert isinstance(e, LLMError)
        assert e.cause is cause

    def test_db_connection_failed(self):
        e = db_connection_failed()
        assert isinstance(e, StorageError)
        assert e.code == ErrorCode.DB_CONNECTION_FAILED

    def test_memory_not_found(self):
        e = memory_not_found("abc123")
        assert isinstance(e, MemoryError)
        assert e.code == ErrorCode.MEMORY_NOT_FOUND

    def test_exec_safety_blocked(self):
        e = exec_safety_blocked("rm -rf /")
        assert isinstance(e, ExecutionError)
        assert e.code == ErrorCode.EXEC_SAFETY_BLOCKED

    def test_exec_timeout(self):
        e = exec_timeout(60)
        assert isinstance(e, ExecutionError)
        assert e.code == ErrorCode.EXEC_TIMEOUT


class TestExceptionHierarchy:
    """Test the exception class hierarchy."""

    def test_all_subclasses(self):
        assert issubclass(ConfigError, DeepSpaceError)
        assert issubclass(LLMError, DeepSpaceError)
        assert issubclass(StorageError, DeepSpaceError)
        assert issubclass(GraphError, DeepSpaceError)
        assert issubclass(ExecutionError, DeepSpaceError)
        assert issubclass(MemoryError, DeepSpaceError)

    def test_is_exception(self):
        assert issubclass(DeepSpaceError, Exception)

    def test_catchability(self):
        """All subclasses should be catchable by the base class."""
        errors = [
            ConfigError(ErrorCode.CONFIG_INVALID, ""),
            LLMError(ErrorCode.LLM_TIMEOUT, ""),
            StorageError(ErrorCode.DB_QUERY_FAILED, ""),
            GraphError(ErrorCode.GRAPH_CONSTRAINT_FAILED, ""),
            ExecutionError(ErrorCode.EXEC_COMMAND_FAILED, ""),
            MemoryError(ErrorCode.MEMORY_NOT_FOUND, ""),
        ]
        for e in errors:
            try:
                raise e
            except DeepSpaceError:
                pass  # Caught correctly
            except Exception:
                pytest.fail(f"{type(e).__name__} not caught by DeepSpaceError")