from __future__ import annotations

import json

from langchain_core.output_parsers import JsonOutputParser
from langchain_core.prompts import ChatPromptTemplate

from llm.dedalus_chat_model import DedalusChatModel
from schemas.workout import GeneratedPlan

SYSTEM_PROMPT = """\
You are an expert strength & conditioning coach and physiotherapist. \
Your job is to create a structured exercise routine based on the evidence-based \
training summaries provided by a research agent and the user's current physical state.

## Evidence Base (RAG Summaries)
{rag_context}

## Current Muscle States
{muscle_states}

## Valid Mesh IDs
You MUST only use mesh IDs from this list in targetMeshIds:
{available_mesh_ids}

## User Context
- Goals: {goals}
- Target duration: {duration_minutes} minutes
- Available equipment: {equipment}

## Instructions
1. Synthesize the RAG evidence into a concrete routine.
2. Start with a warm-up (dynamic stretching / activation), then compound movements, then accessories.
3. AVOID exercises that load muscles marked as "torn", "strained", or with pain >= 7.
4. For muscles marked "weak" or "recovering", prescribe lighter loads and higher reps for rehabilitation.
5. Choose sets, reps, and rest periods consistent with the RAG evidence and the user's goals.
6. In the "notes" field for each exercise, briefly explain WHY you chose it (evidence reasoning).
7. Each exercise MUST have at least one targetMeshId from the valid list.
8. Give the plan a descriptive title reflecting the goals and focus areas.

{format_instructions}
"""


def build_workout_chain():
    """Build an LCEL chain: prompt | llm | parser."""
    llm = DedalusChatModel(temperature=0.5)
    parser = JsonOutputParser(pydantic_object=GeneratedPlan)

    prompt = ChatPromptTemplate.from_messages([("system", SYSTEM_PROMPT)]).partial(
        format_instructions=parser.get_format_instructions()
    )

    return prompt | llm | parser


def format_muscle_states(muscle_states: list[dict]) -> str:
    if not muscle_states:
        return "No muscle issues reported — user is in good condition."
    lines = []
    for m in muscle_states:
        parts = [
            f"condition={m['condition']}",
            f"pain={m['pain']}/10",
            f"strength={m['strength'] * 100:.0f}%",
            f"mobility={m['mobility'] * 100:.0f}%",
        ]
        lines.append(f"- {m['meshId']}: {', '.join(parts)}")
    return "\n".join(lines)


async def generate_workout_plan(
    rag_summaries: list[str],
    muscle_states: list[dict],
    available_mesh_ids: list[str],
    goals: str = "general fitness",
    duration_minutes: int = 45,
    equipment: list[str] | None = None,
) -> dict:
    """Run the workout generation chain and return the parsed plan dict."""
    chain = build_workout_chain()
    result = await chain.ainvoke(
        {
            "rag_context": "\n\n".join(f"- {s}" for s in rag_summaries),
            "muscle_states": format_muscle_states(muscle_states),
            "available_mesh_ids": json.dumps(available_mesh_ids),
            "goals": goals,
            "duration_minutes": str(duration_minutes),
            "equipment": ", ".join(equipment) if equipment else "bodyweight only",
        }
    )
    return result
