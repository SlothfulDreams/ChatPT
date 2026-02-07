"""PTRetriever: ontology-powered retrieval for physical therapy knowledge.

Wraps Qdrant search with query expansion via the ontology module,
supporting filtered search by muscle, condition, and body region.
"""

from __future__ import annotations

from qdrant_client.http.models import (
    FieldCondition,
    Filter,
    MatchAny,
)

from .client import COLLECTION_NAME, get_client
from .ingestion_pipeline.embedding import embed_query
from .ontology import expand_muscle_query, get_muscle_synonyms


class PTRetriever:
    """Physical therapy knowledge retriever with ontology expansion."""

    def __init__(
        self,
        collection_name: str = COLLECTION_NAME,
        top_k: int = 10,
        expand_queries: bool = True,
    ):
        self.collection_name = collection_name
        self.top_k = top_k
        self.expand_queries = expand_queries

    def search(
        self,
        query: str,
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        """Search with ontology-powered query expansion.

        Args:
            query: Search query string.
            top_k: Number of results to return.
            filters: Optional dict of field → values for filtering.

        Returns:
            List of result dicts with text, score, and metadata.
        """
        top_k = top_k or self.top_k
        qdrant_filter = self._build_filter(filters) if filters else None

        if self.expand_queries:
            expanded = expand_muscle_query(query)
            if len(expanded) > 1:
                return self.multi_query_search(expanded, top_k=top_k, filters=filters)

        query_vector = embed_query(query)
        client = get_client()

        results = client.search(
            collection_name=self.collection_name,
            query_vector=query_vector,
            limit=top_k,
            query_filter=qdrant_filter,
        )

        return [self._format_result(r) for r in results]

    def search_by_muscle(self, muscle: str, top_k: int | None = None) -> list[dict]:
        """Search for content related to a specific muscle.

        Uses ontology synonyms for comprehensive matching.

        Args:
            muscle: Muscle name.
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k
        synonyms = get_muscle_synonyms(muscle)

        query_vector = embed_query(f"{muscle} physical therapy")
        client = get_client()

        qdrant_filter = Filter(
            should=[
                FieldCondition(key="muscles", match=MatchAny(any=synonyms)),
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

    def search_by_region(self, region: str, top_k: int | None = None) -> list[dict]:
        """Search for content related to a body region.

        Args:
            region: Body region (e.g., "shoulder", "knee").
            top_k: Number of results.

        Returns:
            List of result dicts.
        """
        top_k = top_k or self.top_k

        query_vector = embed_query(f"{region} physical therapy")
        client = get_client()

        qdrant_filter = Filter(
            should=[
                FieldCondition(
                    key="regions", match=MatchAny(any=[region.lower()])
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

    def multi_query_search(
        self,
        queries: list[str],
        top_k: int | None = None,
        filters: dict | None = None,
    ) -> list[dict]:
        """Search with multiple queries and deduplicate results.

        Args:
            queries: List of query strings.
            top_k: Number of results to return.
            filters: Optional filters.

        Returns:
            Deduplicated list of result dicts, sorted by score.
        """
        top_k = top_k or self.top_k
        qdrant_filter = self._build_filter(filters) if filters else None
        client = get_client()

        seen_ids: set[str] = set()
        all_results: list[dict] = []

        for query in queries:
            query_vector = embed_query(query)
            results = client.search(
                collection_name=self.collection_name,
                query_vector=query_vector,
                limit=top_k,
                query_filter=qdrant_filter,
            )

            for r in results:
                rid = str(r.id)
                if rid not in seen_ids:
                    seen_ids.add(rid)
                    all_results.append(self._format_result(r))

        # Sort by score descending and limit
        all_results.sort(key=lambda x: x["score"], reverse=True)
        return all_results[:top_k]

    @staticmethod
    def _build_filter(filters: dict) -> Filter:
        """Build a Qdrant filter from a dict of field → values.

        Args:
            filters: Dict mapping field names to lists of values.

        Returns:
            Qdrant Filter object.
        """
        conditions = []
        for field, values in filters.items():
            if isinstance(values, str):
                values = [values]
            conditions.append(
                FieldCondition(key=field, match=MatchAny(any=values))
            )
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
            "muscles": payload.get("muscles", []),
            "regions": payload.get("regions", []),
            "conditions": payload.get("conditions", []),
            "summary": payload.get("summary", ""),
        }
