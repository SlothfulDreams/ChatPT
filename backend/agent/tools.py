"""Unified tool registry.

Orchestrator tools exposed to the main agentic loop.
RAG search tools are wrapped into a single `research` agent-as-tool
that uses a fast/cheap model (Cerebras Llama 3.3 70B) internally.
ACTION tools (muscle updates, assessments) are collected and sent
to the frontend for client-side execution.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable

from dedalus_labs import AsyncDedalus, DedalusRunner

from dedalus_tools.tools import (
    ALL_TOOLS as RAG_TOOLS,
    get_patient_muscle_context,
)

# Friendly labels for RAG sub-tools
_SUBTOOL_LABELS: dict[str, str] = {
    "search_knowledge_base": "Searching knowledge base",
    "search_by_muscle_group": "Searching by muscle group",
    "search_by_condition": "Searching by condition",
    "search_by_content_type": "Searching by content type",
    "search_by_exercise": "Searching exercise database",
}


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
# Research agent-as-tool (wraps all RAG search tools)
# ---------------------------------------------------------------------------

_research_client: AsyncDedalus | None = None


def _get_research_client() -> AsyncDedalus:
    """BYOK Dedalus client for research sub-agent (Cerebras)."""
    global _research_client
    if _research_client is None:
        cerebras_key = os.environ.get("CEREBRAS_API_KEY", "")
        if cerebras_key:
            _research_client = AsyncDedalus(
                provider="cerebras",
                provider_key=cerebras_key,
            )
        else:
            # Fallback to default Dedalus routing
            _research_client = AsyncDedalus()
    return _research_client


async def research(
    query: str,
    focus: str = "",
    _event_queue: asyncio.Queue | None = None,
) -> str:
    """Research clinical evidence using the physical therapy knowledge base.

    A sub-agent searches across exercises, conditions, muscle groups,
    content types, and general clinical evidence. It autonomously decides
    which search strategies to use and synthesizes findings.

    Args:
        query: What to research (e.g., "rotator cuff impingement rehab protocols").
        focus: Optional focus area to guide research. Can be a muscle group
            (e.g., "shoulders"), condition (e.g., "ACL tear"), content type
            (e.g., "exercise_technique"), or exercise name (e.g., "bench press").
        _event_queue: Internal -- queue for pushing substep events to the SSE stream.

    Returns:
        Synthesized research findings with cited sources.
    """
    client = _get_research_client()
    runner = DedalusRunner(client)
    model = os.environ.get("TOOL_MODEL", "cerebras/gpt-oss-120b")

    prompt = f"Research the following clinical question thoroughly. Use multiple search tools to gather comprehensive evidence. Synthesize your findings into a clear, evidence-based summary.\n\nQuery: {query}"
    if focus:
        prompt += f"\nFocus area: {focus}"

    stream = runner.run(
        input=prompt,
        model=model,
        tools=RAG_TOOLS,
        max_steps=5,
        instructions=(
            "You are a clinical research assistant. Search the knowledge base "
            "using the available tools to find relevant evidence. Use multiple "
            "search strategies (general search, by condition, by muscle group, "
            "by exercise, by content type) as appropriate. Synthesize findings "
            "concisely with source references."
        ),
        max_tokens=2048,
        stream=True,
    )

    final_text = ""
    seen_tools: set[str] = set()

    async for chunk in stream:
        if not hasattr(chunk, "choices") or not chunk.choices:
            continue
        delta = chunk.choices[0].delta if hasattr(chunk.choices[0], "delta") else None
        if not delta:
            continue

        # Detect sub-agent tool calls and emit substep events
        if delta.tool_calls and _event_queue:
            for tc in delta.tool_calls:
                if (
                    tc.function
                    and tc.function.name
                    and tc.function.name not in seen_tools
                ):
                    seen_tools.add(tc.function.name)
                    label = _SUBTOOL_LABELS.get(tc.function.name, tc.function.name)
                    await _event_queue.put(
                        {"type": "substep", "tool": tc.function.name, "label": label}
                    )

        # When we see finish_reason=tool_calls, tools are about to execute.
        # When we see text after that, tools have completed.
        fr = (
            chunk.choices[0].finish_reason
            if hasattr(chunk.choices[0], "finish_reason")
            else None
        )
        if fr == "tool_calls" and _event_queue:
            # Mark all seen tools as executing (they run between this chunk and the next text)
            pass

        if delta.content:
            final_text += delta.content

    # Mark all substeps complete
    if _event_queue:
        for tool_name in seen_tools:
            label = _SUBTOOL_LABELS.get(tool_name, tool_name)
            await _event_queue.put(
                {
                    "type": "substep_complete",
                    "tool": tool_name,
                    "label": f"{label} done",
                }
            )

    return final_text


# ---------------------------------------------------------------------------
# Internal tools -- results fed back to orchestrator
# ---------------------------------------------------------------------------

_INTERNAL_TOOLS: list[ToolSpec] = [
    ToolSpec(
        name="research",
        kind=ToolKind.INTERNAL,
        function=research,
        step_label="Researching clinical evidence",
        schema={
            "type": "function",
            "function": {
                "name": "research",
                "description": (
                    "Research clinical evidence using a sub-agent that searches the "
                    "physical therapy knowledge base. The sub-agent autonomously "
                    "decides which search strategies to use (general search, by "
                    "condition, muscle group, exercise, or content type) and "
                    "synthesizes findings. Use this before making any clinical "
                    "recommendations."
                ),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {
                            "type": "string",
                            "description": "What to research (e.g., 'rotator cuff impingement rehab protocols').",
                        },
                        "focus": {
                            "type": "string",
                            "description": (
                                "Optional focus area: a muscle group (e.g., 'shoulders'), "
                                "condition ('ACL tear'), content type ('exercise_technique'), "
                                "or exercise name ('bench press')."
                            ),
                        },
                    },
                    "required": ["query"],
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
