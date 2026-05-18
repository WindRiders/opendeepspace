"""
LLM client wrapper with automatic failover via ModelRouter.
Supports DashScope, OpenAI-compatible, and any provider with fallback.
"""
from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class LLMClient:
    """Async LLM wrapper with optional ModelRouter failover."""

    def __init__(self, config: dict, router=None):
        from core.model_router import ModelRouter

        llm_cfg = config.get("llm", {})

        # Router: if provided, use it. Otherwise create from config.
        self.router = router or ModelRouter(config)
        self._use_router = router is not None or len(self.router.providers) > 1

        # Direct client (kept for backward compat + embedding)
        self.client = AsyncOpenAI(
            base_url=llm_cfg.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            api_key=llm_cfg.get("api_key", ""),
        )
        models = llm_cfg.get("models", {})
        self.primary_model = models.get("primary", "deepseek-v4-pro")
        self.light_model = models.get("light", "qwen-turbo-latest")
        self.embedding_model = models.get("embedding", "text-embedding-v3")

    # ── Embedding (direct, no failover needed) ──

    async def embed(self, texts: list[str]) -> list[list[float]]:
        try:
            resp = await self.client.embeddings.create(
                model=self.embedding_model,
                input=texts,
            )
            return [d.embedding for d in resp.data]
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            raise

    async def embed_single(self, text: str) -> list[float]:
        embeddings = await self.embed([text])
        return embeddings[0]

    # ── Chat (with failover if router available) ──

    async def chat(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        model_name = model or self.primary_model

        if self._use_router:
            return await self._chat_with_router(
                messages, model_name, temperature, max_tokens, response_format
            )
        return await self._chat_direct(
            messages, model_name, temperature, max_tokens, response_format
        )

    async def _chat_direct(
        self, messages, model_name, temperature, max_tokens, response_format
    ) -> str:
        try:
            kwargs = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format:
                kwargs["response_format"] = response_format
            resp = await self.client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""
        except Exception as e:
            logger.error(f"Chat failed: {e}")
            raise

    async def _chat_with_router(
        self, messages, model_name, temperature, max_tokens, response_format
    ) -> str:
        async def call_fn(client, model):
            kwargs = {
                "model": model or model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if response_format:
                kwargs["response_format"] = response_format
            resp = await client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content or ""

        result, provider = await self.router.call_with_failover(
            call_fn, model_type="primary", max_retries=1
        )
        return result

    # ── Structured Output ──

    async def chat_structured(
        self,
        messages: list[dict],
        output_schema: dict,
        model: Optional[str] = None,
    ) -> dict:
        system_msg = messages[0]["content"] if messages else ""
        messages[0] = {
            "role": "system",
            "content": (
                f"{system_msg}\n\n"
                f"You MUST respond with valid JSON:\n"
                f"{json.dumps(output_schema, ensure_ascii=False, indent=2)}\n"
                f"Respond ONLY with the JSON object."
            ),
        }
        raw = await self.chat(
            messages=messages,
            model=model or self.primary_model,
            temperature=0.3,
            response_format={"type": "json_object"},
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
        return json.loads(raw)

    async def summarize(self, text: str, max_length: int = 200) -> str:
        return (await self.chat(
            messages=[
                {"role": "system", "content": "Summarize concisely."},
                {"role": "user", "content": f"Summarize in under {max_length} chars:\n\n{text}"},
            ],
            model=self.light_model,
            temperature=0.3,
            max_tokens=max_length,
        )).strip()

    async def extract_entities(self, text: str, existing_entities: Optional[list[dict]] = None) -> dict:
        existing_hint = ""
        if existing_entities:
            existing_hint = f"\nExisting entities:\n{json.dumps(existing_entities, ensure_ascii=False)}"
        return await self.chat_structured(
            messages=[{
                "role": "system",
                "content": f"Extract entities and relations.{existing_hint}",
            }, {"role": "user", "content": text}],
            output_schema={
                "type": "object",
                "properties": {
                    "entities": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "name": {"type": "string"},
                                "type": {"type": "string", "enum": ["Project", "Concept", "Paper", "Idea", "Problem", "Solution", "Person", "Tool", "File", "Command"]},
                                "description": {"type": "string"},
                                "confidence": {"type": "number"},
                            },
                            "required": ["name", "type", "description"],
                        },
                    },
                    "relations": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "source": {"type": "string"}, "target": {"type": "string"},
                                "type": {"type": "string", "enum": ["USES", "RELATED_TO", "SOLVED_BY", "INSPIRED", "DEPENDS_ON", "EVOLVED_INTO", "CONTRADICTS", "PART_OF", "LEARNED_FROM", "SIMILAR_TO"]},
                                "description": {"type": "string"}, "confidence": {"type": "number"},
                            },
                            "required": ["source", "target", "type"],
                        },
                    },
                },
            },
        )

    async def assess_importance(self, text: str, context: str = "") -> float:
        result = await self.chat_structured(
            messages=[{"role": "system", "content": "Rate importance 0.0-1.0."},
                      {"role": "user", "content": f"Context: {context}\nContent: {text}"}],
            output_schema={"type": "object", "properties": {"importance": {"type": "number"}, "reasoning": {"type": "string"}}},
            model=self.light_model,
        )
        return min(1.0, max(0.0, float(result.get("importance", 0.5))))

    async def classify_memory_type(self, text: str) -> str:
        result = await self.chat_structured(
            messages=[{"role": "system", "content": "Classify: fact, decision, experience, command, code_pattern, bug_fix, concept, idea, workflow, preference, reading, relationship"},
                      {"role": "user", "content": text}],
            output_schema={"type": "object", "properties": {"type": {"type": "string"}, "reasoning": {"type": "string"}}},
            model=self.light_model,
        )
        return result.get("type", "fact")

    async def generate_research_query(self, topic: str, knowledge_gaps: list[str]) -> str:
        gaps_str = "\n".join(f"- {g}" for g in knowledge_gaps[:5])
        return (await self.chat(
            messages=[{"role": "system", "content": "Generate a concise research query."},
                      {"role": "user", "content": f"Topic: {topic}\nGaps:\n{gaps_str}\nQuery:"}],
            model=self.light_model, temperature=0.5, max_tokens=200,
        )).strip()

    async def synthesize_findings(self, query: str, sources: list[str]) -> str:
        sources_text = "\n\n---\n\n".join(sources[:10])
        return await self.chat(
            messages=[{"role": "system", "content": "Synthesize research findings clearly."},
                      {"role": "user", "content": f"Query: {query}\nSources:\n{sources_text}"}],
            model=self.primary_model, temperature=0.5, max_tokens=4096,
        )