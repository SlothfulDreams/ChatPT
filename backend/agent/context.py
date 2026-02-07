"""Context builders for the unified agent.

Extracts dynamic context (muscle states, body info, mesh IDs, selected
muscles) into the system prompt suffix.
"""

from __future__ import annotations

import json
from typing import Any


def build_context(
    muscle_states: list[Any],
    body: Any | None,
    available_mesh_ids: list[str],
    selected_mesh_ids: list[str] | None = None,
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

    # Available mesh IDs (cap at 150 to keep prompt reasonable)
    mesh_ids = available_mesh_ids[:150]
    parts.append(
        f"\n\nAvailable muscle mesh IDs (use EXACT names): {json.dumps(mesh_ids)}"
    )

    # Selected muscles
    if selected_mesh_ids:
        lines = [
            "\n\n## Currently Selected Muscles",
            "The user has selected the following muscles on the 3D model (focus your diagnosis on these):",
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
