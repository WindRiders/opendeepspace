"""
Tests for LLM client (mocked — no real API calls).
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import json

from core.llm_client import LLMClient


@pytest.fixture
def mock_config():
    return {
        "llm": {
            "base_url": "https://test.api.com/v1",
            "api_key": "sk-test-key",
            "models": {
                "primary": "deepseek-v4-pro",
                "light": "qwen-turbo-latest",
                "embedding": "text-embedding-v3",
            },
        }
    }


@pytest.fixture
def client(mock_config):
    """Create LLMClient with mocked AsyncOpenAI."""
    with patch('core.llm_client.AsyncOpenAI') as mock_openai:
        client = LLMClient(mock_config)
        client._mock_async_openai = mock_openai
        yield client


class TestLLMClientInit:
    """Test client initialization."""

    def test_client_initialization(self, mock_config):
        with patch('core.llm_client.AsyncOpenAI') as mock_openai:
            client = LLMClient(mock_config)
            assert client.primary_model == "deepseek-v4-pro"
            assert client.light_model == "qwen-turbo-latest"
            assert client.embedding_model == "text-embedding-v3"

    def test_client_default_config(self):
        with patch('core.llm_client.AsyncOpenAI') as mock_openai:
            client = LLMClient({})
            assert client.primary_model == "deepseek-v4-pro"
            assert client.light_model == "qwen-turbo-latest"


class TestEmbeddingMethods:
    """Test embedding generation."""

    def test_embed_single(self, client):
        mock_embedding = MagicMock()
        mock_embedding.embedding = [0.1, 0.2, 0.3]
        mock_resp = MagicMock()
        mock_resp.data = [mock_embedding]
        client.client.embeddings.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.embed_single("test text"))
        assert result == [0.1, 0.2, 0.3]

    def test_embed_batch(self, client):
        e1 = MagicMock()
        e1.embedding = [0.1, 0.2]
        e2 = MagicMock()
        e2.embedding = [0.3, 0.4]
        mock_resp = MagicMock()
        mock_resp.data = [e1, e2]
        client.client.embeddings.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.embed(["text1", "text2"]))
        assert result == [[0.1, 0.2], [0.3, 0.4]]


class TestChatMethods:
    """Test chat completion."""

    def test_chat_success(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = "Hello, world!"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.chat([
            {"role": "user", "content": "Say hello"}
        ]))
        assert result == "Hello, world!"

    def test_chat_with_custom_model(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = "ok"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.chat(
            [{"role": "user", "content": "hi"}],
            model="custom-model",
        ))

        call_args = client.client.chat.completions.create.call_args[1]
        assert call_args["model"] == "custom-model"

    def test_chat_empty_response(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = None
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.chat([
            {"role": "user", "content": "hi"}
        ]))
        assert result == ""


class TestStructuredOutput:
    """Test JSON structured output parsing."""

    def test_chat_structured(self, client):
        # Mock the chat response
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({"name": "test", "value": 42})
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.chat_structured(
            messages=[{"role": "system", "content": "Extract data"}],
            output_schema={"type": "object", "properties": {}},
        ))
        assert result == {"name": "test", "value": 42}

    def test_chat_structured_markdown_wrapped(self, client):
        # Some LLMs wrap JSON in ```json blocks
        mock_choice = MagicMock()
        mock_choice.message.content = '```json\n{"key": "value"}\n```'
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.chat_structured(
            messages=[{"role": "system", "content": "go"}],
            output_schema={},
        ))
        assert result == {"key": "value"}


class TestImportanceAssessment:
    """Test importance scoring."""

    def test_assess_importance(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({"importance": 0.75, "reasoning": "important"})
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.assess_importance("important stuff"))
        assert result == 0.75

    def test_assess_importance_clamps_to_1(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({"importance": 1.5, "reasoning": "very"})
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.assess_importance("stuff"))
        assert result == 1.0

    def test_assess_importance_clamps_to_0(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({"importance": -0.5, "reasoning": "low"})
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.assess_importance("stuff"))
        assert result == 0.0


class TestMemoryClassification:
    """Test memory type classification."""

    def test_classify_memory_type(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({"type": "bug_fix", "reasoning": "fix"})
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.classify_memory_type("fixed a bug"))
        assert result == "bug_fix"


class TestSummarization:
    """Test text summarization."""

    def test_summarize(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = "Short summary here"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.summarize("long" * 500))
        assert result == "Short summary here"


class TestEntityExtraction:
    """Test entity and relation extraction."""

    def test_extract_entities(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = json.dumps({
            "entities": [
                {"name": "Neo4j", "type": "Tool", "description": "Graph database", "confidence": 0.9},
            ],
            "relations": [
                {"source": "DeepSpace", "target": "Neo4j", "type": "USES", "description": "Uses Neo4j", "confidence": 0.95},
            ],
        })
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.extract_entities("DeepSpace uses Neo4j for knowledge graph"))
        assert len(result["entities"]) == 1
        assert result["entities"][0]["name"] == "Neo4j"
        assert len(result["relations"]) == 1
        assert result["relations"][0]["type"] == "USES"


class TestResearchHelpers:
    """Test research query and synthesis helpers."""

    def test_generate_research_query(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = "pgvector HNSW index performance comparison"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.generate_research_query(
            "pgvector", ["HNSW tuning", "index selection"]
        ))
        assert isinstance(result, str)
        assert len(result) > 0

    def test_synthesize_findings(self, client):
        mock_choice = MagicMock()
        mock_choice.message.content = "Synthesized result here"
        mock_resp = MagicMock()
        mock_resp.choices = [mock_choice]
        client.client.chat.completions.create = AsyncMock(return_value=mock_resp)

        import asyncio
        result = asyncio.run(client.synthesize_findings(
            "pgvector optimization",
            ["source1 content", "source2 content"],
        ))
        assert result == "Synthesized result here"