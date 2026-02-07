"""Reranker using Cohere Rerank API.

Fast, high-quality reranking via Cohere's hosted rerank endpoint.
Replaces the previous CPU-bound cross-encoder approach.
"""

from __future__ import annotations

import os

import cohere

_client: cohere.Client | None = None

DEFAULT_MODEL = "rerank-v3.5"


def _get_client() -> cohere.Client:
    """Get or create the Cohere client."""
    global _client
    if _client is None:
        api_key = os.getenv("COHERE_API_KEY")
        if not api_key:
            raise ValueError(
                "COHERE_API_KEY not set. Get one at https://dashboard.cohere.com/api-keys"
            )
        _client = cohere.Client(api_key=api_key)
    return _client


def rerank(
    query: str,
    results: list[dict],
    top_k: int = 5,
    model_name: str = DEFAULT_MODEL,
) -> list[dict]:
    """Rerank search results using Cohere Rerank API.

    Args:
        query: The original query string.
        results: List of result dicts (must have "text" key).
        top_k: Number of top results to return after reranking.
        model_name: Cohere rerank model to use.

    Returns:
        Reranked list of result dicts with added rerank_score.
    """
    if not results:
        return []

    client = _get_client()
    documents = [r["text"] for r in results]

    response = client.rerank(
        query=query,
        documents=documents,
        top_n=top_k,
        model=model_name,
    )

    reranked = []
    for item in response.results:
        result = results[item.index].copy()
        result["rerank_score"] = float(item.relevance_score)
        reranked.append(result)

    return reranked
