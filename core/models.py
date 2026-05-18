"""
DeepSpace — Autonomous Learning Memory System
Core data models for the memory engine.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex[:16]


# ──────────────────────────────────────────────
# Memory Models (四层记忆)
# ──────────────────────────────────────────────


class MemoryLayer(str, Enum):
    """Four-layer memory hierarchy."""
    SHORT_TERM = "short_term"      # 短期 — 当前会话
    WORKING = "working"             # 工作 — 当前项目上下文
    LONG_TERM = "long_term"        # 长期 — 永久知识
    META = "meta"                   # 元记忆 — 关于记忆的记忆


class MemoryType(str, Enum):
    """Types of memories."""
    FACT = "fact"                   # 客观事实
    DECISION = "decision"           # 决策
    EXPERIENCE = "experience"       # 经验/教训
    COMMAND = "command"             # 命令行/操作
    CODE_PATTERN = "code_pattern"   # 代码模式
    BUG_FIX = "bug_fix"             # Bug修复
    CONCEPT = "concept"             # 概念理解
    IDEA = "idea"                   # 灵感/想法
    WORKFLOW = "workflow"           # 工作流
    PREFERENCE = "preference"       # 偏好
    READING = "reading"             # 阅读/论文
    RELATIONSHIP = "relationship"   # 关系


class Memory(BaseModel):
    """A single memory entry."""
    id: str = Field(default_factory=new_id)
    content: str
    summary: str = ""               # LLM-generated summary
    layer: MemoryLayer = MemoryLayer.SHORT_TERM
    memory_type: MemoryType = MemoryType.FACT
    importance: float = Field(default=0.5, ge=0.0, le=1.0)
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    project: str = ""               # Associated project name
    tags: list[str] = Field(default_factory=list)
    source: str = ""                # Where this memory came from
    embedding: Optional[list[float]] = None
    created_at: datetime = Field(default_factory=now_utc)
    last_accessed: datetime = Field(default_factory=now_utc)
    access_count: int = 0
    ttl_days: int = 0              # 0 = never expire
    related_ids: list[str] = Field(default_factory=list)
    metadata: dict = Field(default_factory=dict)


class MemoryQuery(BaseModel):
    """Query for memory retrieval."""
    query: str
    layer: Optional[MemoryLayer] = None
    memory_type: Optional[MemoryType] = None
    project: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    top_k: int = 10
    min_importance: float = 0.0
    min_confidence: float = 0.0
    use_vector: bool = True
    use_keyword: bool = True
    use_graph: bool = False


class MemoryConsolidationResult(BaseModel):
    """Result of a memory consolidation run."""
    short_term_processed: int = 0
    promoted_to_working: int = 0
    promoted_to_long_term: int = 0
    entities_extracted: int = 0
    relations_inferred: int = 0
    forgotten: int = 0
    errors: list[str] = Field(default_factory=list)


# ──────────────────────────────────────────────
# Knowledge Graph Models
# ──────────────────────────────────────────────


class EntityType(str, Enum):
    PROJECT = "Project"
    CONCEPT = "Concept"
    PAPER = "Paper"
    IDEA = "Idea"
    PROBLEM = "Problem"
    SOLUTION = "Solution"
    PERSON = "Person"
    TOOL = "Tool"
    FILE = "File"
    COMMAND = "Command"


class RelationType(str, Enum):
    USES = "USES"
    RELATED_TO = "RELATED_TO"
    SOLVED_BY = "SOLVED_BY"
    INSPIRED = "INSPIRED"
    DEPENDS_ON = "DEPENDS_ON"
    EVOLVED_INTO = "EVOLVED_INTO"
    CONTRADICTS = "CONTRADICTS"
    PART_OF = "PART_OF"
    LEARNED_FROM = "LEARNED_FROM"
    SIMILAR_TO = "SIMILAR_TO"


class Entity(BaseModel):
    """A node in the knowledge graph."""
    id: str = Field(default_factory=new_id)
    name: str
    entity_type: EntityType
    description: str = ""
    properties: dict = Field(default_factory=dict)
    embedding: Optional[list[float]] = None
    confidence: float = Field(default=1.0)
    created_at: datetime = Field(default_factory=now_utc)
    updated_at: datetime = Field(default_factory=now_utc)
    source_memory_ids: list[str] = Field(default_factory=list)


class Relation(BaseModel):
    """An edge in the knowledge graph."""
    id: str = Field(default_factory=new_id)
    source_entity_id: str
    target_entity_id: str
    relation_type: RelationType
    description: str = ""
    confidence: float = Field(default=1.0)
    inferred: bool = False         # Was this inferred vs explicitly stated?
    created_at: datetime = Field(default_factory=now_utc)
    source_memory_ids: list[str] = Field(default_factory=list)


# ──────────────────────────────────────────────
# Autonomous Learner Models
# ──────────────────────────────────────────────


class LearningTaskStatus(str, Enum):
    PENDING = "pending"
    RESEARCHING = "researching"
    ANALYZING = "analyzing"
    VERIFYING = "verifying"
    INTEGRATING = "integrating"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LearningTask(BaseModel):
    """A task for the autonomous learner."""
    id: str = Field(default_factory=new_id)
    title: str
    description: str
    status: LearningTaskStatus = LearningTaskStatus.PENDING
    priority: float = Field(default=0.5, ge=0.0, le=1.0)
    source: str = ""                # What triggered this task
    query: str = ""                 # Research query
    findings: str = ""              # LLM-generated findings
    new_memories: list[str] = Field(default_factory=list)
    new_entities: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=now_utc)
    completed_at: Optional[datetime] = None
    cost_estimate: float = 0.0
    metadata: dict = Field(default_factory=dict)


# ──────────────────────────────────────────────
# Project Context Model
# ──────────────────────────────────────────────


class ProjectContext(BaseModel):
    """Active project context for working memory."""
    name: str
    path: str
    description: str = ""
    tech_stack: list[str] = Field(default_factory=list)
    key_files: list[str] = Field(default_factory=list)
    current_task: str = ""
    open_issues: list[str] = Field(default_factory=list)
    recent_decisions: list[str] = Field(default_factory=list)
    last_active: datetime = Field(default_factory=now_utc)


# ──────────────────────────────────────────────
# Autonomous Execution Models
# ──────────────────────────────────────────────


class StepStatus(str, Enum):
    """Status of an action step in an execution plan."""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    APPROVAL_REQUIRED = "approval_required"


class ExecutionMode(str, Enum):
    """How the execution engine should behave."""
    PLAN_ONLY = "plan_only"           # Only generate plan, don't execute
    STEP_BY_STEP = "step_by_step"     # Execute one step at a time, ask before each
    SEMI_AUTO = "semi_auto"           # Execute freely but ask for dangerous ops
    FULL_AUTO = "full_auto"           # Execute everything without asking


class Goal(BaseModel):
    """A user goal or system-derived objective."""
    id: str = Field(default_factory=new_id)
    description: str                  # What the user wants to achieve
    context: str = ""                 # Additional context/constraints
    mode: ExecutionMode = ExecutionMode.SEMI_AUTO
    created_at: datetime = Field(default_factory=now_utc)
    completed_at: Optional[datetime] = None
    status: StepStatus = StepStatus.PENDING


class ActionStep(BaseModel):
    """A single actionable step in an execution plan."""
    id: str = Field(default_factory=new_id)
    step_number: int
    description: str                  # Human-readable description
    action_type: str = "shell"        # shell | python | api_call | file_write | git
    command: str = ""                 # The actual command/code to execute
    expected_outcome: str = ""        # What should happen if successful
    timeout_seconds: int = 120
    retry_count: int = 0
    max_retries: int = 2
    status: StepStatus = StepStatus.PENDING
    dependencies: list[int] = Field(default_factory=list)  # Step numbers that must complete first
    created_at: datetime = Field(default_factory=now_utc)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class ActionResult(BaseModel):
    """Result of executing an action step."""
    step_id: str
    step_number: int
    status: StepStatus
    stdout: str = ""
    stderr: str = ""
    exit_code: int = -1
    output_summary: str = ""           # LLM-generated summary of output
    error_analysis: str = ""           # LLM analysis of what went wrong (if failed)
    duration_seconds: float = 0.0
    retry_attempt: int = 0
    timestamp: datetime = Field(default_factory=now_utc)


class VerificationResult(BaseModel):
    """Result of verifying an action's outcome."""
    step_id: str
    step_number: int
    passed: bool
    evidence: str = ""                 # What shows success/failure
    confidence: float = 0.0
    suggestion: str = ""               # What to do if verification failed
    timestamp: datetime = Field(default_factory=now_utc)


class ExecutionPlan(BaseModel):
    """A complete execution plan for a goal."""
    id: str = Field(default_factory=new_id)
    goal: Goal
    steps: list[ActionStep] = Field(default_factory=list)
    rationale: str = ""                # Why this plan was chosen
    estimated_total_minutes: int = 0
    created_at: datetime = Field(default_factory=now_utc)

    @property
    def completed_steps(self) -> int:
        return sum(1 for s in self.steps if s.status == StepStatus.COMPLETED)

    @property
    def failed_steps(self) -> int:
        return sum(1 for s in self.steps if s.status == StepStatus.FAILED)

    @property
    def is_complete(self) -> bool:
        return all(s.status in (StepStatus.COMPLETED, StepStatus.SKIPPED) for s in self.steps)