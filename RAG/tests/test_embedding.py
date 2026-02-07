"""Tests for the embedding module."""

from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture(autouse=True)
def reset_model():
    """Reset the global model instance between tests."""
    import retrieval.ingestion_pipeline.embedding as emb

    emb._model_instance = None
    emb._current_model_name = None
    yield
    emb._model_instance = None
    emb._current_model_name = None


class TestEmbeddingConfig:
    def test_nomic_config(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "nomic")
        from retrieval.ingestion_pipeline.embedding import _get_config

        config = _get_config()
        assert config.dimension == 768
        assert config.doc_prefix == "search_document: "
        assert config.query_prefix == "search_query: "

    def test_bge_m3_config(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "bge-m3")
        from retrieval.ingestion_pipeline.embedding import _get_config

        config = _get_config()
        assert config.dimension == 1024
        assert config.doc_prefix == ""
        assert config.query_prefix == ""

    def test_invalid_model(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "invalid")
        from retrieval.ingestion_pipeline.embedding import _get_config

        with pytest.raises(ValueError, match="Unknown embedding model"):
            _get_config()


class TestGetEmbeddingDim:
    def test_nomic_dim(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "nomic")
        from retrieval.ingestion_pipeline.embedding import get_embedding_dim

        assert get_embedding_dim() == 768

    def test_bge_dim(self, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "bge-m3")
        from retrieval.ingestion_pipeline.embedding import get_embedding_dim

        assert get_embedding_dim() == 1024


class TestEmbedDocuments:
    @patch("retrieval.ingestion_pipeline.embedding.TextEmbedding")
    def test_embed_documents(self, mock_cls, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "nomic")

        mock_model = MagicMock()
        # Return mock arrays with tolist() support
        vec1 = MagicMock()
        vec1.tolist.return_value = [0.0] * 768
        vec2 = MagicMock()
        vec2.tolist.return_value = [0.0] * 768
        mock_model.embed.return_value = [vec1, vec2]
        mock_cls.return_value = mock_model

        from retrieval.ingestion_pipeline.embedding import embed_documents

        result = embed_documents(["text1", "text2"])
        assert len(result) == 2
        assert len(result[0]) == 768

        # Verify prefix was applied
        call_args = mock_model.embed.call_args[0][0]
        assert call_args[0].startswith("search_document: ")

    @patch("retrieval.ingestion_pipeline.embedding.TextEmbedding")
    def test_embed_documents_bge_no_prefix(self, mock_cls, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "bge-m3")

        mock_model = MagicMock()
        vec = MagicMock()
        vec.tolist.return_value = [0.0] * 1024
        mock_model.embed.return_value = [vec]
        mock_cls.return_value = mock_model

        from retrieval.ingestion_pipeline.embedding import embed_documents

        embed_documents(["text1"])
        call_args = mock_model.embed.call_args[0][0]
        assert not call_args[0].startswith("search_document: ")


class TestEmbedQuery:
    @patch("retrieval.ingestion_pipeline.embedding.TextEmbedding")
    def test_embed_query(self, mock_cls, monkeypatch):
        monkeypatch.setenv("EMBEDDING_MODEL", "nomic")

        mock_model = MagicMock()
        vec = MagicMock()
        vec.tolist.return_value = [0.0] * 768
        mock_model.embed.return_value = [vec]
        mock_cls.return_value = mock_model

        from retrieval.ingestion_pipeline.embedding import embed_query

        result = embed_query("test query")
        assert len(result) == 768

        call_args = mock_model.embed.call_args[0][0]
        assert call_args[0].startswith("search_query: ")
