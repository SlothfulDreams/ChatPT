"""Dedalus SDK runner exposing RAG as tool-calling agent.

Usage:
    from backend.dedalus_tools import run_pt_agent

    result = await run_pt_agent("What exercises help with rotator cuff impingement?")
    print(result)

Or as a standalone script:
    python -m backend.dedalus_tools.runner "your question here"
"""

from __future__ import annotations

import asyncio
import os
import sys

from dotenv import load_dotenv

load_dotenv()

from dedalus_labs import AsyncDedalus, DedalusRunner

from .tools import ALL_TOOLS

_PT_SYSTEM_PROMPT = """\
You are a physical therapy clinical decision support assistant.

You have access to a knowledge base of clinical evidence, exercise protocols,
anatomy references, and rehabilitation guidelines. Use the provided tools to
search for relevant information before answering questions.

Guidelines:
- Always search the knowledge base before giving clinical recommendations
- Cite sources when available (include score and source document)
- If information is not found, say so clearly rather than guessing
- Be specific about muscle groups, conditions, and exercises
- Distinguish between evidence-based recommendations and clinical opinion

You do NOT diagnose or prescribe. You provide evidence-based information to
support clinical decision-making."""


async def run_pt_agent(
    query: str,
    model: str | None = None,
    body_id: str | None = None,
) -> str:
    """Run a PT clinical query through the Dedalus agent with RAG tools.

    Args:
        query: User's clinical question.
        model: Model to use. Defaults to DEDALUS_MODEL env var or openai/gpt-5.2.
        body_id: Optional patient body ID. When provided, the agent can
            use get_patient_muscle_context to look up current muscle states.

    Returns:
        Agent's final response string.
    """
    model = model or os.getenv("DEDALUS_MODEL", "openai/gpt-5.2")
    client = AsyncDedalus()
    runner = DedalusRunner(client)

    instructions = _PT_SYSTEM_PROMPT
    if body_id:
        instructions += (
            f"\n\nThe current patient's body ID is: {body_id}\n"
            "Use get_patient_muscle_context with this ID to look up their "
            "current muscle status when relevant to the query."
        )

    result = await runner.run(
        input=query,
        model=model,
        instructions=instructions,
        tools=ALL_TOOLS,
    )

    return result.final_output


async def run_pt_agent_as_tool(query: str, body_id: str | None = None) -> str:
    """Wrap the PT agent as a Dedalus tool for use by a coordinator agent.

    This lets a higher-level agent delegate clinical questions to this
    specialist without giving up conversation control.

    Args:
        query: Clinical question to research.
        body_id: Optional patient body ID for context.

    Returns:
        Evidence-based response from the PT knowledge base.
    """
    return await run_pt_agent(query, body_id=body_id)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python -m backend.dedalus_tools.runner 'your question'")
        sys.exit(1)

    query = " ".join(sys.argv[1:])
    result = asyncio.run(run_pt_agent(query))
    print(result)
