"""Agentic chunking using Groq + Instructor + semantic-text-splitter.

Splits documents into semantically coherent chunks and extracts
structured metadata (muscles, regions, conditions) for each chunk
using an LLM.
"""

from __future__ import annotations

import os
from typing import List, Optional

import instructor
from groq import Groq
from pydantic import BaseModel, Field
from semantic_text_splitter import TextSplitter


class ChunkMetadata(BaseModel):
    """Structured metadata extracted from a text chunk."""

    muscles: List[str] = Field(
        default_factory=list,
        description="Muscles or muscle groups mentioned in the text",
    )
    regions: List[str] = Field(
        default_factory=list,
        description="Body regions mentioned (e.g., shoulder, knee, lumbar spine)",
    )
    conditions: List[str] = Field(
        default_factory=list,
        description="Clinical conditions or diagnoses mentioned",
    )
    summary: str = Field(
        default="",
        description="One-sentence summary of the chunk content",
    )


_groq_client: Optional[instructor.Instructor] = None


def _get_groq_client() -> instructor.Instructor:
    """Get or create the Groq instructor client."""
    global _groq_client
    if _groq_client is None:
        groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
        _groq_client = instructor.from_groq(groq, mode=instructor.Mode.JSON)
    return _groq_client


def _extract_metadata(text: str) -> ChunkMetadata:
    """Extract structured metadata from a text chunk using Groq LLM.

    Args:
        text: The chunk text to analyze.

    Returns:
        ChunkMetadata with muscles, regions, conditions, and summary.
    """
    client = _get_groq_client()
    return client.chat.completions.create(
        model="llama-3.1-8b-instant",
        response_model=ChunkMetadata,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a physical therapy clinical expert. "
                    "Extract structured metadata from the following text. "
                    "Identify all muscles, body regions, and clinical conditions mentioned. "
                    "Provide a one-sentence summary."
                ),
            },
            {"role": "user", "content": text},
        ],
        temperature=0.0,
    )


def agentic_chunk(
    text: str,
    max_characters: int = 2000,
    overlap: int = 200,
) -> list[dict]:
    """Split text into semantically coherent chunks with extracted metadata.

    Uses semantic-text-splitter for initial splitting, then enriches
    each chunk with structured metadata via Groq LLM.

    Args:
        text: Full document text to chunk.
        max_characters: Maximum characters per chunk.
        overlap: Number of overlapping characters between chunks.

    Returns:
        List of dicts with keys: text, muscles, regions, conditions, summary.
    """
    splitter = TextSplitter(capacity=max_characters, overlap=overlap)
    raw_chunks = splitter.chunks(text)

    enriched_chunks = []
    for chunk_text in raw_chunks:
        if not chunk_text.strip():
            continue

        try:
            metadata = _extract_metadata(chunk_text)
            enriched_chunks.append({
                "text": chunk_text,
                "muscles": metadata.muscles,
                "regions": metadata.regions,
                "conditions": metadata.conditions,
                "summary": metadata.summary,
            })
        except Exception:
            # Fallback: include chunk without metadata
            enriched_chunks.append({
                "text": chunk_text,
                "muscles": [],
                "regions": [],
                "conditions": [],
                "summary": "",
            })

    return enriched_chunks
