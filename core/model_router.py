"""
Model Router — automatic failover and multi-provider load balancing.

When the primary model fails (timeout, rate limit, connection error),
the router automatically switches to the next available fallback model.
Supports health checking and round-robin across providers.
"""
from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field
from typing import Optional

from core.errors import LLMError, ErrorCode, llm_timeout, llm_connection_failed

logger = logging.getLogger(__name__)


@dataclass
class ModelProvider:
    """A single model provider configuration."""
    name: str
    base_url: str
    api_key: str
    models: list[str]  # [primary, light, embedding, ...]
    weight: int = 1    # Load-balancing weight
    healthy: bool = True
    last_checked: float = 0.0
    failures: int = 0
    total_calls: int = 0
    total_failures: int = 0

    @property
    def failure_rate(self) -> float:
        if self.total_calls == 0:
            return 0.0
        return self.total_failures / self.total_calls

    @property
    def primary_model(self) -> str:
        return self.models[0] if self.models else ""

    @property
    def light_model(self) -> str:
        return self.models[1] if len(self.models) > 1 else self.primary_model

    @property
    def embedding_model(self) -> str:
        return self.models[2] if len(self.models) > 2 else self.primary_model


class ModelRouter:
    """
    Intelligent model routing with automatic failover.

    Strategy:
    1. Try primary provider's model
    2. On failure, mark provider unhealthy and try next
    3. Periodically health-check and restore unhealthy providers
    4. Track failure rates for informed routing decisions
    """

    HEALTH_CHECK_INTERVAL = 60  # seconds
    MAX_CONSECUTIVE_FAILURES = 3
    FAILURE_RESET_WINDOW = 300  # 5 min

    def __init__(self, config: dict):
        self.providers: list[ModelProvider] = []
        self._lock = asyncio.Lock()
        self._health_check_task: Optional[asyncio.Task] = None
        self._setup_providers(config)

    def _setup_providers(self, config: dict):
        """Parse providers from config."""
        llm_cfg = config.get("llm", {})
        models = llm_cfg.get("models", {})
        primary_model = models.get("primary", "deepseek-v4-pro")
        light_model = models.get("light", "qwen-turbo-latest")
        embedding_model = models.get("embedding", "text-embedding-v3")

        # Primary provider from main config
        base_url = llm_cfg.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1")
        api_key = llm_cfg.get("api_key", "")
        if api_key and not api_key.startswith("$"):
            self.providers.append(ModelProvider(
                name="primary",
                base_url=base_url,
                api_key=api_key,
                models=[primary_model, light_model, embedding_model],
                weight=3,
            ))

        # Fallback providers from config
        fallback_list = config.get("fallback_providers", [])
        if isinstance(fallback_list, dict):
            fallback_list = list(fallback_list.values())

        for fb in fallback_list:
            if not isinstance(fb, dict):
                continue
            fb_models = fb.get("models", [primary_model, light_model, embedding_model])
            if isinstance(fb_models, str):
                fb_models = [fb_models]
            self.providers.append(ModelProvider(
                name=fb.get("name", f"fallback-{len(self.providers)}"),
                base_url=fb.get("base_url", base_url),
                api_key=fb.get("api_key", api_key),
                models=fb_models,
                weight=fb.get("weight", 1),
            ))

        logger.info(
            f"ModelRouter initialized with {len(self.providers)} provider(s): "
            f"{[p.name for p in self.providers]}"
        )

    # ── Provider Selection ──────────────────────

    def _get_healthy_providers(self) -> list[ModelProvider]:
        """Get all currently healthy providers sorted by weight."""
        return sorted(
            [p for p in self.providers if p.healthy],
            key=lambda p: (-p.weight, p.failure_rate),
        )

    def get_provider(self, prefer_light: bool = False) -> Optional[ModelProvider]:
        """Get the best available provider."""
        healthy = self._get_healthy_providers()
        return healthy[0] if healthy else None

    def get_model(self, model_type: str = "primary") -> tuple[Optional[ModelProvider], str]:
        """
        Get provider and model name for a specific model type.
        Returns (provider, model_name). Falls back if primary unavailable.
        """
        healthy = self._get_healthy_providers()
        if not healthy:
            # All providers down — try any
            if self.providers:
                p = self.providers[0]
                return p, getattr(p, f"{model_type}_model", p.primary_model)
            return None, ""

        provider = healthy[0]
        model = getattr(provider, f"{model_type}_model", provider.primary_model)
        return provider, model

    async def get_openai_client(self, model_type: str = "primary"):
        """Get an AsyncOpenAI client for the best available provider."""
        from openai import AsyncOpenAI

        provider, model = self.get_model(model_type)
        if not provider:
            raise LLMError(ErrorCode.LLM_CONNECTION_FAILED, "No healthy providers available")

        return AsyncOpenAI(
            base_url=provider.base_url,
            api_key=provider.api_key,
        ), model, provider

    # ── Failure Tracking ────────────────────────

    async def record_success(self, provider: ModelProvider):
        """Record a successful call."""
        async with self._lock:
            provider.total_calls += 1
            provider.failures = 0  # Reset consecutive failures

    async def record_failure(self, provider: ModelProvider, error: Exception):
        """Record a failed call. May mark provider unhealthy."""
        async with self._lock:
            provider.total_calls += 1
            provider.total_failures += 1
            provider.failures += 1
            provider.last_checked = time.time()

            if provider.failures >= self.MAX_CONSECUTIVE_FAILURES:
                provider.healthy = False
                logger.warning(
                    f"ModelRouter: Provider '{provider.name}' marked unhealthy "
                    f"after {provider.failures} consecutive failures"
                )

    # ── Health Check ────────────────────────────

    async def health_check(self):
        """Check and restore unhealthy providers."""
        now = time.time()
        for provider in self.providers:
            if provider.healthy:
                continue

            # Check if enough time has passed
            if now - provider.last_checked < self.HEALTH_CHECK_INTERVAL:
                continue

            provider.last_checked = now
            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(
                    base_url=provider.base_url,
                    api_key=provider.api_key,
                )
                resp = await client.models.list()
                # If we get here, provider is responding
                provider.healthy = True
                provider.failures = 0
                logger.info(f"ModelRouter: Provider '{provider.name}' restored to healthy")
            except Exception as e:
                logger.debug(f"ModelRouter: Health check failed for '{provider.name}': {e}")

    async def start_health_checks(self, interval: int = 60):
        """Start periodic health checks in the background."""
        async def _loop():
            while True:
                await asyncio.sleep(interval)
                try:
                    await self.health_check()
                except Exception as e:
                    logger.error(f"Health check loop error: {e}")

        self._health_check_task = asyncio.create_task(_loop())

    def stop_health_checks(self):
        if self._health_check_task:
            self._health_check_task.cancel()

    # ── Resilient Call ──────────────────────────

    async def call_with_failover(
        self,
        call_fn,
        model_type: str = "primary",
        max_retries: int = 2,
    ):
        """
        Execute an LLM call with automatic failover across providers.

        call_fn should be an async function that takes (client, model) params.
        """
        tried_providers = set()
        last_error = None

        for attempt in range(max_retries + 1):
            provider, model = self.get_model(model_type)
            if not provider or provider.name in tried_providers:
                # Try next healthy provider
                healthy = self._get_healthy_providers()
                remaining = [p for p in healthy if p.name not in tried_providers]
                if remaining:
                    provider = remaining[0]
                    model = getattr(provider, f"{model_type}_model", provider.primary_model)
                elif attempt < max_retries and self.providers:
                    # Force try any provider as last resort
                    for p in self.providers:
                        if p.name not in tried_providers:
                            provider = p
                            model = getattr(provider, f"{model_type}_model", provider.primary_model)
                            break
                    else:
                        break
                else:
                    break

            tried_providers.add(provider.name)

            try:
                from openai import AsyncOpenAI
                client = AsyncOpenAI(
                    base_url=provider.base_url,
                    api_key=provider.api_key,
                    timeout=30.0,
                    max_retries=1,
                )
                result = await call_fn(client, model)
                await self.record_success(provider)
                return result, provider
            except Exception as e:
                await self.record_failure(provider, e)
                last_error = e
                logger.warning(
                    f"ModelRouter: Provider '{provider.name}' failed "
                    f"(attempt {attempt+1}/{max_retries+1}): {e}"
                )
                if attempt < max_retries:
                    await asyncio.sleep(0.5 * (attempt + 1))

        raise LLMError(
            ErrorCode.LLM_CONNECTION_FAILED,
            f"All {len(tried_providers)} provider(s) failed",
            cause=last_error,
        )

    @property
    def status(self) -> dict:
        """Get router status for monitoring."""
        return {
            "total_providers": len(self.providers),
            "healthy_providers": len(self._get_healthy_providers()),
            "providers": [
                {
                    "name": p.name,
                    "healthy": p.healthy,
                    "failure_rate": round(p.failure_rate, 3),
                    "total_calls": p.total_calls,
                    "consecutive_failures": p.failures,
                }
                for p in self.providers
            ],
        }