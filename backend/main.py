from __future__ import annotations

import os

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from agent.context import build_context
from agent.loop import run_agent_stream
from agent.prompts import SYSTEM_PROMPT
from dedalus_tools.api import router as rag_router
from schemas.workout import GenerateWorkoutRequest

app = FastAPI()
app.include_router(rag_router, prefix="/rag")

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
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None


class ChatRequest(BaseModel):
    message: str
    conversationId: str | None = None
    conversationHistory: list[MessageInput]
    muscleStates: list[MuscleContext]
    body: BodyContext | None = None
    availableMeshIds: list[str]
    selectedMeshIds: list[str] = []
    activeGroups: list[str] = []


# ============================================
# Endpoints
# ============================================


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat")
async def chat(request: ChatRequest):
    system = SYSTEM_PROMPT + build_context(
        muscle_states=[m.model_dump() for m in request.muscleStates],
        body=request.body.model_dump() if request.body else None,
        available_mesh_ids=request.availableMeshIds,
        selected_mesh_ids=request.selectedMeshIds,
        active_groups=request.activeGroups,
    )

    messages: list[dict] = [{"role": "system", "content": system}]

    # Rebuild full conversation including tool messages
    for msg in request.conversationHistory:
        entry: dict = {"role": msg.role, "content": msg.content}
        if msg.tool_calls:
            entry["tool_calls"] = msg.tool_calls
        if msg.tool_call_id:
            entry["tool_call_id"] = msg.tool_call_id
        messages.append(entry)

    messages.append({"role": "user", "content": request.message})

    orchestrator_model = os.getenv("ORCHESTRATOR_MODEL", "openai/gpt-5.3")
    tool_model = os.getenv("TOOL_MODEL", "cerebras/llama-3.3-70b")

    return StreamingResponse(
        run_agent_stream(
            messages, orchestrator_model=orchestrator_model, tool_model=tool_model
        ),
        media_type="text/event-stream",
    )


@app.post("/generate-workout")
async def generate_workout(request: GenerateWorkoutRequest):
    from chains.workout_chain import generate_workout_plan
    from services.image_gen import generate_all_exercise_images

    plan = await generate_workout_plan(
        rag_summaries=request.ragSummaries,
        muscle_states=[m.model_dump() for m in request.muscleStates],
        available_mesh_ids=request.availableMeshIds,
        goals=request.goals,
        duration_minutes=request.durationMinutes,
        equipment=request.equipment,
    )

    exercises = plan.get("exercises", [])
    exercises = await generate_all_exercise_images(exercises)
    plan["exercises"] = exercises

    return plan


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
