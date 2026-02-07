"""Multi-turn agentic loop with streaming.

Streams SSE events to the frontend while executing an agentic
tool-calling loop. Internal tools (research sub-agent, patient context)
feed results back to the model. Action tools (muscle updates) are
collected and sent to the frontend for client-side execution.
"""

from __future__ import annotations

import asyncio
import inspect
import json
import logging
from collections.abc import AsyncGenerator

from dedalus_labs import AsyncDedalus

from .tools import TOOL_REGISTRY, ToolKind, get_openai_tools

logger = logging.getLogger(__name__)

MAX_TURNS = 10

_client: AsyncDedalus | None = None


def _get_client() -> AsyncDedalus:
    """Default Dedalus client for the orchestrator."""
    global _client
    if _client is None:
        _client = AsyncDedalus()
    return _client


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _format_mesh_id(mesh_id: str) -> str:
    """Convert a runtime mesh ID to a readable name. e.g. 'Brachialis_musclel' -> 'Brachialis muscle (L)'."""
    name = mesh_id
    side = ""
    if name.endswith("l"):
        side = " (L)"
        name = name[:-1]
    elif name.endswith("r"):
        side = " (R)"
        name = name[:-1]
    # Strip trailing dot/period left from .l/.r removal
    name = name.rstrip(".")
    return name.replace("_", " ") + side


def _action_label(name: str, params: dict, default_label: str) -> str:
    """Build a descriptive step label for action tools that includes muscle context."""
    if name == "select_muscles":
        mesh_ids = params.get("meshIds", [])
        if mesh_ids:
            # Deduplicate bilateral pairs into a single name
            seen: set[str] = set()
            names: list[str] = []
            for mid in mesh_ids:
                base = mid.rstrip("lr").rstrip(".")
                if base not in seen:
                    seen.add(base)
                    names.append(_format_mesh_id(mid).rsplit(" (", 1)[0])
            display = ", ".join(names[:4])
            if len(names) > 4:
                display += f" +{len(names) - 4} more"
            return f"Selecting {display}"
    elif name == "update_muscle":
        mesh_id = params.get("meshId", "")
        if mesh_id:
            readable = _format_mesh_id(mesh_id)
            condition = params.get("condition", "")
            if condition:
                return f"Updating {readable}: {condition}"
            return f"Updating {readable}"
    return default_label


async def run_agent_stream(
    messages: list[dict],
    *,
    orchestrator_model: str = "openai/gpt-5.3",
    tool_model: str = "cerebras/gpt-oss-120b",
) -> AsyncGenerator[str, None]:
    """Run the agentic loop, yielding SSE-formatted strings.

    Events emitted:
        step          - internal tool execution started
        step_complete - internal tool execution finished
        text_delta    - incremental text from the model
        done          - final response with content + actions + tool thread

    The orchestrator model handles all turns (reasoning + tool dispatch).
    The tool_model is used by the research sub-agent internally.

    Args:
        messages: Full conversation history (system + user + assistant + tool messages).
        orchestrator_model: High-reasoning model for the orchestrator loop.
        tool_model: Passed via env for the research sub-agent (not used directly here).

    Yields:
        SSE-formatted strings.
    """
    client = _get_client()
    tools = get_openai_tools()
    accumulated_actions: list[dict] = []
    final_text = ""
    tool_thread: list[dict] = []

    try:
        for _turn in range(MAX_TURNS):
            logger.info("Turn %d/%d starting", _turn + 1, MAX_TURNS)

            # Emit thinking indicator while the model processes
            thinking_id = f"thinking_{_turn}"
            yield _sse({"type": "step", "tool": thinking_id, "label": "Thinking..."})

            stream = await client.chat.completions.create(
                model=orchestrator_model,
                messages=messages,
                tools=tools,
                stream=True,
                max_tokens=4096,
            )

            tool_calls_by_index: dict[int, dict] = {}
            turn_text = ""
            finish_reason = None
            thinking_resolved = False

            async for chunk in stream:
                choice = chunk.choices[0] if chunk.choices else None
                if not choice:
                    continue

                delta = choice.delta
                if choice.finish_reason:
                    finish_reason = choice.finish_reason

                # Resolve thinking indicator on first meaningful output
                if (
                    not thinking_resolved
                    and delta
                    and (delta.content or delta.tool_calls)
                ):
                    thinking_resolved = True
                    yield _sse(
                        {
                            "type": "step_complete",
                            "tool": thinking_id,
                            "label": "Thinking",
                        }
                    )

                # Stream text deltas to frontend
                if delta and delta.content:
                    turn_text += delta.content
                    yield _sse({"type": "text_delta", "text": delta.content})

                # Accumulate tool calls from streaming deltas
                if delta and delta.tool_calls:
                    for tc_delta in delta.tool_calls:
                        idx = tc_delta.index
                        if idx not in tool_calls_by_index:
                            tool_calls_by_index[idx] = {
                                "id": tc_delta.id or "",
                                "name": "",
                                "arguments": "",
                            }
                        if tc_delta.id:
                            tool_calls_by_index[idx]["id"] = tc_delta.id
                        if tc_delta.function and tc_delta.function.name:
                            tool_calls_by_index[idx]["name"] = tc_delta.function.name
                        if tc_delta.function and tc_delta.function.arguments:
                            tool_calls_by_index[idx]["arguments"] += (
                                tc_delta.function.arguments
                            )

            # Resolve thinking if the stream ended without content (edge case)
            if not thinking_resolved:
                yield _sse(
                    {
                        "type": "step_complete",
                        "tool": thinking_id,
                        "label": "Thinking",
                    }
                )

            final_text += turn_text

            # No tool calls -- model is done
            if not tool_calls_by_index:
                break

            # Build assistant message with tool_calls for conversation history
            assistant_msg: dict = {"role": "assistant"}
            if turn_text:
                assistant_msg["content"] = turn_text

            assistant_tool_calls = []
            for idx in sorted(tool_calls_by_index.keys()):
                tc = tool_calls_by_index[idx]
                assistant_tool_calls.append(
                    {
                        "id": tc["id"],
                        "type": "function",
                        "function": {
                            "name": tc["name"],
                            "arguments": tc["arguments"],
                        },
                    }
                )
            assistant_msg["tool_calls"] = assistant_tool_calls
            messages.append(assistant_msg)
            tool_thread.append(assistant_msg)

            # Process each tool call
            for idx in sorted(tool_calls_by_index.keys()):
                tc = tool_calls_by_index[idx]
                name = tc["name"]
                logger.info("Executing tool: %s", name)
                try:
                    params = json.loads(tc["arguments"]) if tc["arguments"] else {}
                except json.JSONDecodeError:
                    params = {}

                spec = TOOL_REGISTRY.get(name)
                if not spec:
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": f"Error: Unknown tool '{name}'",
                    }
                    messages.append(tool_msg)
                    tool_thread.append(tool_msg)
                    continue

                if spec.kind == ToolKind.INTERNAL:
                    # Unique step ID so multiple calls don't collide
                    step_id = f"{name}_{_turn}_{idx}"

                    # Emit step start
                    yield _sse(
                        {"type": "step", "label": spec.step_label, "tool": step_id}
                    )

                    try:
                        if name == "research":
                            # Research sub-agent: stream substep events via queue
                            event_queue: asyncio.Queue = asyncio.Queue()
                            params["_event_queue"] = event_queue
                            params["_step_id"] = step_id

                            # Run research and drain substep events concurrently
                            research_task = asyncio.create_task(spec.function(**params))
                            while not research_task.done():
                                try:
                                    event = await asyncio.wait_for(
                                        event_queue.get(), timeout=0.1
                                    )
                                    yield _sse(event)
                                except asyncio.TimeoutError:
                                    continue
                            result = research_task.result()
                            # Drain remaining events
                            while not event_queue.empty():
                                yield _sse(event_queue.get_nowait())
                            result_str = str(result)
                        elif inspect.iscoroutinefunction(spec.function):
                            result = await spec.function(**params)
                            result_str = str(result)
                        else:
                            result = await asyncio.to_thread(spec.function, **params)
                            result_str = str(result)
                    except Exception as e:
                        result_str = f"Tool error: {e}"

                    # Emit step complete
                    yield _sse(
                        {
                            "type": "step_complete",
                            "label": f"{spec.step_label} complete",
                            "tool": step_id,
                        }
                    )

                    # Feed result back to model
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": result_str,
                    }
                    messages.append(tool_msg)
                    tool_thread.append(tool_msg)

                elif spec.kind == ToolKind.ACTION:
                    # Build descriptive label with muscle context
                    label = _action_label(name, params, spec.step_label)
                    step_id = f"{name}_{idx}"

                    # Emit step event so the user sees feedback
                    yield _sse({"type": "step", "label": label, "tool": step_id})

                    action = {"name": name, "params": params}
                    accumulated_actions.append(action)

                    # Emit step complete
                    yield _sse(
                        {
                            "type": "step_complete",
                            "label": f"{label} complete",
                            "tool": step_id,
                        }
                    )

                    # Assertive ack so the model does NOT re-call
                    tool_msg = {
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": f"Action '{name}' executed successfully and applied to the UI. Proceed with your text response to the user.",
                    }
                    messages.append(tool_msg)
                    tool_thread.append(tool_msg)
    except Exception:
        logger.exception("Agent loop failed")
        if not final_text:
            final_text = (
                "Something went wrong processing your request. Please try again."
            )

    # Done -- emit final event
    yield _sse(
        {
            "type": "done",
            "content": final_text,
            "actions": accumulated_actions,
            "toolThread": tool_thread,
        }
    )
