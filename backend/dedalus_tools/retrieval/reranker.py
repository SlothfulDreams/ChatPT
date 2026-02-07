"""Cross-encoder reranker using sentence-transformers.

Reranks retrieval results using a cross-encoder model for improved
relevance scoring.
"""

from __future__ import annotations

from sentence_transformers import CrossEncoder

_model: CrossEncoder | None = None

DEFAULT_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"


def _get_model(model_name: str = DEFAULT_MODEL) -> CrossEncoder:
    """Get or create the cross-encoder model."""
    global _model
    if _model is None:
        _model = CrossEncoder(model_name)
    return _model


def rerank(
    query: str,
    results: list[dict],
    top_k: int = 5,
    model_name: str = DEFAULT_MODEL,
) -> list[dict]:
    """Rerank search results using a cross-encoder.

    Args:
        query: The original query string.
        results: List of result dicts (must have "text" key).
        top_k: Number of top results to return after reranking.
        model_name: Cross-encoder model to use.

    Returns:
        Reranked list of result dicts with updated scores.
    """
    if not results:
        return []

    model = _get_model(model_name)

    pairs = [(query, r["text"]) for r in results]
    scores = model.predict(pairs)

    for result, score in zip(results, scores):
        result["rerank_score"] = float(score)

    reranked = sorted(results, key=lambda x: x["rerank_score"], reverse=True)
    return reranked[:top_k]
