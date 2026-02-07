"""Agentic chunking using Groq + Instructor + semantic-text-splitter.

Splits documents into semantically coherent chunks, analyzes each chunk
for clinical metadata via LLM, and supports merge/skip decisions to
produce high-quality retrieval units.
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Literal, Optional, get_args

import instructor
from groq import Groq
from pydantic import BaseModel, Field
from semantic_text_splitter import TextSplitter

# Canonical muscle groups loaded from shared JSON (single source of truth).
_SHARED_JSON = Path(__file__).resolve().parents[4] / "shared" / "muscle_groups.json"
_VALID_MUSCLE_GROUPS: list[str] = list(json.loads(_SHARED_JSON.read_text()).keys())

MuscleGroup = Literal[
    "neck",
    "upper_back",
    "lower_back",
    "chest",
    "shoulders",
    "rotator_cuff",
    "biceps",
    "triceps",
    "forearms",
    "core",
    "hip_flexors",
    "glutes",
    "quads",
    "adductors",
    "hamstrings",
    "calves",
    "shins",
]

# Runtime check: Literal stays in sync with JSON.
assert set(get_args(MuscleGroup)) == set(_VALID_MUSCLE_GROUPS), (
    f"MuscleGroup Literal out of sync with shared/muscle_groups.json. "
    f"Missing from Literal: {set(_VALID_MUSCLE_GROUPS) - set(get_args(MuscleGroup))}, "
    f"Extra in Literal: {set(get_args(MuscleGroup)) - set(_VALID_MUSCLE_GROUPS)}"
)

ContentType = Literal[
    "exercise_technique",
    "rehab_protocol",
    "pathology",
    "assessment",
    "anatomy",
    "training_principles",
    "reference_data",
]


class ChunkAnalysis(BaseModel):
    """LLM-produced analysis of a single text chunk."""

    decision: Literal["embed", "merge_next", "skip"]
    muscle_groups: list[MuscleGroup] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    exercises: list[str] = Field(default_factory=list)
    content_type: ContentType = "training_principles"
    summary: str = Field(default="")


_ANALYZE_SYSTEM_PROMPT = f"""\
You are a physical therapy clinical expert analyzing text chunks for a retrieval knowledge base.

DECISION:
- "embed" if the text contains useful, self-contained clinical or educational information
- "merge_next" if the text is an incomplete thought that needs the following chunk for context (e.g., a heading alone, a sentence fragment, an incomplete list)
- "skip" if the text is filler: table of contents entries, standalone figure/image references, page numbers, headers without content, repeated metadata

MUSCLE GROUPS - tag with ONLY these exact values (use multiple if applicable):
{", ".join(_VALID_MUSCLE_GROUPS)}

CONTENT TYPE - classify as exactly one of:
- exercise_technique: how to perform an exercise, form cues, technique descriptions
- rehab_protocol: treatment plans, rehabilitation progressions, recovery timelines
- pathology: condition descriptions, injury mechanisms, diagnostic criteria
- assessment: clinical tests, ROM measurements, strength testing methods
- anatomy: structural descriptions, muscle origins/insertions, biomechanics
- training_principles: programming, periodization, load management, general training guidelines
- reference_data: norms tables, ranges, statistical data

CONDITIONS: Extract any clinical conditions, injuries, or diagnoses mentioned (free-form, lowercase).
EXERCISES: Extract any specific exercises mentioned (free-form, lowercase).
SUMMARY: One concise sentence summarizing the chunk content."""


_groq_client: Optional[instructor.Instructor] = None


def _get_groq_client() -> instructor.Instructor:
    """Get or create the Groq instructor client."""
    global _groq_client
    if _groq_client is None:
        groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
        _groq_client = instructor.from_groq(groq, mode=instructor.Mode.JSON)
    return _groq_client


def _analyze_chunk(text: str) -> ChunkAnalysis:
    """Analyze a text chunk using Groq LLM to decide embed/merge/skip
    and extract structured clinical metadata.

    Args:
        text: The chunk text to analyze.

    Returns:
        ChunkAnalysis with decision and metadata.
    """
    client = _get_groq_client()
    return client.chat.completions.create(
        model="llama-3.1-8b-instant",
        response_model=ChunkAnalysis,
        messages=[
            {"role": "system", "content": _ANALYZE_SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        temperature=0.0,
    )


def agentic_chunk(
    text: str,
    max_characters: int = 1200,
    overlap: int = 150,
) -> list[dict]:
    """Split text into semantically coherent chunks with LLM-driven
    embed/merge/skip decisions and rich clinical metadata.

    Uses semantic-text-splitter for initial splitting, then runs each
    segment through _analyze_chunk(). Segments marked "merge_next" are
    concatenated with the following segment and re-analyzed. Segments
    marked "skip" are discarded.

    Args:
        text: Full document text to chunk.
        max_characters: Maximum characters per chunk.
        overlap: Number of overlapping characters between chunks.

    Returns:
        List of dicts with keys: text, muscle_groups, conditions,
        exercises, content_type, summary.
        Only chunks with decision="embed" are included.
    """
    splitter = TextSplitter(capacity=max_characters, overlap=overlap)
    raw_segments = splitter.chunks(text)

    enriched_chunks: list[dict] = []
    i = 0
    while i < len(raw_segments):
        segment = raw_segments[i]
        if not segment.strip():
            i += 1
            continue

        try:
            analysis = _analyze_chunk(segment)

            if analysis.decision == "merge_next":
                if i + 1 < len(raw_segments):
                    merged = segment + "\n\n" + raw_segments[i + 1]
                    i += 1  # consume the next segment
                    analysis = _analyze_chunk(merged)
                    segment = merged
                # If last segment, treat merge_next as embed (fall through)

            if analysis.decision == "skip":
                i += 1
                continue

            # decision is "embed" (or was merge_next on last segment)
            enriched_chunks.append(
                {
                    "text": segment,
                    "muscle_groups": analysis.muscle_groups,
                    "conditions": analysis.conditions,
                    "exercises": analysis.exercises,
                    "content_type": analysis.content_type,
                    "summary": analysis.summary,
                }
            )
        except Exception:
            # Fallback: include chunk with empty metadata
            enriched_chunks.append(
                {
                    "text": segment,
                    "muscle_groups": [],
                    "conditions": [],
                    "exercises": [],
                    "content_type": "training_principles",
                    "summary": "",
                }
            )

        i += 1

    return enriched_chunks
