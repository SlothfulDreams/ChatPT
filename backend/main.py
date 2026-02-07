from __future__ import annotations

import json
import os

import anthropic
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

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

client = anthropic.Anthropic()  # uses ANTHROPIC_API_KEY env var

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


# ============================================
# Tools
# ============================================

TOOLS: list[anthropic.types.ToolParam] = [
    {
        "name": "update_muscle",
        "description": (
            "Update a muscle's condition, pain level, strength, mobility, and/or clinical summary. "
            "Use this when you have gathered enough information to make an assessment about a specific muscle. "
            "You don't need all fields -- only provide what you can reasonably assess from the conversation."
        ),
        "input_schema": {
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
    {
        "name": "add_knot",
        "description": (
            "Add a trigger point, adhesion, or spasm to a muscle. "
            "Use when the user describes a specific localized point of tension or pain."
        ),
        "input_schema": {
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
    {
        "name": "create_assessment",
        "description": (
            "Create an overall assessment summarizing your findings from this conversation. "
            "Use this when you have a comprehensive picture and want to record a formal assessment."
        ),
        "input_schema": {
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

    system = SYSTEM_PROMPT + muscle_context + body_context + mesh_context

    # Build messages array
    messages: list[anthropic.types.MessageParam] = []
    for msg in request.conversationHistory:
        messages.append({"role": msg.role, "content": msg.content})  # type: ignore[arg-type]
    messages.append({"role": "user", "content": request.message})

    async def generate():
        with client.messages.stream(
            model=os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-20250514"),
            max_tokens=2048,
            system=system,
            messages=messages,
            tools=TOOLS,
        ) as stream:
            tool_calls: list[dict] = []
            current_tool_input = ""
            accumulated_text = ""

            for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "tool_use":
                        tool_calls.append(
                            {
                                "id": event.content_block.id,
                                "name": event.content_block.name,
                                "input": "",
                            }
                        )
                        current_tool_input = ""
                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        accumulated_text += event.delta.text
                        yield f"data: {json.dumps({'type': 'text_delta', 'text': event.delta.text})}\n\n"
                    elif event.delta.type == "input_json_delta":
                        current_tool_input += event.delta.partial_json
                elif event.type == "content_block_stop":
                    if tool_calls and current_tool_input:
                        try:
                            tool_calls[-1]["input"] = json.loads(current_tool_input)
                        except json.JSONDecodeError:
                            tool_calls[-1]["input"] = {}
                        current_tool_input = ""

            # Build actions from tool calls
            actions = [
                {"name": tc["name"], "params": tc["input"]}
                for tc in tool_calls
                if isinstance(tc["input"], dict)
            ]

            yield f"data: {json.dumps({'type': 'done', 'content': accumulated_text, 'actions': actions})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
