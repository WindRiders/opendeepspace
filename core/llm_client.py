"""
LLM client wrapper for DashScope (OpenAI-compatible) API.
Handles text generation, embeddings, and structured extraction.
"""

from __future__ import annotations

import json
import logging
from typing import Optional

from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


class LLMClient:
    """Async wrapper around DashScope/OpenAI-compatible API."""

    def __init__(self, config: dict):
        llm_cfg = config.get("llm", {})
        self.client = AsyncOpenAI(
            base_url=llm_cfg.get("base_url", "https://dashscope.aliyuncs.com/compatible-mode/v1"),
            api_key=llm_cfg.get("api_key", ""),
        )
        models = llm_cfg.get("models", {})
        self.primary_model = models.get("primary", "deepseek-v4-pro")
        self.light_model = models.get("light", "qwen-turbo-latest")
        self.embedding_model = models.get("embedding", "text-embedding-v3")

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of texts."""
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
        """Generate a single embedding."""
        embeddings = await self.embed([text])
        return embeddings[0]

    async def chat(
        self,
        messages: list[dict],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 4096,
        response_format: Optional[dict] = None,
    ) -> str:
        """Simple chat completion."""
        try:
            kwargs = {
                "model": model or self.primary_model,
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

    async def chat_structured(
        self,
        messages: list[dict],
        output_schema: dict,
        model: Optional[str] = None,
    ) -> dict:
        """Chat with structured JSON output."""
        system_msg = messages[0]["content"] if messages else ""
        messages[0] = {
            "role": "system",
            "content": (
                f"{system_msg}\n\n"
                f"You MUST respond with valid JSON that matches this schema:\n"
                f"{json.dumps(output_schema, ensure_ascii=False, indent=2)}\n"
                f"Respond ONLY with the JSON object, no other text."
            ),
        }

        raw = await self.chat(
            messages=messages,
            model=model or self.primary_model,
            temperature=0.3,
            response_format={"type": "json_object"},
        )

        # Parse JSON — handle common LLM output issues
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[1]
            if raw.endswith("```"):
                raw = raw[:-3]
        return json.loads(raw)

    async def summarize(self, text: str, max_length: int = 200) -> str:
        """Generate a concise summary of text."""
        summary = await self.chat(
            messages=[
                {"role": "system", "content": "You are a precise summarizer. Keep summaries factual, concise, and lossless — preserve key names, numbers, and decisions."},
                {"role": "user", "content": f"Summarize in under {max_length} characters:\n\n{text}"},
            ],
            model=self.light_model,
            temperature=0.3,
            max_tokens=max_length,
        )
        return summary.strip()

    async def extract_entities(
        self, text: str, existing_entities: Optional[list[dict]] = None
    ) -> dict:
        """Extract entities and relations from text."""
        existing_hint = ""
        if existing_entities:
            existing_hint = f"\nExisting entities (try to match instead of creating duplicates):\n{json.dumps(existing_entities, ensure_ascii=False)}"

        return await self.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You extract knowledge graph entities and relations from text. "
                        "Entities: Project, Concept, Paper, Idea, Problem, Solution, Person, Tool, File, Command. "
                        "Relations: USES, RELATED_TO, SOLVED_BY, INSPIRED, DEPENDS_ON, EVOLVED_INTO, "
                        "CONTRADICTS, PART_OF, LEARNED_FROM, SIMILAR_TO."
                        f"{existing_hint}"
                    ),
                },
                {"role": "user", "content": text},
            ],
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
                                "source": {"type": "string", "description": "Source entity name"},
                                "target": {"type": "string", "description": "Target entity name"},
                                "type": {"type": "string", "enum": ["USES", "RELATED_TO", "SOLVED_BY", "INSPIRED", "DEPENDS_ON", "EVOLVED_INTO", "CONTRADICTS", "PART_OF", "LEARNED_FROM", "SIMILAR_TO"]},
                                "description": {"type": "string"},
                                "confidence": {"type": "number"},
                            },
                            "required": ["source", "target", "type"],
                        },
                    },
                },
            },
        )

    async def assess_importance(self, text: str, context: str = "") -> float:
        """Assess the importance of a piece of information (0.0-1.0)."""
        result = await self.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Rate how important this information is for long-term retention. "
                        "Consider: uniqueness, reusability, decision-impact, and whether it "
                        "would be costly to re-discover. Return a float 0.0-1.0."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Context: {context}\n\nContent: {text}",
                },
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "importance": {"type": "number"},
                    "reasoning": {"type": "string"},
                },
            },
            model=self.light_model,
        )
        return min(1.0, max(0.0, float(result.get("importance", 0.5))))

    async def classify_memory_type(self, text: str) -> str:
        """Classify a memory into its type."""
        result = await self.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Classify this content into one memory type: "
                        "fact, decision, experience, command, code_pattern, bug_fix, "
                        "concept, idea, workflow, preference, reading, relationship. "
                        "Choose the single best fit."
                    ),
                },
                {"role": "user", "content": text},
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "type": {"type": "string"},
                    "reasoning": {"type": "string"},
                },
            },
            model=self.light_model,
        )
        return result.get("type", "fact")

    async def generate_research_query(self, topic: str, knowledge_gaps: list[str]) -> str:
        """Generate an optimal research query for a learning task."""
        gaps_str = "\n".join(f"- {g}" for g in knowledge_gaps[:5])
        result = await self.chat(
            messages=[
                {
                    "role": "system",
                    "content": "Generate a concise, specific research query to fill knowledge gaps. Optimize for search engine retrieval.",
                },
                {
                    "role": "user",
                    "content": f"Topic: {topic}\n\nKnowledge gaps:\n{gaps_str}\n\nResearch query:",
                },
            ],
            model=self.light_model,
            temperature=0.5,
            max_tokens=200,
        )
        return result.strip()

    async def synthesize_findings(self, query: str, sources: list[str]) -> str:
        """Synthesize research findings into a coherent summary."""
        sources_text = "\n\n---\n\n".join(sources[:10])
        return await self.chat(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Synthesize research findings into a clear, structured summary. "
                        "Highlight key insights, contradictions, and actionable takeaways. "
                        "Use Chinese if the original content is in Chinese."
                    ),
                },
                {
                    "role": "user",
                    "content": f"Research query: {query}\n\nSources:\n{sources_text}",
                },
            ],
            model=self.primary_model,
            temperature=0.5,
            max_tokens=4096,
        )