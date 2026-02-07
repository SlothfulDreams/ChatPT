"""Context builders for the unified agent.

Extracts dynamic context (muscle states, body info, mesh IDs, selected
muscles) into the system prompt suffix.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_MUSCLE_GROUPS: dict[str, list[str]] | None = None


def _load_muscle_groups() -> dict[str, list[str]]:
    global _MUSCLE_GROUPS
    if _MUSCLE_GROUPS is None:
        path = Path(__file__).resolve().parent.parent / "data" / "muscle_groups.json"
        _MUSCLE_GROUPS = json.loads(path.read_text())
    return _MUSCLE_GROUPS


def build_context(
    muscle_states: list[Any],
    body: Any | None,
    available_mesh_ids: list[str],
    selected_mesh_ids: list[str] | None = None,
    active_groups: list[str] | None = None,
) -> str:
    """Build dynamic context string appended to the system prompt.

    Args:
        muscle_states: List of MuscleContext-like objects with meshId, condition, etc.
        body: BodyContext-like object with sex, weightKg, heightCm.
        available_mesh_ids: All valid mesh IDs the model can reference.
        selected_mesh_ids: Mesh IDs the user has selected in the 3D model.

    Returns:
        Context string to append to the system prompt.
    """
    parts: list[str] = []

    # Muscle states with issues
    issues = [m for m in muscle_states if _has_issues(m)]
    if issues:
        lines = ["\n\nCurrent muscle states with issues:"]
        for m in issues:
            lines.append(_format_muscle(m))
        parts.append("\n".join(lines))

    # Body info
    if body:
        body_parts = []
        sex = _attr(body, "sex")
        if sex:
            body_parts.append(f"sex={sex}")
        weight = _attr(body, "weightKg")
        if weight:
            body_parts.append(f"weight={weight}kg")
        height = _attr(body, "heightCm")
        if height:
            body_parts.append(f"height={height}cm")
        if body_parts:
            parts.append(f"\n\nUser body info: {', '.join(body_parts)}")

        # Equipment
        equipment = _attr(body, "equipment") or []
        if equipment:
            parts.append(f"\nAvailable equipment: {', '.join(equipment)}")

        # Fitness goal
        goals = _attr(body, "fitnessGoals")
        if goals:
            parts.append(f"\nFitness goal: {goals}")

    # Available mesh IDs grouped by muscle group for structured lookup
    grouped = _group_mesh_ids(available_mesh_ids)
    parts.append(
        "\n\n## Available Muscle Mesh IDs (use EXACT names)\n"
        "Organized by muscle group. Use the exact mesh ID strings when calling tools.\n"
    )
    for group_name, ids in grouped.items():
        label = group_name.replace("_", " ").title()
        parts.append(f"**{label}**: {json.dumps(ids)}\n")
    # Include ungrouped meshes so the LLM can still reference them
    ungrouped = _ungrouped_mesh_ids(available_mesh_ids)
    if ungrouped:
        parts.append(f"**Other**: {json.dumps(ungrouped)}\n")

    # Selected muscles
    if selected_mesh_ids:
        lines = [
            "\n\n## Currently Selected Muscles (FOCUS HERE)",
            "The user has selected these muscles on the 3D model. "
            "These are your PRIMARY targets -- update them with `update_muscle` "
            "when the user describes symptoms:",
        ]
        for mesh_id in selected_mesh_ids:
            state = next(
                (m for m in muscle_states if _attr(m, "meshId") == mesh_id), None
            )
            if state:
                lines.append(_format_muscle(state))
            else:
                lines.append(f"- {mesh_id}: (no data yet)")
        parts.append("\n".join(lines))
    else:
        parts.append(
            "\n\n## No Muscles Selected\n"
            "The user has NOT selected any muscles on the 3D model. "
            "If they describe a body area or pain location, call `select_muscles` "
            "with the relevant mesh IDs from the grouped list above and include your "
            "text response in the same turn.\n"
            "Use the muscle group headings to find the right mesh IDs for a body area."
        )

    # Active muscle groups
    if active_groups:
        labels = [g.replace("_", " ").title() for g in active_groups]
        lines = [
            "\n\n## Active Muscle Groups",
            f"The user is currently focused on these muscle groups in the 3D model: {', '.join(labels)}",
            "When the user describes symptoms without naming specific muscles, "
            "use the mesh IDs from these groups for `select_muscles` and `update_muscle`.",
        ]
        parts.append("\n".join(lines))

    return "".join(parts)


def _attr(obj: Any, key: str) -> Any:
    """Get attribute from object or dict."""
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


def _has_issues(m: Any) -> bool:
    condition = _attr(m, "condition")
    pain = _attr(m, "pain") or 0
    return condition != "healthy" or pain > 0


def _classify_mesh(name: str, groups: dict[str, list[str]]) -> list[str]:
    """Return which muscle groups a mesh name belongs to."""
    lower = name.lower().replace("_", " ")
    return [g for g, patterns in groups.items() if any(p in lower for p in patterns)]


def _group_mesh_ids(mesh_ids: list[str]) -> dict[str, list[str]]:
    """Group mesh IDs by muscle group for structured LLM context."""
    groups = _load_muscle_groups()
    result: dict[str, list[str]] = {g: [] for g in groups}
    for mesh_id in mesh_ids:
        matched = _classify_mesh(mesh_id, groups)
        for g in matched:
            result[g].append(mesh_id)
    # Drop empty groups
    return {g: ids for g, ids in result.items() if ids}


def _ungrouped_mesh_ids(mesh_ids: list[str]) -> list[str]:
    """Return mesh IDs that don't match any muscle group."""
    groups = _load_muscle_groups()
    return [m for m in mesh_ids if not _classify_mesh(m, groups)]


def _format_muscle(m: Any) -> str:
    mesh_id = _attr(m, "meshId")
    parts = [
        f"condition={_attr(m, 'condition')}",
        f"pain={_attr(m, 'pain')}/10",
        f"strength={(_attr(m, 'strength') or 0) * 100:.0f}%",
        f"mobility={(_attr(m, 'mobility') or 0) * 100:.0f}%",
    ]
    notes = _attr(m, "notes")
    if notes:
        parts.append(f'notes="{notes}"')
    summary = _attr(m, "summary")
    if summary:
        parts.append(f'summary="{summary}"')
    return f"- {mesh_id}: {', '.join(parts)}"
