"""
Memory Engine — the heart of DeepSpace.
Four-layer memory model: short_term → working → long_term ← meta.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from core.llm_client import LLMClient
from core.models import (
    Memory,
    MemoryConsolidationResult,
    MemoryLayer,
    MemoryQuery,
    MemoryType,
    Entity,
    EntityType,
    Relation,
    RelationType,
    now_utc,
    new_id,
)
from storage.pgvector_store import PgVectorStore
from storage.neo4j_store import Neo4jGraphStore

logger = logging.getLogger(__name__)


class MemoryEngine:
    """
    Four-layer memory engine:
    1. Short-term: transient, session-scoped, auto-expires
    2. Working: project-scoped, active context
    3. Long-term: permanent, high-importance knowledge
    4. Meta: knowledge about what we know/don't know
    """

    def __init__(
        self,
        llm: LLMClient,
        vector_store: PgVectorStore,
        graph_store: Neo4jGraphStore,
        config: dict,
    ):
        self.llm = llm
        self.vector_store = vector_store
        self.graph_store = graph_store
        self.mem_cfg = config.get("memory", {})

    # ── Core Operations ────────────────────────

    async def remember(
        self,
        content: str,
        layer: MemoryLayer = MemoryLayer.SHORT_TERM,
        memory_type: Optional[MemoryType] = None,
        project: str = "",
        tags: Optional[list[str]] = None,
        source: str = "",
        importance: Optional[float] = None,
        auto_summarize: bool = True,
        auto_embed: bool = True,
        auto_graph: bool = True,
    ) -> Memory:
        """
        Store a new memory. Automatically:
        - Classify memory type
        - Assess importance
        - Generate summary
        - Generate embedding
        - Extract entities for knowledge graph
        """
        # Classify if not provided
        if memory_type is None:
            memory_type_str = await self.llm.classify_memory_type(content)
            try:
                memory_type = MemoryType(memory_type_str)
            except ValueError:
                memory_type = MemoryType.FACT

        # Assess importance if not provided
        if importance is None:
            importance = await self.llm.assess_importance(content, project)

        # Auto-promote high-importance items
        if importance >= self.mem_cfg.get("importance_threshold", 0.6):
            if layer == MemoryLayer.SHORT_TERM:
                layer = MemoryLayer.WORKING

        # Generate summary for long content
        summary = ""
        if auto_summarize and len(content) > 500:
            summary = await self.llm.summarize(content)
        elif auto_summarize and len(content) <= 500:
            summary = content[:200]

        # Create memory object
        memory = Memory(
            content=content,
            summary=summary,
            layer=layer,
            memory_type=memory_type or MemoryType.FACT,
            importance=importance or 0.5,
            project=project,
            tags=tags or [],
            source=source,
        )

        # Generate embedding
        if auto_embed:
            try:
                memory.embedding = await self.llm.embed_single(content[:2000])
            except Exception as e:
                logger.warning(f"Embedding generation failed: {e}")

        # Save to store
        await self.vector_store.save_memory(memory)

        # Extract entities for knowledge graph
        if auto_graph:
            await self._extract_and_store_graph(memory)

        logger.info(
            f"Remembered [{memory.layer.value}][{memory.memory_type.value}] "
            f"(importance={memory.importance:.2f}): {content[:80]}..."
        )
        return memory

    async def recall(
        self,
        query: str,
        layer: Optional[MemoryLayer] = None,
        memory_type: Optional[MemoryType] = None,
        project: Optional[str] = None,
        tags: Optional[list[str]] = None,
        top_k: int = 10,
        min_importance: float = 0.0,
    ) -> list[Memory]:
        """
        Hybrid memory retrieval:
        1. Vector search for semantic similarity
        2. Keyword search for exact matches
        3. Merge and deduplicate results
        """
        results: dict[str, Memory] = {}

        # Vector search
        try:
            query_embedding = await self.llm.embed_single(query)
            vector_results = await self.vector_store.search(
                query_vector=query_embedding,
                top_k=top_k,
                layer=layer,
                memory_type=memory_type,
                project=project,
                min_importance=min_importance,
            )
            for m in vector_results:
                results[m.id] = m
        except Exception as e:
            logger.warning(f"Vector search failed: {e}")

        # Keyword search
        try:
            keyword_results = await self.vector_store.search_memories(
                query=query,
                layer=layer,
                memory_type=memory_type,
                project=project,
                tags=tags,
                top_k=top_k,
            )
            for m in keyword_results:
                if m.id not in results:
                    results[m.id] = m
        except Exception as e:
            logger.warning(f"Keyword search failed: {e}")

        # Sort by importance
        sorted_results = sorted(
            results.values(), key=lambda m: m.importance, reverse=True
        )[:top_k]

        # Touch accessed memories
        if sorted_results:
            await self.vector_store.touch([m.id for m in sorted_results])

        return sorted_results

    async def forget(self, memory_ids: list[str]) -> int:
        """Delete memories by ID."""
        return await self.vector_store.delete_memories(memory_ids)

    async def get_memory(self, memory_id: str) -> Optional[Memory]:
        """Get a single memory."""
        return await self.vector_store.get_memory(memory_id)

    # ── Consolidation ──────────────────────────

    async def consolidate(self) -> MemoryConsolidationResult:
        """
        Run memory consolidation:
        1. Promote important short-term → working
        2. Promote stable working → long-term
        3. Extract entities/relations and update knowledge graph
        4. Decay/forget stale low-importance memories
        """
        result = MemoryConsolidationResult()

        threshold_days = self.mem_cfg.get("consolidation_threshold_days", 1)

        # 1. Short-term → Working (high importance)
        short_term = await self.vector_store.get_by_layer(
            MemoryLayer.SHORT_TERM, limit=500
        )
        result.short_term_processed = len(short_term)

        promote_to_working = [
            m for m in short_term
            if m.importance >= self.mem_cfg.get("importance_threshold", 0.6)
        ]
        if promote_to_working:
            ids = [m.id for m in promote_to_working]
            await self.vector_store.update_layer(ids, MemoryLayer.WORKING)
            result.promoted_to_working = len(ids)
            logger.info(f"Promoted {len(ids)} memories short_term → working")

        # 2. Working → Long-term (stable, high importance, old enough)
        working = await self.vector_store.get_by_layer(MemoryLayer.WORKING, limit=500)
        now = datetime.now(timezone.utc)
        promote_to_long = [
            m for m in working
            if m.importance >= 0.7
            and (now - m.created_at).days >= threshold_days
            and m.access_count >= 2
        ]
        if promote_to_long:
            ids = [m.id for m in promote_to_long]
            await self.vector_store.update_layer(ids, MemoryLayer.LONG_TERM)
            result.promoted_to_long_term = len(ids)
            logger.info(f"Promoted {len(ids)} memories working → long_term")

        # 3. Extract knowledge graph from working memories
        unprocessed_working = [
            m for m in working
            if m.importance >= 0.5
        ][:50]  # Limit to avoid cost explosion

        for memory in unprocessed_working:
            try:
                await self._extract_and_store_graph(memory)
                result.entities_extracted += 1
            except Exception as e:
                logger.warning(f"Graph extraction failed for {memory.id}: {e}")

        # 4. Infer transitive relations
        try:
            inferred = await self.graph_store.infer_transitive_relations()
            for rel in inferred:
                if rel.confidence >= 0.5:
                    await self.graph_store.create_relation(rel)
                    result.relations_inferred += 1
        except Exception as e:
            logger.warning(f"Transitive inference failed: {e}")

        # 5. Forget stale low-importance short-term memories
        stale = await self.vector_store.get_stale_memories(
            MemoryLayer.SHORT_TERM, days=7
        )
        to_forget = [m for m in stale if m.importance < 0.3 and m.access_count <= 1]
        if to_forget:
            await self.vector_store.delete_memories([m.id for m in to_forget])
            result.forgotten = len(to_forget)

        return result

    # ── Knowledge Graph ─────────────────────────

    async def _extract_and_store_graph(self, memory: Memory) -> None:
        """Extract entities and relations from a memory, store in graph."""
        text = memory.content[:4000]  # Truncate for LLM

        extraction = await self.llm.extract_entities(text)

        memory_id = memory.id

        # Store entities
        for ent_data in extraction.get("entities", []):
            try:
                entity = Entity(
                    name=ent_data["name"],
                    entity_type=EntityType(ent_data.get("type", "Concept")),
                    description=ent_data.get("description", ""),
                    confidence=float(ent_data.get("confidence", 0.8)),
                    source_memory_ids=[memory_id],
                )
                await self.graph_store.create_entity(entity)
            except Exception as e:
                logger.warning(f"Entity creation failed for {ent_data.get('name')}: {e}")

        # Store relations
        for rel_data in extraction.get("relations", []):
            try:
                # Find source and target entities by name
                source_entities = await self.graph_store.search_entities(
                    rel_data["source"], top_k=1
                )
                target_entities = await self.graph_store.search_entities(
                    rel_data["target"], top_k=1
                )

                if source_entities and target_entities:
                    relation = Relation(
                        source_entity_id=source_entities[0].id,
                        target_entity_id=target_entities[0].id,
                        relation_type=RelationType(rel_data.get("type", "RELATED_TO")),
                        description=rel_data.get("description", ""),
                        confidence=float(rel_data.get("confidence", 0.8)),
                        source_memory_ids=[memory_id],
                    )
                    await self.graph_store.create_relation(relation)
            except Exception as e:
                logger.warning(f"Relation creation failed: {e}")

    # ── Project Context ─────────────────────────

    async def set_project_context(
        self, name: str, path: str, description: str = "",
        tech_stack: Optional[list[str]] = None,
    ) -> None:
        """Register or update a project context."""
        from core.models import ProjectContext
        ctx = ProjectContext(
            name=name,
            path=path,
            description=description,
            tech_stack=tech_stack or [],
        )
        await self.vector_store.save_project_context(ctx)
        logger.info(f"Project context set: {name}")

    async def get_active_projects(self) -> list:
        """Get all known projects."""
        return await self.vector_store.list_projects()

    # ── Reflection / Meta-Memory ────────────────

    async def reflect(self) -> dict:
        """
        Meta-cognition: analyze what we know, what we don't know,
        and what we should learn about.
        """
        # Get recent working/long-term memories
        recent = await self.vector_store.get_by_layer(
            MemoryLayer.WORKING, limit=50
        )
        long_term = await self.vector_store.get_by_layer(
            MemoryLayer.LONG_TERM, limit=50
        )

        all_recent = recent + long_term
        if not all_recent:
            return {"knowledge_summary": "No memories yet.", "gaps": [], "strengths": []}

        # Build a summary for LLM
        memory_summaries = "\n".join(
            f"[{m.memory_type.value}] {m.summary or m.content[:100]}"
            for m in all_recent[:30]
        )

        reflection = await self.llm.chat_structured(
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Analyze this memory dump and perform meta-cognition:\n"
                        "1. What domains does this person know well? (strengths)\n"
                        "2. What knowledge gaps, uncertainties, or unexplored areas exist? (gaps)\n"
                        "3. What connections between domains seem missing?\n"
                        "4. What should be researched next?\n"
                        "Return a structured analysis."
                    ),
                },
                {"role": "user", "content": memory_summaries},
            ],
            output_schema={
                "type": "object",
                "properties": {
                    "knowledge_summary": {"type": "string"},
                    "strengths": {
                        "type": "array",
                        "items": {"type": "object", "properties": {
                            "domain": {"type": "string"},
                            "confidence": {"type": "number"},
                        }},
                    },
                    "gaps": {
                        "type": "array",
                        "items": {"type": "object", "properties": {
                            "topic": {"type": "string"},
                            "reason": {"type": "string"},
                            "priority": {"type": "number"},
                        }},
                    },
                    "recommendations": {
                        "type": "array",
                        "items": {"type": "string"},
                    },
                },
            },
        )

        return reflection

    # ── Stats ──────────────────────────────────

    async def stats(self) -> dict:
        """Get memory statistics."""
        layers = {}
        for layer in MemoryLayer:
            memories = await self.vector_store.get_by_layer(layer, limit=10000)
            layers[layer.value] = len(memories)

        return {
            "total_memories": sum(layers.values()),
            "by_layer": layers,
        }

    # ── Deduplication (NEW) ─────────────────

    async def deduplicate(self, threshold: float = 0.85, dry_run: bool = False) -> dict:
        """
        Find and merge semantically similar memories.

        Uses LLM to assess semantic similarity between pairs of memories
        in the same layer. Merges near-duplicates above threshold.
        """
        all_memories = []
        for layer in MemoryLayer:
            mems = await self.vector_store.get_by_layer(layer, limit=500)
            all_memories.extend(mems)

        if len(all_memories) < 2:
            return {"checked": len(all_memories), "merged": 0, "pairs": []}

        # Group by layer
        from collections import defaultdict
        by_layer = defaultdict(list)
        for m in all_memories:
            by_layer[m.layer].append(m)

        merged_count = 0
        merged_pairs = []

        for layer, mems in by_layer.items():
            if len(mems) < 2:
                continue

            for i in range(len(mems)):
                for j in range(i + 1, len(mems)):
                    a, b = mems[i], mems[j]

                    # Quick pre-filter: same type and similar length
                    if a.memory_type != b.memory_type:
                        continue
                    len_diff = abs(len(a.content) - len(b.content)) / max(len(a.content), 1)
                    if len_diff > 0.5:
                        continue

                    try:
                        similarity = await self.llm.chat_structured(
                            messages=[{
                                "role": "system",
                                "content": (
                                    "Rate the semantic similarity of these two texts on a scale 0.0-1.0. "
                                    "1.0 = identical meaning, 0.8+ = very similar (paraphrase), "
                                    "0.5 = somewhat related, 0.0 = completely different. "
                                    "Return ONLY a JSON with 'similarity' and 'reasoning'."
                                ),
                            }, {
                                "role": "user",
                                "content": f"Text A: {a.content[:500]}\n\nText B: {b.content[:500]}",
                            }],
                            output_schema={
                                "type": "object",
                                "properties": {
                                    "similarity": {"type": "number"},
                                    "reasoning": {"type": "string"},
                                },
                            },
                            model=self.llm.light_model,
                        )

                        sim = float(similarity.get("similarity", 0))

                        if sim >= threshold:
                            merged_pairs.append({
                                "keep": a.id,
                                "merged": b.id,
                                "similarity": sim,
                                "content_a": a.content[:100],
                                "content_b": b.content[:100],
                            })

                            if not dry_run:
                                # Merge: update importance, add tags, delete duplicate
                                combined_importance = max(a.importance, b.importance) + 0.05
                                combined_tags = list(set(a.tags + b.tags))
                                await self.vector_store.update_layer([a.id], a.layer)
                                # Store updated metadata
                                a.importance = min(combined_importance, 1.0)
                                a.tags = combined_tags
                                a.related_ids = list(set(a.related_ids + [b.id]))
                                await self.vector_store.save_memory(a)
                                await self.vector_store.delete_memories([b.id])

                            merged_count += 1
                    except Exception as e:
                        logger.debug(f"Dedup comparison failed: {e}")

        logger.info(f"DEDUP: Checked {len(all_memories)} memories, merged {merged_count} pairs")
        return {"checked": len(all_memories), "merged": merged_count, "pairs": merged_pairs[:20]}