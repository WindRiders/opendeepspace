"""
Tests for ModelRouter failover and load balancing.
"""
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
        assert len(st["providers"]) == 1