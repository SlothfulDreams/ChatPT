from __future__ import annotations

from pydantic import BaseModel


class MuscleState(BaseModel):
    meshId: str
    condition: str
    pain: float
    strength: float
    mobility: float


class GenerateWorkoutRequest(BaseModel):
    # RAG agent output — evidence-based training summaries
    ragSummaries: list[str]

    # User context from the app's existing data
    muscleStates: list[MuscleState]
    availableMeshIds: list[str]
    sex: str | None = None
    goals: str = "general fitness"
    durationMinutes: int = 45
    equipment: list[str] = []
    focusGroups: list[str] = []


class GeneratedExercise(BaseModel):
    name: str
    sets: int | None = None
    reps: int | None = None
    durationSecs: int | None = None
    weight: float | None = None
    weightUnit: str | None = None
    notes: str | None = None
    targetMeshIds: list[str]
    imageUrl: str | None = None


class GeneratedPlan(BaseModel):
    title: str
    notes: str | None = None
    exercises: list[GeneratedExercise]
