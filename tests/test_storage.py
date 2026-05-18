"""
Tests for storage interfaces and PgVectorStore.
Tests that don't require a running PostgreSQL instance.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

from core.models import (
    Memory, MemoryLayer, MemoryType, MemoryQuery,
    Entity, EntityType, Relation, RelationType,
    ProjectContext, now_utc,
)
from storage.interfaces import VectorStore, GraphStore, RelationalStore


class TestVectorStoreInterface:
    """Ensure VectorStore abstract interface is well-defined."""

    def test_abstract_methods(self):
        abstract_methods = {'add', 'search', 'delete', 'get_by_id'}
        assert abstract_methods.issubset(VectorStore.__abstractmethods__)


class TestGraphStoreInterface:
    """Ensure GraphStore abstract interface is well-defined."""

    def test_abstract_methods(self):
        abstract_methods = {
            'create_entity', 'create_relation', 'get_entity',
            'search_entities', 'find_similar_entities', 'merge_entities',
            'get_neighbors', 'get_connections_between',
            'infer_transitive_relations', 'delete_entity',
        }
        assert abstract_methods.issubset(GraphStore.__abstractmethods__)


class TestRelationalStoreInterface:
    """Ensure RelationalStore abstract interface is well-defined."""

    def test_abstract_methods(self):
        abstract_methods = {
            'init_schema', 'save_memory', 'save_memories_batch',
            'get_memory', 'search_memories', 'update_layer',
            'get_by_layer', 'get_stale_memories', 'touch',
            'delete_memories', 'save_project_context',
            'get_project_context', 'list_projects',
        }
        assert abstract_methods.issubset(RelationalStore.__abstractmethods__)


class TestPgVectorStoreInstantiation:
    """Test that PgVectorStore can be instantiated with mock config."""

    @patch('storage.pgvector_store.psycopg2')
    def test_constructor(self, mock_psycopg2):
        from storage.pgvector_store import PgVectorStore
        store = PgVectorStore(
            host="testhost",
            port=9999,
            database="testdb",
            user="testuser",
            password="testpass",
        )
        assert store.conn_params["host"] == "testhost"
        assert store.conn_params["port"] == 9999
        assert store.conn_params["dbname"] == "testdb"
        assert store.conn_params["user"] == "testuser"
        assert store.conn_params["password"] == "testpass"

    @patch('storage.pgvector_store.psycopg2')
    def test_constructor_defaults(self, mock_psycopg2):
        from storage.pgvector_store import PgVectorStore
        store = PgVectorStore()
        assert store.conn_params["host"] == "localhost"
        assert store.conn_params["port"] == 5440
        assert store.conn_params["dbname"] == "deepspace"


class TestNeo4jGraphStoreInstantiation:
    """Test that Neo4jGraphStore can be instantiated with mock."""

    @patch('storage.neo4j_store.AsyncGraphDatabase')
    def test_constructor(self, mock_driver_class):
        from storage.neo4j_store import Neo4jGraphStore
        store = Neo4jGraphStore(
            uri="bolt://localhost:7687",
            user="neo4j",
            password="testpass",
            database="testdb",
        )
        assert store._uri == "bolt://localhost:7687"
        assert store._user == "neo4j"
        assert store._password == "testpass"
        assert store._database == "testdb"


class TestMemoryModelValidation:
    """Validate Memory model constraints."""

    def test_memory_summary_max_length(self):
        long_summary = "x" * 500
        mem = Memory(content="test", summary=long_summary)
        assert len(mem.summary) == 500

    def test_memory_tags_must_be_list_of_strings(self):
        mem = Memory(content="test", tags=["tag1", "tag2"])
        assert isinstance(mem.tags, list)
        assert all(isinstance(t, str) for t in mem.tags)

    def test_memory_metadata_is_dict(self):
        mem = Memory(content="test", metadata={"key": "value"})
        assert mem.metadata == {"key": "value"}


class TestEntityIdGeneration:
    """Test entity and relation ID generation."""

    def test_entity_ids_are_unique(self):
        e1 = Entity(name="a", entity_type=EntityType.CONCEPT)
        e2 = Entity(name="b", entity_type=EntityType.CONCEPT)
        assert e1.id != e2.id

    def test_relation_ids_are_unique(self):
        r1 = Relation(source_entity_id="a", target_entity_id="b",
                      relation_type=RelationType.USES)
        r2 = Relation(source_entity_id="c", target_entity_id="d",
                      relation_type=RelationType.USES)
        assert r1.id != r2.id