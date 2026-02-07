"""RAG tools exposed as plain Python functions for the Dedalus SDK.

Shaped for DedalusRunner: typed parameters, docstrings, no decorators.
"""

from __future__ import annotations

from pathlib import Path

from .convex_client import get_convex_client
from .retrieval.retriever import PTRetriever

_SHARED_JSON = Path(__file__).resolve().parents[1] / "data" / "muscle_groups.json"

_retriever = PTRetriever()


def _format_results(results: list[dict], include_source: bool = True) -> str:
    """Format retriever results into a readable string."""
    if not results:
        return "No relevant results found."
    lines = []
    for i, r in enumerate(results, 1):
        score = r.get("score", 0)
        source = r.get("source", "unknown")
        text = r.get("text", "")
        header = (
            f"[{i}] (score: {score:.3f}, source: {source})"
            if include_source
            else f"[{i}]"
        )
        lines.append(f"{header}\n{text}\n")
    return "\n".join(lines)


def search_knowledge_base(query: str, top_k: int = 5) -> str:
    """Search the physical therapy knowledge base for clinical evidence.

    Use for general questions about treatments, exercises, protocols, or evidence.

    Args:
        query: Natural language search query.
        top_k: Number of results to return.

    Returns:
        Formatted search results with scores and sources.
    """
    results = _retriever.search(query, top_k=top_k)
    return _format_results(results)


def search_by_muscle_group(muscle_group: str, top_k: int = 5) -> str:
    """Search for content related to a specific muscle group.

    Valid groups: neck, upper_back, lower_back, chest, shoulders,
    rotator_cuff, biceps, triceps, forearms, core, hip_flexors,
    glutes, quads, adductors, hamstrings, calves, shins.

    Args:
        muscle_group: One of the 17 muscle group names.
        top_k: Number of results to return.

    Returns:
        Formatted search results filtered by the muscle group.
    """
    results = _retriever.search_by_muscle_group(muscle_group, top_k=top_k)
    if not results:
        return f"No results found for muscle group: {muscle_group}"
    return _format_results(results)


def search_by_condition(condition: str, top_k: int = 5) -> str:
    """Search for evidence related to a clinical condition or diagnosis.

    Use for condition-specific protocols, rehabilitation guidelines,
    or treatment evidence (e.g., "ACL tear", "frozen shoulder", "impingement").

    Args:
        condition: Clinical condition or diagnosis name.
        top_k: Number of results to return.

    Returns:
        Formatted search results filtered by the condition.
    """
    results = _retriever.search_by_condition(condition, top_k=top_k)
    if not results:
        return f"No results found for condition: {condition}"
    return _format_results(results)


def search_by_content_type(content_type: str, query: str, top_k: int = 5) -> str:
    """Search within a specific content category.

    Valid types: exercise_technique, rehab_protocol, pathology,
    assessment, anatomy, training_principles, reference_data.

    Args:
        content_type: The content category to filter on.
        query: Search query within that category.
        top_k: Number of results to return.

    Returns:
        Formatted search results filtered by content type.
    """
    results = _retriever.search_by_content_type(content_type, query, top_k=top_k)
    if not results:
        return (
            f"No results found for content type '{content_type}' with query '{query}'"
        )
    return _format_results(results)


def search_by_exercise(exercise: str, top_k: int = 5) -> str:
    """Search for information about a specific exercise.

    Args:
        exercise: Exercise name (e.g., "bench press", "squat", "shoulder external rotation").
        top_k: Number of results to return.

    Returns:
        Formatted search results related to the exercise.
    """
    results = _retriever.search_by_exercise(exercise, top_k=top_k)
    if not results:
        return f"No results found for exercise: {exercise}"
    return _format_results(results)


# Loaded from backend/data/muscle_groups.json -- single source of truth for all consumers.
import json as _json

_MUSCLE_GROUP_PATTERNS: dict[str, list[str]] = _json.loads(_SHARED_JSON.read_text())


def _mesh_in_group(mesh_id: str, group: str) -> bool:
    """Check if a meshId belongs to a muscle group (case-insensitive substring)."""
    patterns = _MUSCLE_GROUP_PATTERNS.get(group, [])
    lower = mesh_id.lower().replace("_", " ")
    return any(p in lower for p in patterns)


def _format_muscle(m: dict) -> str:
    """Format a single muscle record into a readable line."""
    parts = [
        f"condition={m['condition']}",
        f"pain={m['pain']}/10",
        f"strength={m['strength'] * 100:.0f}%",
        f"mobility={m['mobility'] * 100:.0f}%",
    ]
    if m.get("notes"):
        parts.append(f'notes="{m["notes"]}"')
    if m.get("summary"):
        parts.append(f'summary="{m["summary"]}"')
    return f"  - {m['meshId']}: {', '.join(parts)}"


def get_patient_muscle_context(
    body_id: str,
    muscle_group: str = "",
    mesh_id: str = "",
) -> str:
    """Get the current patient's muscle states from the database.

    Use this to understand the patient's musculoskeletal status before making
    clinical recommendations. Can fetch all muscles, filter by muscle group,
    or look up a specific muscle by mesh ID.

    Args:
        body_id: The patient's body ID (always required).
        muscle_group: Optional muscle group filter. Valid groups: neck,
            upper_back, lower_back, chest, shoulders, rotator_cuff, biceps,
            triceps, forearms, core, hip_flexors, glutes, quads, adductors,
            hamstrings, calves, shins.
        mesh_id: Optional specific muscle mesh ID (e.g., "Deltoid muscle",
            "Biceps brachii muscle"). Use _1 suffix for right side.

    Returns:
        Formatted summary of muscle states.
    """
    client = get_convex_client()
    muscles = client.query("muscles:getByBody", {"bodyId": body_id})

    if not muscles:
        return "No muscle data found for this patient."

    # Filter by mesh_id if provided
    if mesh_id:
        target = mesh_id.lower().replace("_", " ")
        matches = [
            m
            for m in muscles
            if m["meshId"].lower().replace("_", " ") == target
            or target in m["meshId"].lower().replace("_", " ")
        ]
        if not matches:
            return f"No data found for muscle '{mesh_id}' on this patient."
        lines = [f"Muscle detail for '{mesh_id}':"]
        for m in matches:
            lines.append(_format_muscle(m))
        return "\n".join(lines)

    # Filter by muscle_group if provided
    if muscle_group:
        group_key = muscle_group.lower().strip()
        if group_key not in _MUSCLE_GROUP_PATTERNS:
            return (
                f"Unknown muscle group '{muscle_group}'. "
                f"Valid groups: {', '.join(_MUSCLE_GROUP_PATTERNS.keys())}"
            )
        matches = [m for m in muscles if _mesh_in_group(m["meshId"], group_key)]
        if not matches:
            return f"No tracked muscles in the '{muscle_group}' group for this patient."
        issues = [m for m in matches if m["condition"] != "healthy" or m["pain"] > 0]
        if not issues:
            return (
                f"Patient has {len(matches)} tracked muscles in '{muscle_group}', "
                "all healthy with no pain."
            )
        lines = [
            f"{muscle_group} status ({len(issues)} affected out of {len(matches)}):"
        ]
        for m in issues:
            lines.append(_format_muscle(m))
        return "\n".join(lines)

    # Default: all affected muscles
    issues = [m for m in muscles if m["condition"] != "healthy" or m["pain"] > 0]
    if not issues:
        return (
            f"Patient has {len(muscles)} tracked muscles, all in healthy condition "
            "with no pain reported."
        )
    lines = [
        f"Patient muscle status ({len(issues)} affected out of {len(muscles)} tracked):"
    ]
    for m in issues:
        lines.append(_format_muscle(m))
    return "\n".join(lines)


# All tools in a list for easy passing to DedalusRunner
ALL_TOOLS = [
    search_knowledge_base,
    search_by_muscle_group,
    search_by_condition,
    search_by_content_type,
    search_by_exercise,
    get_patient_muscle_context,
]
