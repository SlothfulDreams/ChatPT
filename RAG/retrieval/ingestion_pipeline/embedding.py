"""Embedding module using FastEmbed with Nomic and BGE-M3 models.

Supports two embedding models selected via EMBEDDING_MODEL env var:
- nomic (768d): nomic-ai/nomic-embed-text-v1.5 with search_document/search_query prefixes
- bge-m3 (1024d): BAAI/bge-m3 with no prefixes
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from fastembed import TextEmbedding

_model_instance: TextEmbedding | None = None
_current_model_name: str | None = None


@dataclass(frozen=True)
class EmbeddingModelConfig:
    model_name: str
    dimension: int
    doc_prefix: str
    query_prefix: str


MODELS: dict[str, EmbeddingModelConfig] = {
    "nomic": EmbeddingModelConfig(
        model_name="nomic-ai/nomic-embed-text-v1.5",
        dimension=768,
        doc_prefix="search_document: ",
        query_prefix="search_query: ",
    ),
    "bge-m3": EmbeddingModelConfig(
        model_name="BAAI/bge-m3",
        dimension=1024,
        doc_prefix="",
        query_prefix="",
    ),
}


def _get_config() -> EmbeddingModelConfig:
    model_key = os.getenv("EMBEDDING_MODEL", "nomic").lower()
    if model_key not in MODELS:
        raise ValueError(
            f"Unknown embedding model: {model_key}. Choose from: {list(MODELS.keys())}"
        )
    return MODELS[model_key]


def _get_model() -> TextEmbedding:
    global _model_instance, _current_model_name
    config = _get_config()
    if _model_instance is None or _current_model_name != config.model_name:
        _model_instance = TextEmbedding(model_name=config.model_name)
        _current_model_name = config.model_name
    return _model_instance


def get_embedding_dim() -> int:
    """Get the dimension of the current embedding model.

    Returns:
        Integer dimension (768 for nomic, 1024 for bge-m3).
    """
    return _get_config().dimension


def embed_documents(texts: list[str]) -> list[list[float]]:
    """Embed a list of documents.

    Applies the appropriate document prefix for the selected model.

    Args:
        texts: List of document text strings.

    Returns:
        List of embedding vectors.
    """
    config = _get_config()
    model = _get_model()
    prefixed = [f"{config.doc_prefix}{t}" for t in texts]
    embeddings = list(model.embed(prefixed))
    return [e.tolist() for e in embeddings]


def embed_query(query: str) -> list[float]:
    """Embed a single query string.

    Applies the appropriate query prefix for the selected model.

    Args:
        query: Query text string.

    Returns:
        Embedding vector as list of floats.
    """
    config = _get_config()
    model = _get_model()
    prefixed = f"{config.query_prefix}{query}"
    embeddings = list(model.embed([prefixed]))
    return embeddings[0].tolist()


if __name__ == "__main__":
    config = _get_config()
    print(f"Model: {config.model_name}")
    print(f"Dimensions: {config.dimension}")

    test_texts = ["shoulder rehabilitation exercises", "ACL reconstruction protocol"]
    vecs = embed_documents(test_texts)
    print(f"Embedded {len(vecs)} documents, dim={len(vecs[0])}")

    q_vec = embed_query("rotator cuff exercises")
    print(f"Query embedding dim={len(q_vec)}")
