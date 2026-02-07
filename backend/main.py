from __future__ import annotations

import json
import os

from dotenv import load_dotenv

load_dotenv()

from dedalus_labs import AsyncDedalus
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from schemas.workout import GenerateWorkoutRequest

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:3001",
        os.getenv("FRONTEND_URL", ""),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = AsyncDedalus()  # uses DEDALUS_API_KEY env var

# ============================================
# Models
# ============================================


class MuscleContext(BaseModel):
    meshId: str
    condition: str
    pain: float
    strength: float
    mobility: float
    notes: str | None = None
    summary: str | None = None


class BodyContext(BaseModel):
    sex: str
    weightKg: float | None = None
    heightCm: float | None = None
    birthDate: float | None = None


class MessageInput(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversationHistory: list[MessageInput]
    muscleStates: list[MuscleContext]
    body: BodyContext | None = None
    availableMeshIds: list[str]
    selectedMeshIds: list[str] = []


# ============================================
# Tools
# ============================================

TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "update_muscle",
            "description": (
                "Update a muscle's condition, pain level, strength, mobility, and/or clinical summary. "
                "Use this when you have gathered enough information to make an assessment about a specific muscle. "
                "You don't need all fields -- only provide what you can reasonably assess from the conversation."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "meshId": {
                        "type": "string",
                        "description": "The exact mesh ID of the muscle to update. Use _1 suffix for right side.",
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
                    "pain": {
                        "type": "number",
                        "description": "Pain level 0-10",
                    },
                    "strength": {
                        "type": "number",
                        "description": "Strength ratio 0-1 (1 = full strength)",
                    },
                    "mobility": {
                        "type": "number",
                        "description": "Mobility/ROM ratio 0-1 (1 = full range)",
                    },
                    "summary": {
                        "type": "string",
                        "description": "Clinical summary of the muscle's current status, your reasoning, and any recommendations.",
                    },
                },
                "required": ["meshId"],
            },
        },
    },
    {
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
                        "description": "The exact mesh ID of the muscle",
                    },
                    "severity": {
                        "type": "number",
                        "description": "Severity 0-1",
                    },
                    "type": {
                        "type": "string",
                        "enum": ["trigger_point", "adhesion", "spasm"],
                    },
                },
                "required": ["meshId", "severity", "type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_assessment",
            "description": (
                "Create an overall assessment summarizing your findings from this conversation. "
                "Use this when you have a comprehensive picture and want to record a formal assessment."
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
]

# ============================================
# System Prompt
# ============================================

SYSTEM_PROMPT = """You are an expert physiotherapist AI assistant integrated into a 3D body visualization app called ChatPT. Your role is to help users understand, track, and manage their musculoskeletal issues.

## Your Approach
1. LISTEN to the user's description of pain, tightness, or discomfort
2. ASK targeted follow-up questions to narrow down the assessment:
   - Location specificity (which side? upper/lower portion?)
   - Pain character (sharp, dull, burning, aching?)
   - Onset (sudden or gradual? activity-related?)
   - Aggravating/relieving factors
   - Duration and frequency
   - Impact on daily activities or training
3. Only AFTER gathering sufficient information, use your tools to update muscle states

## Clinical Reasoning
- Consider referred pain patterns (e.g., upper trap tension causing headaches)
- Think about kinetic chain relationships (e.g., weak glutes -> overactive hip flexors -> lower back pain)
- Consider common activity-specific injury patterns
- When multiple muscles could be involved, update all relevant structures
- Be conservative with severity -- start moderate and adjust based on further info

## Tool Usage
- Use update_muscle when confident about a muscle's condition. Provide only the fields you can reasonably assess.
- Use add_knot when the user describes a specific localized point of tension or pain
- Use create_assessment to summarize findings when you have a comprehensive picture
- ALWAYS explain your reasoning to the user before or alongside tool usage
- The _1 suffix on mesh IDs = right side. No suffix = left side.
- If the user reports bilateral symptoms, update BOTH sides explicitly.

## Constraints
- You are NOT a replacement for medical advice. For serious injuries (suspected tears, fractures, nerve issues), recommend professional evaluation.
- Be conversational and empathetic but efficient. No fluff.
- Do NOT fabricate conditions -- if information is insufficient, ask more questions.
- Only use mesh IDs from the available list provided in context.

## Response Style
- Concise, clinically informed, approachable
- Use anatomical terms but explain them plainly when first mentioned
- When using tools, briefly explain what you're recording and why
"""


# ============================================
# Endpoints
# ============================================


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: ChatRequest):
    # Build muscle context for the system prompt
    muscle_context = ""
    issues = [m for m in request.muscleStates if m.condition != "healthy" or m.pain > 0]
    if issues:
        muscle_context = "\n\nCurrent muscle states with issues:\n"
        for m in issues:
            parts = [
                f"condition={m.condition}",
                f"pain={m.pain}/10",
                f"strength={m.strength * 100:.0f}%",
                f"mobility={m.mobility * 100:.0f}%",
            ]
            if m.notes:
                parts.append(f'notes="{m.notes}"')
            if m.summary:
                parts.append(f'summary="{m.summary}"')
            muscle_context += f"- {m.meshId}: {', '.join(parts)}\n"

    body_context = ""
    if request.body:
        body_parts = [f"sex={request.body.sex}"]
        if request.body.weightKg:
            body_parts.append(f"weight={request.body.weightKg}kg")
        if request.body.heightCm:
            body_parts.append(f"height={request.body.heightCm}cm")
        body_context = f"\n\nUser body info: {', '.join(body_parts)}"

    # Provide available mesh IDs so the LLM only uses valid ones
    mesh_ids = request.availableMeshIds[:150]
    mesh_context = (
        f"\n\nAvailable muscle mesh IDs (use EXACT names): {json.dumps(mesh_ids)}"
    )

    # Build selected muscle context when user has selected specific muscles
    selected_context = ""
    if request.selectedMeshIds:
        selected_context = "\n\n## Currently Selected Muscles\nThe user has selected the following muscles on the 3D model (focus your diagnosis on these):\n"
        for mesh_id in request.selectedMeshIds:
            # Find matching muscle state if it exists
            state = next((m for m in request.muscleStates if m.meshId == mesh_id), None)
            if state:
                parts = [
                    f"condition={state.condition}",
                    f"pain={state.pain}/10",
                    f"strength={state.strength * 100:.0f}%",
                    f"mobility={state.mobility * 100:.0f}%",
                ]
                if state.summary:
                    parts.append(f'summary="{state.summary}"')
                selected_context += f"- {mesh_id}: {', '.join(parts)}\n"
            else:
                selected_context += f"- {mesh_id}: (no data yet)\n"

    system = (
        SYSTEM_PROMPT + muscle_context + body_context + mesh_context + selected_context
    )

    # Build messages array with system prompt as first message (OpenAI format)
    messages: list[dict] = [{"role": "system", "content": system}]
    for msg in request.conversationHistory:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": request.message})

    async def generate():
        stream = await client.chat.completions.create(
            model=os.getenv("DEDALUS_MODEL", "openai/gpt-5.2"),
            max_tokens=2048,
            messages=messages,
            tools=TOOLS,
            stream=True,
        )

        # Accumulate tool calls by index (OpenAI streaming format)
        tool_calls_by_index: dict[int, dict] = {}
        accumulated_text = ""

        async for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            if not delta:
                continue

            # Text content
            if delta.content:
                accumulated_text += delta.content
                yield f"data: {json.dumps({'type': 'text_delta', 'text': delta.content})}\n\n"

            # Tool calls
            if delta.tool_calls:
                for tc_delta in delta.tool_calls:
                    idx = tc_delta.index
                    if idx not in tool_calls_by_index:
                        tool_calls_by_index[idx] = {
                            "name": "",
                            "arguments": "",
                        }
                    if tc_delta.function and tc_delta.function.name:
                        tool_calls_by_index[idx]["name"] = tc_delta.function.name
                    if tc_delta.function and tc_delta.function.arguments:
                        tool_calls_by_index[idx]["arguments"] += tc_delta.function.arguments

        # Build actions from accumulated tool calls
        actions = []
        for tc in tool_calls_by_index.values():
            try:
                params = json.loads(tc["arguments"]) if tc["arguments"] else {}
            except json.JSONDecodeError:
                params = {}
            actions.append({"name": tc["name"], "params": params})

        yield f"data: {json.dumps({'type': 'done', 'content': accumulated_text, 'actions': actions})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@app.post("/generate-workout")
async def generate_workout(request: GenerateWorkoutRequest):
    from chains.workout_chain import generate_workout_plan
    from services.image_gen import generate_all_exercise_images

    # 1. Run LangChain chain with RAG summaries + user context
    plan = await generate_workout_plan(
        rag_summaries=request.ragSummaries,
        muscle_states=[m.model_dump() for m in request.muscleStates],
        available_mesh_ids=request.availableMeshIds,
        goals=request.goals,
        duration_minutes=request.durationMinutes,
        equipment=request.equipment,
    )

    # 2. Generate images for each exercise via Dedalus/Gemini
    exercises = plan.get("exercises", [])
    exercises = await generate_all_exercise_images(exercises)
    plan["exercises"] = exercises

    # 3. Return GeneratedPlan matching Convex schema
    return plan


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
