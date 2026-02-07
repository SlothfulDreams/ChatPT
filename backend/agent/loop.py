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
from collections.abc import AsyncGenerator

from dedalus_labs import AsyncDedalus

from .tools import TOOL_REGISTRY, ToolKind, get_openai_tools

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

    for _turn in range(MAX_TURNS):
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

        async for chunk in stream:
            choice = chunk.choices[0] if chunk.choices else None
            if not choice:
                continue

            delta = choice.delta
            if choice.finish_reason:
                finish_reason = choice.finish_reason

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
                # Emit step start
                yield _sse({"type": "step", "label": spec.step_label, "tool": name})

                # Execute -- async tools (research sub-agent) awaited directly,
                # sync tools (get_patient_muscle_context) run in thread pool
                try:
                    if inspect.iscoroutinefunction(spec.function):
                        result = await spec.function(**params)
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
                        "tool": name,
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
                action = {"name": name, "params": params}
                accumulated_actions.append(action)

                # Synthetic ack so the model knows the action was dispatched
                tool_msg = {
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": f"Action '{name}' dispatched to client.",
                }
                messages.append(tool_msg)
                tool_thread.append(tool_msg)

    # Done -- emit final event
    yield _sse(
        {
            "type": "done",
            "content": final_text,
            "actions": accumulated_actions,
            "toolThread": tool_thread,
        }
    )
