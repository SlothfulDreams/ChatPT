"""PTRetriever: vector retrieval for physical therapy knowledge.

Wraps Qdrant search with template-wrapped chunk embeddings,
supporting filtered search by muscle group, condition, content type, and exercise.
"""

from __future__ import annotations

from qdrant_client.http.models import (
    FieldCondition,
    Filter,
    MatchAny,
)

from .client import COLLECTION_NAME, get_client
from .ingestion_pipeline.embedding import embed_query


class PTRetriever:
    """Physical therapy knowledge retriever."""

    def __init__(
        self,
        collection_name: str = COLLECTION_NAME,
        top_k: int = 10,
    ):
        self.collection_name = collection_name
        self.top_k = top_k

    def search(
        self,
        query: str,
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        """Search the knowledge base.

        Args:
            query: Search query string.
            top_k: Number of results to return.
            filters: Optional dict of field -> values for filtering.

        Returns:
            List of result dicts with text, score, and metadata.
        """
        top_k = top_k or self.top_k
        qdrant_filter = self._build_filter(filters) if filters else None

        query_vector = embed_query(query)
        client = get_client()

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    def search_by_muscle_group(
        self, group: str, top_k: int | None = None
    ) -> list[dict]:
        """Search for content related to a specific muscle group.

        Args:
            group: Muscle group name.
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k

        query_vector = embed_query(f"{group} physical therapy")
        client = get_client()

        qdrant_filter = Filter(
            must=[
                FieldCondition(key="muscle_groups", match=MatchAny(any=[group])),
            ]
        )

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    def search_by_condition(
        self, condition: str, top_k: int | None = None
    ) -> list[dict]:
        """Search for content related to a clinical condition.

        Args:
            condition: Condition name (e.g., "ACL tear").
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k

        query_vector = embed_query(f"{condition} rehabilitation")
        client = get_client()

        qdrant_filter = Filter(
            should=[
                FieldCondition(
                    key="conditions", match=MatchAny(any=[condition.lower()])
                ),
            ]
        )

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    def search_by_content_type(
        self, content_type: str, query: str, top_k: int | None = None
    ) -> list[dict]:
        """Search for content of a specific type.

        Args:
            content_type: Content type to filter on.
            query: Search query string.
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k
        query_vector = embed_query(query)
        client = get_client()

        qdrant_filter = Filter(
            must=[
                FieldCondition(key="content_type", match=MatchAny(any=[content_type]))
            ]
        )

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    def search_by_exercise(self, exercise: str, top_k: int | None = None) -> list[dict]:
        """Search for content related to a specific exercise.

        Args:
            exercise: Exercise name.
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k
        query_vector = embed_query(f"{exercise} technique")
        client = get_client()

        qdrant_filter = Filter(
            should=[
                FieldCondition(key="exercises", match=MatchAny(any=[exercise.lower()]))
            ]
        )

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    @staticmethod
    def _build_filter(filters: dict) -> Filter:
        """Build a Qdrant filter from a dict of field -> values.

        Args:
            filters: Dict mapping field names to lists of values.

        Returns:
            Qdrant Filter object.
        """
        conditions = []
        for field, values in filters.items():
            if isinstance(values, str):
                values = [values]
            conditions.append(FieldCondition(key=field, match=MatchAny(any=values)))
        return Filter(must=conditions)

    @staticmethod
    def _format_result(result) -> dict:
        """Format a Qdrant search result into a standard dict.

        Args:
            result: Qdrant ScoredPoint.

        Returns:
            Dict with id, score, text, and metadata fields.
        """
        payload = result.payload or {}
        return {
            "id": str(result.id),
            "score": result.score,
            "text": payload.get("text", ""),
            "source": payload.get("source", ""),
            "muscle_groups": payload.get("muscle_groups", []),
            "conditions": payload.get("conditions", []),
            "exercises": payload.get("exercises", []),
            "content_type": payload.get("content_type", ""),
            "summary": payload.get("summary", ""),
        }
