"""Qdrant Cloud client with dynamic vector dimensions.

Connects to Qdrant Cloud using QDRANT_URL and QDRANT_API_KEY env vars.
Collection vector size is determined dynamically from the embedding model.
"""

from __future__ import annotations

import os

from qdrant_client import QdrantClient
from qdrant_client.http.models import (
    Distance,
    PayloadSchemaType,
    VectorParams,
)

from .ingestion_pipeline.embedding import get_embedding_dim

COLLECTION_NAME = "physio-knowledge-base-v3"

_client: QdrantClient | None = None


def get_client() -> QdrantClient:
    """Get or create the Qdrant Cloud client.

    Connects using QDRANT_URL and QDRANT_API_KEY environment variables.

    Returns:
        QdrantClient connected to Qdrant Cloud.

    Raises:
        ValueError: If required env vars are not set.
    """
    global _client
    if _client is None:
        url = os.getenv("QDRANT_URL")
        api_key = os.getenv("QDRANT_API_KEY")
        if not url or not api_key:
            raise ValueError(
                "QDRANT_URL and QDRANT_API_KEY must be set. "
                "See .env.example for configuration."
            )
        _client = QdrantClient(url=url, api_key=api_key)
    return _client


def ensure_collection(
    collection_name: str = COLLECTION_NAME,
) -> None:
    """Ensure the Qdrant collection exists with correct configuration.

    Creates the collection if it doesn't exist, using the current
    embedding model's dimension for vector size.

    Args:
        collection_name: Name of the collection.
    """
    client = get_client()

    collections = client.get_collections().collections
    existing_names = [c.name for c in collections]

    if collection_name not in existing_names:
        dim = get_embedding_dim()
        client.create_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(size=dim, distance=Distance.COSINE),
        )

        # Create payload indexes for filtered search
        indexes = [
            ("source", PayloadSchemaType.KEYWORD),
            ("muscle_groups", PayloadSchemaType.KEYWORD),
            ("conditions", PayloadSchemaType.KEYWORD),
            ("exercises", PayloadSchemaType.KEYWORD),
            ("content_type", PayloadSchemaType.KEYWORD),
        ]
        for field_name, field_type in indexes:
            client.create_payload_index(
                collection_name=collection_name,
                field_name=field_name,
                field_schema=field_type,
            )
