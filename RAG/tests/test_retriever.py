"""Tests for the PTRetriever."""

from unittest.mock import MagicMock, patch

import pytest


def _make_scored_point(id, score, payload):
    """Create a mock ScoredPoint."""
    point = MagicMock()
    point.id = id
    point.score = score
    point.payload = payload
    return point


@pytest.fixture
def mock_qdrant():
    """Mock Qdrant client."""
    with patch("retrieval.retriever.get_client") as mock:
        client = MagicMock()
        mock.return_value = client
        yield client


@pytest.fixture
def mock_embed():
    """Mock embed_query to return a dummy vector."""
    with patch("retrieval.retriever.embed_query") as mock:
        mock.return_value = [0.1] * 768
        yield mock


class TestSearch:
    def test_basic_search(self, mock_qdrant, mock_embed):
        mock_qdrant.search.return_value = [
            _make_scored_point("1", 0.95, {"text": "Shoulder rehab", "source": "doc1.pdf"}),
            _make_scored_point("2", 0.85, {"text": "Knee exercises", "source": "doc2.pdf"}),
        ]

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever(expand_queries=False)
        results = retriever.search("shoulder exercises", top_k=5)

        assert len(results) == 2
        assert results[0]["score"] == 0.95
        assert results[0]["text"] == "Shoulder rehab"

    def test_search_with_filters(self, mock_qdrant, mock_embed):
        mock_qdrant.search.return_value = []

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever(expand_queries=False)
        retriever.search("test", filters={"regions": ["shoulder"]})

        call_kwargs = mock_qdrant.search.call_args
        assert call_kwargs.kwargs.get("query_filter") is not None

    def test_search_with_expansion(self, mock_qdrant, mock_embed):
        """When expansion produces multiple queries, multi_query_search is used."""
        mock_qdrant.search.return_value = [
            _make_scored_point("1", 0.9, {"text": "Result", "source": "doc.pdf"}),
        ]

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever(expand_queries=True)
        # "knee pain" triggers expansion via query_expansion_map
        results = retriever.search("knee pain")

        # Should have called search multiple times (once per expanded query)
        assert mock_qdrant.search.call_count > 1


class TestSearchByMuscle:
    def test_search_by_muscle(self, mock_qdrant, mock_embed):
        mock_qdrant.search.return_value = [
            _make_scored_point("1", 0.9, {
                "text": "Rotator cuff exercises",
                "muscles": ["rotator cuff"],
                "source": "doc.pdf",
            }),
        ]

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever()
        results = retriever.search_by_muscle("rotator cuff")

        assert len(results) == 1
        # Verify filter was passed
        call_kwargs = mock_qdrant.search.call_args
        assert call_kwargs.kwargs.get("query_filter") is not None


class TestSearchByCondition:
    def test_search_by_condition(self, mock_qdrant, mock_embed):
        mock_qdrant.search.return_value = []

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever()
        results = retriever.search_by_condition("ACL tear")

        assert results == []
        mock_qdrant.search.assert_called_once()


class TestMultiQuerySearch:
    def test_deduplication(self, mock_qdrant, mock_embed):
        """Multi-query search should deduplicate results."""
        mock_qdrant.search.side_effect = [
            [
                _make_scored_point("1", 0.95, {"text": "Result A", "source": "a.pdf"}),
                _make_scored_point("2", 0.85, {"text": "Result B", "source": "b.pdf"}),
            ],
            [
                _make_scored_point("1", 0.90, {"text": "Result A", "source": "a.pdf"}),
                _make_scored_point("3", 0.80, {"text": "Result C", "source": "c.pdf"}),
            ],
        ]

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever()
        results = retriever.multi_query_search(
            ["query1", "query2"], top_k=10
        )

        # Should have 3 unique results (id "1" deduplicated)
        assert len(results) == 3
        ids = [r["id"] for r in results]
        assert len(set(ids)) == 3

    def test_sorted_by_score(self, mock_qdrant, mock_embed):
        mock_qdrant.search.side_effect = [
            [_make_scored_point("1", 0.5, {"text": "Low", "source": "a.pdf"})],
            [_make_scored_point("2", 0.9, {"text": "High", "source": "b.pdf"})],
        ]

        from retrieval.retriever import PTRetriever

        retriever = PTRetriever()
        results = retriever.multi_query_search(["q1", "q2"], top_k=10)

        assert results[0]["score"] > results[1]["score"]
