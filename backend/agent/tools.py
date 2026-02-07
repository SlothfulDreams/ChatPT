"""Unified tool registry.

Classifies tools as INTERNAL (results fed back to model) or ACTION
(results sent to frontend for client-side execution).
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable

from dedalus_tools.tools import (
    get_patient_muscle_context,
    search_by_condition,
    search_by_content_type,
    search_by_exercise,
    search_by_muscle_group,
    search_knowledge_base,
)


class ToolKind(Enum):
    INTERNAL = "internal"
    ACTION = "action"


@dataclass
class ToolSpec:
    name: str
    kind: ToolKind
    schema: dict
    step_label: str
    function: Callable[..., Any] | None = None


# ---------------------------------------------------------------------------
# Internal tools -- results fed back to model
# ---------------------------------------------------------------------------

_INTERNAL_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="search_knowledge_base",
        kind=ToolKind.INTERNAL,
        function=search_knowledge_base,
        step_label="Searching knowledge base",
        schema={
            "type": "function",
            "function": {
                "name": "search_knowledge_base",
                "description": (
                    "Search the physical therapy knowledge base for clinical evidence. "
                    "Use for general questions about treatments, exercises, protocols, or evidence."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "Natural language search query.",
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results (default 5).",
                        },
                    },
                    "required": ["query"],
                },
            },
        },
    ),
    ToolSpec(
        name="search_by_muscle_group",
        kind=ToolKind.INTERNAL,
        function=search_by_muscle_group,
        step_label="Searching by muscle group",
        schema={
            "type": "function",
            "function": {
                "name": "search_by_muscle_group",
                "description": (
                    "Search for content related to a specific muscle group. "
                    "Valid groups: neck, upper_back, lower_back, chest, shoulders, "
                    "rotator_cuff, biceps, triceps, forearms, core, hip_flexors, "
                    "glutes, quads, adductors, hamstrings, calves, shins."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "muscle_group": {
                            "type": "string",
                            "description": "One of the 17 muscle group names.",
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results (default 5).",
                        },
                    },
                    "required": ["muscle_group"],
                },
            },
        },
    ),
    ToolSpec(
        name="search_by_condition",
        kind=ToolKind.INTERNAL,
        function=search_by_condition,
        step_label="Searching by condition",
        schema={
            "type": "function",
            "function": {
                "name": "search_by_condition",
                "description": (
                    "Search for evidence related to a clinical condition or diagnosis. "
                    "Use for condition-specific protocols, rehabilitation guidelines, or treatment evidence."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "condition": {
                            "type": "string",
                            "description": 'Condition or diagnosis (e.g., "ACL tear", "frozen shoulder").',
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results (default 5).",
                        },
                    },
                    "required": ["condition"],
                },
            },
        },
    ),
    ToolSpec(
        name="search_by_content_type",
        kind=ToolKind.INTERNAL,
        function=search_by_content_type,
        step_label="Searching by content type",
        schema={
            "type": "function",
            "function": {
                "name": "search_by_content_type",
                "description": (
                    "Search within a specific content category. "
                    "Valid types: exercise_technique, rehab_protocol, pathology, "
                    "assessment, anatomy, training_principles, reference_data."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "content_type": {
                            "type": "string",
                            "description": "The content category to filter on.",
                        },
                        "query": {
                            "type": "string",
                            "description": "Search query within that category.",
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results (default 5).",
                        },
                    },
                    "required": ["content_type", "query"],
                },
            },
        },
    ),
    ToolSpec(
        name="search_by_exercise",
        kind=ToolKind.INTERNAL,
        function=search_by_exercise,
        step_label="Searching exercise database",
        schema={
            "type": "function",
            "function": {
                "name": "search_by_exercise",
                "description": "Search for information about a specific exercise.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "exercise": {
                            "type": "string",
                            "description": 'Exercise name (e.g., "bench press", "shoulder external rotation").',
                        },
                        "top_k": {
                            "type": "integer",
                            "description": "Number of results (default 5).",
                        },
                    },
                    "required": ["exercise"],
                },
            },
        },
    ),
    ToolSpec(
        name="get_patient_muscle_context",
        kind=ToolKind.INTERNAL,
        function=get_patient_muscle_context,
        step_label="Loading patient data",
        schema={
            "type": "function",
            "function": {
                "name": "get_patient_muscle_context",
                "description": (
                    "Get the current patient's muscle states from the database. "
                    "Use to understand the patient's musculoskeletal status before recommendations."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "body_id": {
                            "type": "string",
                            "description": "The patient's body ID.",
                        },
                        "muscle_group": {
                            "type": "string",
                            "description": "Optional muscle group filter.",
                        },
                        "mesh_id": {
                            "type": "string",
                            "description": "Optional specific muscle mesh ID.",
                        },
                    },
                    "required": ["body_id"],
                },
            },
        },
    ),
]

# ---------------------------------------------------------------------------
# Action tools -- results sent to frontend
# ---------------------------------------------------------------------------

_ACTION_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="update_muscle",
        kind=ToolKind.ACTION,
        step_label="Updating muscle state",
        schema={
            "type": "function",
            "function": {
                "name": "update_muscle",
                "description": (
                    "Update a muscle's condition, pain level, strength, mobility, and/or clinical summary. "
                    "Use when you have gathered enough information to assess a specific muscle."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meshId": {
                            "type": "string",
                            "description": "Exact mesh ID of the muscle. Use _1 suffix for right side.",
                        },
                        "condition": {
                            "type": "string",
                            "enum": [
                                "healthy",
                                "tight",
                                "knotted",
                                "strained",
                                "torn",
                                "recovering",
                                "inflamed",
                                "weak",
                                "fatigued",
                            ],
                        },
                        "pain": {"type": "number", "description": "Pain level 0-10"},
                        "strength": {
                            "type": "number",
                            "description": "Strength ratio 0-1",
                        },
                        "mobility": {
                            "type": "number",
                            "description": "Mobility/ROM ratio 0-1",
                        },
                        "summary": {
                            "type": "string",
                            "description": "Clinical summary and recommendations.",
                        },
                    },
                    "required": ["meshId"],
                },
            },
        },
    ),
    ToolSpec(
        name="add_knot",
        kind=ToolKind.ACTION,
        step_label="Adding trigger point",
        schema={
            "type": "function",
            "function": {
                "name": "add_knot",
                "description": (
                    "Add a trigger point, adhesion, or spasm to a muscle. "
                    "Use when the user describes a specific localized point of tension or pain."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "meshId": {
                            "type": "string",
                            "description": "Exact mesh ID of the muscle",
                        },
                        "severity": {"type": "number", "description": "Severity 0-1"},
                        "type": {
                            "type": "string",
                            "enum": ["trigger_point", "adhesion", "spasm"],
                        },
                    },
                    "required": ["meshId", "severity", "type"],
                },
            },
        },
    ),
    ToolSpec(
        name="create_assessment",
        kind=ToolKind.ACTION,
        step_label="Creating assessment",
        schema={
            "type": "function",
            "function": {
                "name": "create_assessment",
                "description": (
                    "Create an overall assessment summarizing your findings from this conversation."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "summary": {
                            "type": "string",
                            "description": "Overall assessment summary",
                        },
                        "structuresAffected": {
                            "type": "array",
                            "items": {"type": "string"},
                            "description": "List of mesh IDs of affected structures",
                        },
                    },
                    "required": ["summary", "structuresAffected"],
                },
            },
        },
    ),
]

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

ALL_TOOLS = _INTERNAL_TOOLS + _ACTION_TOOLS
TOOL_REGISTRY: dict[str, ToolSpec] = {t.name: t for t in ALL_TOOLS}


def get_openai_tools() -> list[dict]:
    """Return all tool schemas in OpenAI function-calling format."""
    return [t.schema for t in ALL_TOOLS]
