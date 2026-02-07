from __future__ import annotations

import logging
import os
import tempfile

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, HTTPException, UploadFile
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
    content: str | None = None
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

MAX_AUDIO_SIZE = 25 * 1024 * 1024  # 25 MB
ALLOWED_AUDIO_EXTENSIONS = {".webm", ".mp3", ".mp4", ".wav", ".m4a", ".mpeg", ".mpga"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    """Transcribe an audio file to text using Whisper."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = os.path.splitext(file.filename)[1].lower()
    if suffix not in ALLOWED_AUDIO_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported audio format: {suffix}. Allowed: {ALLOWED_AUDIO_EXTENSIONS}",
        )

    content = await file.read()
    if len(content) > MAX_AUDIO_SIZE:
        raise HTTPException(status_code=400, detail="File exceeds 25 MB limit")

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name

        from dedalus_labs import AsyncDedalus

        client = AsyncDedalus()
        with open(tmp_path, "rb") as audio_file:
            transcription = await client.audio.transcriptions.create(
                model="openai/whisper-1",
                file=audio_file,
            )

        return {"text": transcription.text}
    except HTTPException:
        raise
    except Exception as e:
        logging.exception("Transcription failed")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if tmp_path:
            os.unlink(tmp_path)


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
        entry: dict = {"role": msg.role, "content": msg.content or ""}
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
        focus_groups=request.focusGroups,
    )

    exercises = plan.get("exercises", [])
    exercises = await generate_all_exercise_images(exercises)
    plan["exercises"] = exercises

    return plan


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
