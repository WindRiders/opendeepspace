"""
Tests for ModelRouter failover and load balancing.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from core.model_router import ModelRouter, ModelProvider


@pytest.fixture
def single_provider_config():
    return {
        "llm": {
            "base_url": "https://test.api.com/v1",
            "api_key": "sk-test",
            "models": {"primary": "model-a", "light": "model-b", "embedding": "model-c"},
        },
        "fallback_providers": [],
    }


@pytest.fixture
def multi_provider_config():
    return {
        "llm": {
            "base_url": "https://primary.api.com/v1",
            "api_key": "sk-primary",
            "models": {"primary": "model-a", "light": "model-b", "embedding": "model-c"},
        },
        "fallback_providers": [
            {
                "name": "backup-1",
                "base_url": "https://backup.api.com/v1",
                "api_key": "sk-backup",
                "models": ["model-x", "model-y"],
                "weight": 2,
            },
        ],
    }


class TestModelProvider:
    def test_provider_attributes(self):
        p = ModelProvider(name="test", base_url="url", api_key="key", models=["a", "b", "c"])
        assert p.name == "test"
        assert p.primary_model == "a"
        assert p.light_model == "b"
        assert p.embedding_model == "c"
        assert p.healthy is True
        assert p.failure_rate == 0.0

    def test_provider_single_model(self):
        p = ModelProvider(name="test", base_url="url", api_key="key", models=["only"])
        assert p.primary_model == "only"
        assert p.light_model == "only"
        assert p.embedding_model == "only"


class TestModelRouterInit:
    def test_single_provider(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        assert len(router.providers) == 1
        assert router.providers[0].name == "primary"

    def test_multi_provider(self, multi_provider_config):
        router = ModelRouter(multi_provider_config)
        assert len(router.providers) == 2
        assert router.providers[1].name == "backup-1"
        assert router.providers[1].weight == 2

    def test_get_provider(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        p = router.get_provider()
        assert p is not None
        assert p.name == "primary"

    def test_get_model(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        provider, model = router.get_model("primary")
        assert model == "model-a"

        provider, model = router.get_model("light")
        assert model == "model-b"


class TestFailureTracking:
    def test_record_success_resets_consecutive(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        p = router.providers[0]
        p.failures = 2
        import asyncio
        asyncio.run(router.record_success(p))
        assert p.failures == 0
        assert p.total_calls == 1
        assert p.healthy is True

    def test_record_failure_marks_unhealthy(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        p = router.providers[0]
        import asyncio
        # 3 consecutive failures should mark unhealthy
        for _ in range(3):
            asyncio.run(router.record_failure(p, Exception("test")))
        assert p.healthy is False
        assert p.failures == 3

    def test_get_healthy_excludes_down(self, multi_provider_config):
        router = ModelRouter(multi_provider_config)
        router.providers[0].healthy = False
        healthy = router._get_healthy_providers()
        assert len(healthy) == 1
        assert healthy[0].name == "backup-1"


class TestStatus:
    def test_status_dict(self, single_provider_config):
        router = ModelRouter(single_provider_config)
        st = router.status
        assert st["total_providers"] == 1
        assert st["healthy_providers"] == 1


class TestCallWithFailover:
    """Test the failover call mechanism."""

    def test_call_first_provider_succeeds(self):
        router = ModelRouter({"llm": {"base_url": "https://t.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}}})
        call_fn = AsyncMock(return_value="success")
        with patch('openai.AsyncOpenAI'):
            result, provider = asyncio.run(router.call_with_failover(call_fn))
        assert result == "success"
        assert provider.name == "primary"
        assert provider.total_calls == 1

    def test_call_fallback_on_primary_failure(self):
        config = {
            "llm": {"base_url": "https://p.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}},
            "fallback_providers": [{"name": "backup", "base_url": "https://b.api.com/v1", "api_key": "sk", "models": ["mx"]}],
        }
        router = ModelRouter(config)
        call_count = 0

        async def call_fn(_client, _model):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Primary failed")
            return "backup_result"

        with patch('openai.AsyncOpenAI'):
            result, provider = asyncio.run(router.call_with_failover(call_fn))
        assert result == "backup_result"
        assert provider.name == "backup"
        # Primary has 1 failure but still healthy (needs 3 consecutive)
        assert router.providers[0].failures == 1
        assert router.providers[1].total_calls == 1

    def test_call_all_providers_fail_raises_error(self):
        router = ModelRouter({"llm": {"base_url": "https://t.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}}})

        async def call_fn(_client, _model):
            raise Exception("Always fail")

        from core.errors import LLMError
        with patch('openai.AsyncOpenAI'):
            with pytest.raises(LLMError):
                asyncio.run(router.call_with_failover(call_fn))

    def test_call_records_success_after_failure(self):
        config = {
            "llm": {"base_url": "https://p.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}},
            "fallback_providers": [{"name": "backup", "base_url": "https://b.api.com/v1", "api_key": "sk", "models": ["mx"]}],
        }
        router = ModelRouter(config)
        call_count = 0

        async def call_fn(_client, _model):
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                raise Exception("Primary failed")
            return "ok"

        with patch('openai.AsyncOpenAI'):
            result, provider = asyncio.run(router.call_with_failover(call_fn))
        assert result == "ok"
        assert provider.failures == 0


class TestHealthCheck:
    """Test health check mechanism."""

    def test_health_check_restores_provider(self):
        router = ModelRouter({"llm": {"base_url": "https://t.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}}})
        p = router.providers[0]
        p.healthy = False
        p.failures = 5

        with patch('openai.AsyncOpenAI') as mock_openai:
            mock_client = MagicMock()
            mock_client.models = MagicMock()
            mock_client.models.list = AsyncMock()
            mock_openai.return_value = mock_client
            asyncio.run(router.health_check())

        assert p.healthy is True
        assert p.failures == 0

    def test_health_check_keeps_unhealthy_on_failure(self):
        router = ModelRouter({"llm": {"base_url": "https://t.api.com/v1", "api_key": "sk", "models": {"primary": "m1"}}})
        p = router.providers[0]
        p.healthy = False
        p.failures = 5

        with patch('openai.AsyncOpenAI') as mock_openai:
            mock_client = MagicMock()
            mock_client.models = MagicMock()
            mock_client.models.list = AsyncMock(side_effect=Exception("Still down"))
            mock_openai.return_value = mock_client
            asyncio.run(router.health_check())

        assert p.healthy is False