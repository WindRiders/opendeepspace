"""
Storage layer — abstract interfaces for all storage backends.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from core.models import (
    Entity,
    EntityType,
    Memory,
    MemoryLayer,
    MemoryType,
    ProjectContext,
    Relation,
    RelationType,
)


class VectorStore(ABC):
    """Interface for vector similarity storage."""

    @abstractmethod
    async def add(self, memories: list[Memory]) -> list[str]:
        """Store memories with their embeddings. Returns list of IDs."""
        ...

    @abstractmethod
    async def search(
        self,
        query_vector: list[float],
        top_k: int = 10,
        layer: Optional[MemoryLayer] = None,
        memory_type: Optional[MemoryType] = None,
        project: Optional[str] = None,
        min_importance: float = 0.0,
    ) -> list[Memory]:
        """Search by vector similarity with optional filters."""
        ...

    @abstractmethod
    async def delete(self, memory_ids: list[str]) -> int:
        """Delete memories by ID. Returns count deleted."""
        ...

    @abstractmethod
    async def get_by_id(self, memory_id: str) -> Optional[Memory]:
        """Get a single memory by ID."""
        ...


class GraphStore(ABC):
    """Interface for knowledge graph storage (Neo4j)."""

    @abstractmethod
    async def create_entity(self, entity: Entity) -> str:
        """Create a new entity node. Returns entity ID."""
        ...

    @abstractmethod
    async def create_relation(self, relation: Relation) -> str:
        """Create a new relation edge. Returns relation ID."""
        ...

    @abstractmethod
    async def get_entity(self, entity_id: str) -> Optional[Entity]:
        """Get entity by ID."""
        ...

    @abstractmethod
    async def search_entities(
        self, query: str, entity_type: Optional[EntityType] = None, top_k: int = 10
    ) -> list[Entity]:
        """Search entities by name/description."""
        ...

    @abstractmethod
    async def find_similar_entities(self, name: str, threshold: float = 0.85) -> list[Entity]:
        """Find entities with similar names (for dedup)."""
        ...

    @abstractmethod
    async def merge_entities(self, keep_id: str, merge_id: str) -> str:
        """Merge two entities, keeping one. Returns the kept ID."""
        ...

    @abstractmethod
    async def get_neighbors(
        self, entity_id: str, depth: int = 1, relation_types: Optional[list[RelationType]] = None
    ) -> list[tuple[Entity, Relation]]:
        """Get neighboring entities and their relations."""
        ...

    @abstractmethod
    async def get_connections_between(
        self, entity_id_1: str, entity_id_2: str
    ) -> list[Relation]:
        """Find all relations between two entities."""
        ...

    @abstractmethod
    async def infer_transitive_relations(self) -> list[Relation]:
        """Infer new relations through transitive reasoning. Returns inferred relations."""
        ...

    @abstractmethod
    async def delete_entity(self, entity_id: str) -> bool:
        """Delete an entity and its relations."""
        ...


class RelationalStore(ABC):
    """Interface for relational storage (PostgreSQL)."""

    @abstractmethod
    async def init_schema(self) -> None:
        """Initialize database schema."""
        ...

    @abstractmethod
    async def save_memory(self, memory: Memory) -> str:
        """Save memory metadata. Returns ID."""
        ...

    @abstractmethod
    async def save_memories_batch(self, memories: list[Memory]) -> list[str]:
        """Save multiple memories. Returns list of IDs."""
        ...

    @abstractmethod
    async def get_memory(self, memory_id: str) -> Optional[Memory]:
        """Get memory metadata by ID."""
        ...

    @abstractmethod
    async def search_memories(
        self,
        query: str,
        layer: Optional[MemoryLayer] = None,
        memory_type: Optional[MemoryType] = None,
        project: Optional[str] = None,
        tags: Optional[list[str]] = None,
        top_k: int = 10,
    ) -> list[Memory]:
        """Keyword/text search on memory content."""
        ...

    @abstractmethod
    async def update_layer(
        self, memory_ids: list[str], new_layer: MemoryLayer
    ) -> int:
        """Promote/demote memories to a different layer."""
        ...

    @abstractmethod
    async def get_by_layer(
        self, layer: MemoryLayer, limit: int = 100, offset: int = 0
    ) -> list[Memory]:
        """Get memories by layer."""
        ...

    @abstractmethod
    async def get_stale_memories(self, layer: MemoryLayer, days: int) -> list[Memory]:
        """Get memories not accessed in N days."""
        ...

    @abstractmethod
    async def touch(self, memory_ids: list[str]) -> None:
        """Update last_accessed and access_count."""
        ...

    @abstractmethod
    async def delete_memories(self, memory_ids: list[str]) -> int:
        """Delete memories. Returns count."""
        ...

    # Project context
    @abstractmethod
    async def save_project_context(self, ctx: ProjectContext) -> str:
        ...

    @abstractmethod
    async def get_project_context(self, name: str) -> Optional[ProjectContext]:
        ...

    @abstractmethod
    async def list_projects(self) -> list[ProjectContext]:
        ...