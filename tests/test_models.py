"""
Tests for DeepSpace core data models.
"""
import pytest
from datetime import datetime, timezone
from core.models import (
    Memory, MemoryLayer, MemoryType, MemoryQuery,
    Entity, EntityType, Relation, RelationType,
    ProjectContext, LearningTask, LearningTaskStatus,
    MemoryConsolidationResult, now_utc, new_id,
)


class TestMemoryModel:
    """Tests for the Memory data model."""

    def test_memory_defaults(self):
        mem = Memory(content="test memory")
        assert mem.content == "test memory"
        assert mem.layer == MemoryLayer.SHORT_TERM
        assert mem.memory_type == MemoryType.FACT
        assert mem.importance == 0.5
        assert mem.confidence == 1.0
        assert mem.tags == []
        assert mem.project == ""
        assert mem.source == ""
        assert mem.embedding is None
        assert mem.access_count == 0
        assert mem.ttl_days == 0
        assert len(mem.related_ids) == 0
        assert mem.metadata == {}

    def test_memory_id_is_unique(self):
        m1 = Memory(content="a")
        m2 = Memory(content="b")
        assert m1.id != m2.id
        assert len(m1.id) == 16

    def test_memory_created_at_is_utc(self):
        mem = Memory(content="test")
        assert mem.created_at.tzinfo == timezone.utc
        now = datetime.now(timezone.utc)
        assert abs((now - mem.created_at).total_seconds()) < 5

    def test_memory_with_all_fields(self):
        mem = Memory(
            content="important fact",
            summary="summary here",
            layer=MemoryLayer.WORKING,
            memory_type=MemoryType.DECISION,
            importance=0.9,
            confidence=0.8,
            project="deepspace",
            tags=["ai", "memory"],
            source="cli",
            embedding=[0.1, 0.2, 0.3],
            ttl_days=30,
        )
        assert mem.summary == "summary here"
        assert mem.layer == MemoryLayer.WORKING
        assert mem.memory_type == MemoryType.DECISION
        assert mem.importance == 0.9
        assert mem.tags == ["ai", "memory"]
        assert mem.embedding == [0.1, 0.2, 0.3]
        assert mem.ttl_days == 30

    def test_memory_importance_bounds(self):
        # Valid: within bounds
        mem = Memory(content="test", importance=1.0)
        assert mem.importance == 1.0
        mem = Memory(content="test", importance=0.0)
        assert mem.importance == 0.0


class TestMemoryLayer:
    """Tests for memory layer hierarchy."""

    def test_all_layers_present(self):
        assert MemoryLayer.SHORT_TERM.value == "short_term"
        assert MemoryLayer.WORKING.value == "working"
        assert MemoryLayer.LONG_TERM.value == "long_term"
        assert MemoryLayer.META.value == "meta"

    def test_layers_have_four(self):
        assert len(MemoryLayer) == 4


class TestMemoryType:
    """Tests for memory type classification."""

    def test_all_types_present(self):
        expected = {
            "fact", "decision", "experience", "command",
            "code_pattern", "bug_fix", "concept", "idea",
            "workflow", "preference", "reading", "relationship",
        }
        actual = {t.value for t in MemoryType}
        assert actual == expected


class TestMemoryQuery:
    """Tests for memory query model."""

    def test_query_defaults(self):
        q = MemoryQuery(query="test")
        assert q.query == "test"
        assert q.top_k == 10
        assert q.use_vector is True
        assert q.use_keyword is True
        assert q.use_graph is False
        assert q.min_importance == 0.0
        assert q.min_confidence == 0.0

    def test_query_with_filters(self):
        q = MemoryQuery(
            query="prisma",
            layer=MemoryLayer.WORKING,
            project="timemap",
            top_k=5,
        )
        assert q.layer == MemoryLayer.WORKING
        assert q.project == "timemap"
        assert q.top_k == 5


class TestEntityAndRelation:
    """Tests for knowledge graph models."""

    def test_entity_creation(self):
        e = Entity(
            name="PostgreSQL",
            entity_type=EntityType.TOOL,
            description="Open source relational database",
        )
        assert e.name == "PostgreSQL"
        assert e.entity_type == EntityType.TOOL
        assert e.confidence == 1.0
        assert e.created_at.tzinfo == timezone.utc

    def test_relation_creation(self):
        r = Relation(
            source_entity_id="e1",
            target_entity_id="e2",
            relation_type=RelationType.USES,
            description="Project uses tool",
        )
        assert r.source_entity_id == "e1"
        assert r.target_entity_id == "e2"
        assert r.relation_type == RelationType.USES
        assert r.inferred is False

    def test_inferred_relation(self):
        r = Relation(
            source_entity_id="e1",
            target_entity_id="e2",
            relation_type=RelationType.SIMILAR_TO,
            inferred=True,
            confidence=0.6,
        )
        assert r.inferred is True
        assert r.confidence == 0.6

    def test_all_entity_types(self):
        expected = {
            "Project", "Concept", "Paper", "Idea", "Problem",
            "Solution", "Person", "Tool", "File", "Command",
        }
        actual = {t.value for t in EntityType}
        assert actual == expected

    def test_all_relation_types(self):
        expected = {
            "USES", "RELATED_TO", "SOLVED_BY", "INSPIRED",
            "DEPENDS_ON", "EVOLVED_INTO", "CONTRADICTS",
            "PART_OF", "LEARNED_FROM", "SIMILAR_TO",
        }
        actual = {t.value for t in RelationType}
        assert actual == expected


class TestLearningTask:
    """Tests for the autonomous learner task model."""

    def test_learning_task_defaults(self):
        t = LearningTask(title="Research topic", description="Study something")
        assert t.status == LearningTaskStatus.PENDING
        assert t.priority == 0.5
        assert t.findings == ""
        assert t.new_memories == []
        assert t.new_entities == []
        assert t.completed_at is None
        assert t.cost_estimate == 0.0

    def test_learning_task_status_lifecycle(self):
        t = LearningTask(title="test", description="desc")
        assert t.status == LearningTaskStatus.PENDING

        t.status = LearningTaskStatus.RESEARCHING
        assert t.status == LearningTaskStatus.RESEARCHING

        t.status = LearningTaskStatus.COMPLETED
        t.completed_at = now_utc()
        assert t.status == LearningTaskStatus.COMPLETED
        assert t.completed_at is not None

    def test_learning_task_statuses(self):
        expected = {
            "pending", "researching", "analyzing", "verifying",
            "integrating", "completed", "failed", "cancelled",
        }
        actual = {s.value for s in LearningTaskStatus}
        assert actual == expected


class TestProjectContext:
    """Tests for project context model."""

    def test_project_context(self):
        ctx = ProjectContext(
            name="deepspace",
            path="/home/user/deepspace",
            description="Memory engine",
            tech_stack=["Python", "PostgreSQL", "Neo4j"],
        )
        assert ctx.name == "deepspace"
        assert ctx.path == "/home/user/deepspace"
        assert "Python" in ctx.tech_stack
        assert ctx.current_task == ""
        assert ctx.open_issues == []

    def test_project_context_empty_tech_stack(self):
        ctx = ProjectContext(name="test", path="/tmp")
        assert ctx.tech_stack == []


class TestMemoryConsolidationResult:
    """Tests for consolidation result model."""

    def test_consolidation_result_defaults(self):
        r = MemoryConsolidationResult()
        assert r.short_term_processed == 0
        assert r.promoted_to_working == 0
        assert r.promoted_to_long_term == 0
        assert r.entities_extracted == 0
        assert r.relations_inferred == 0
        assert r.forgotten == 0
        assert r.errors == []

    def test_consolidation_result_with_data(self):
        r = MemoryConsolidationResult(
            short_term_processed=100,
            promoted_to_working=30,
            promoted_to_long_term=5,
            entities_extracted=45,
            relations_inferred=20,
            forgotten=10,
            errors=["Connection timeout on entity 42"],
        )
        assert r.short_term_processed == 100
        assert r.promoted_to_working == 30
        assert r.entities_extracted == 45
        assert len(r.errors) == 1


class TestHelpers:
    """Tests for utility functions."""

    def test_now_utc(self):
        t = now_utc()
        assert t.tzinfo == timezone.utc
        now = datetime.now(timezone.utc)
        assert abs((now - t).total_seconds()) < 1

    def test_new_id_format(self):
        id1 = new_id()
        id2 = new_id()
        assert len(id1) == 16
        assert len(id2) == 16
        assert id1 != id2
        # Hex characters
        assert all(c in '0123456789abcdef' for c in id1)