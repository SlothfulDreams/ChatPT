export interface MuscleState {
  meshId: string;
  condition: string;
  pain: number;
  strength: number;
  mobility: number;
}

export interface GenerateWorkoutRequest {
  ragSummaries: string[];
  muscleStates: MuscleState[];
  availableMeshIds: string[];
  sex?: string;
  goals?: string;
  durationMinutes?: number;
  equipment?: string[];
  focusGroups?: string[];
}

export interface GeneratedExercise {
  name: string;
  sets?: number;
  reps?: number;
  durationSecs?: number;
  weight?: number;
  weightUnit?: string;
  notes?: string;
  targetMeshIds: string[];
  imageUrl?: string;
}

export interface GeneratedPlan {
  title: string;
  notes?: string;
  exercises: GeneratedExercise[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export async function generateWorkout(
  request: GenerateWorkoutRequest,
): Promise<GeneratedPlan> {
  const response = await fetch(`${API_URL}/generate-workout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "Unknown error");
    throw new Error(`Workout generation failed: ${text}`);
  }

  return response.json();
}
