"""Ontology-powered query expansion for physical therapy retrieval."""

from __future__ import annotations

import json
from pathlib import Path

_DATA_DIR = Path(__file__).parent

_muscle_graph: dict | None = None
_expansion_map: dict | None = None


def _load_muscle_graph() -> dict:
    global _muscle_graph
    if _muscle_graph is None:
        path = _DATA_DIR / "muscle_graph.json"
        if path.exists():
            with open(path) as f:
                _muscle_graph = json.load(f)
        else:
            _muscle_graph = {}
    return _muscle_graph


def _load_expansion_map() -> dict:
    global _expansion_map
    if _expansion_map is None:
        path = _DATA_DIR / "query_expansion_map.json"
        if path.exists():
            with open(path) as f:
                _expansion_map = json.load(f)
        else:
            _expansion_map = {}
    return _expansion_map


def get_muscle_synonyms(muscle_name: str) -> list[str]:
    """Get synonyms and related terms for a muscle or muscle group.

    Args:
        muscle_name: Name of the muscle (case-insensitive).

    Returns:
        List of synonyms, components, and related terms.
    """
    graph = _load_muscle_graph()
    key = muscle_name.lower().strip()

    # Direct match
    if key in graph:
        entry = graph[key]
        terms = [key]
        terms.extend(entry.get("synonyms", []))
        terms.extend(entry.get("components", []))
        return terms

    # Search within components and synonyms
    for muscle, entry in graph.items():
        all_names = [muscle] + entry.get("synonyms", []) + entry.get("components", [])
        if key in [n.lower() for n in all_names]:
            terms = [muscle]
            terms.extend(entry.get("synonyms", []))
            terms.extend(entry.get("components", []))
            return terms

    return [muscle_name]


def expand_muscle_query(query: str) -> list[str]:
    """Expand a query with ontology-derived related terms.

    Uses both the muscle graph (for anatomical synonyms/components)
    and the query expansion map (for clinical condition mappings).

    Args:
        query: Original search query.

    Returns:
        List of expanded query strings, including the original.
    """
    expanded = [query]

    # Check query expansion map for condition-based expansions
    expansion_map = _load_expansion_map()
    query_lower = query.lower()
    for key, expansions in expansion_map.items():
        if key.lower() in query_lower:
            expanded.extend(expansions)

    # Check muscle graph for anatomical expansions
    graph = _load_muscle_graph()
    for muscle_name, entry in graph.items():
        all_names = [muscle_name] + entry.get("synonyms", [])
        if any(name.lower() in query_lower for name in all_names):
            # Add components as separate queries
            for component in entry.get("components", []):
                expanded.append(query_lower.replace(muscle_name, component))
            # Add related actions
            for action in entry.get("actions", []):
                expanded.append(f"{query} {action}")
            break

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for q in expanded:
        q_lower = q.lower().strip()
        if q_lower not in seen:
            seen.add(q_lower)
            unique.append(q)

    return unique
