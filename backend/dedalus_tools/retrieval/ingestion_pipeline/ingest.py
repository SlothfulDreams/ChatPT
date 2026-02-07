"""End-to-end ingestion pipeline.

Parse -> Chunk -> Template-wrap per content_type -> Embed -> Upsert to Qdrant.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from qdrant_client.http.models import PointStruct

from ..client import COLLECTION_NAME, ensure_collection, get_client
from .chunking import agentic_chunk
from .embedding import embed_documents
from .parsing import extract_document, extract_pdf

# ---------------------------------------------------------------------------
# Content-type-specific embedding templates
# ---------------------------------------------------------------------------
# Each template prepends semantic context to the chunk text before embedding,
# so the resulting vector captures *what kind* of content it is -- not just
# what it says.  The raw text (without template) is stored in the payload.

_EMBEDDING_TEMPLATES: dict[str, str] = {
    "exercise_technique": (
        "Exercise technique and execution. Proper form, posture, and movement cues. "
        "{text}"
    ),
    "rehab_protocol": (
        "Rehabilitation protocol and treatment progression. Recovery phases, criteria, "
        "and therapeutic interventions. {text}"
    ),
    "pathology": (
        "Clinical condition and diagnosis. Injury mechanism, signs and symptoms, "
        "assessment findings. {text}"
    ),
    "assessment": (
        "Clinical assessment and diagnostic testing. Physical examination procedure, "
        "patient instructions, and interpretation. {text}"
    ),
    "anatomy": (
        "Anatomical structure and function. Muscle origins, insertions, innervation, "
        "and biomechanical role. {text}"
    ),
    "training_principles": (
        "Training and programming principles. Load management, periodization, "
        "and evidence-based guidelines. {text}"
    ),
    "reference_data": (
        "Reference data and normative values. Clinical benchmarks, measurement "
        "standards, and statistical ranges. {text}"
    ),
}
_DEFAULT_TEMPLATE = "{text}"


def _template_wrap(text: str, content_type: str) -> str:
    """Wrap chunk text in its content_type-specific embedding template."""
    template = _EMBEDDING_TEMPLATES.get(content_type, _DEFAULT_TEMPLATE)
    return template.format(text=text)


# ---------------------------------------------------------------------------
# Public ingestion API
# ---------------------------------------------------------------------------


def ingest_pdf(
    path: str | Path,
    parse_method: str = "pymupdf",
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest a PDF: parse, chunk, embed, and upsert to Qdrant.

    Args:
        path: Path to the PDF file.
        parse_method: Parsing method (ignored, always uses pymupdf).
        collection_name: Qdrant collection name.

    Returns:
        Number of chunks ingested.
    """
    path = Path(path)
    text = extract_pdf(path, method=parse_method)
    return _ingest_text(text, source=path.name, collection_name=collection_name)


def ingest_document(
    path: str | Path,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest a non-PDF document: parse, chunk, embed, and upsert to Qdrant.

    Args:
        path: Path to the document file.
        collection_name: Qdrant collection name.

    Returns:
        Number of chunks ingested.
    """
    path = Path(path)
    text = extract_document(path)
    return _ingest_text(text, source=path.name, collection_name=collection_name)


def ingest_directory(
    directory: str | Path,
    extensions: list[str] | None = None,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest all supported files in a directory.

    Args:
        directory: Path to the directory.
        extensions: File extensions to include (default: common doc types).
        collection_name: Qdrant collection name.

    Returns:
        Total number of chunks ingested.
    """
    directory = Path(directory)
    if not directory.is_dir():
        raise NotADirectoryError(f"Not a directory: {directory}")

    if extensions is None:
        extensions = [".pdf", ".docx", ".pptx", ".html", ".md", ".txt"]

    total = 0
    for ext in extensions:
        for file_path in directory.glob(f"**/*{ext}"):
            try:
                if ext == ".pdf":
                    count = ingest_pdf(file_path, collection_name=collection_name)
                else:
                    count = ingest_document(file_path, collection_name=collection_name)
                total += count
                print(f"Ingested {file_path.name}: {count} chunks")
            except Exception as e:
                print(f"Error ingesting {file_path.name}: {e}")

    return total


def _ingest_text(
    text: str,
    source: str,
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Core ingestion: chunk text, template-wrap per content_type, embed,
    and upsert to Qdrant.  One vector per chunk.

    Args:
        text: Document text to ingest.
        source: Source identifier for the document.
        collection_name: Qdrant collection name.

    Returns:
        Number of chunks ingested.
    """
    ensure_collection(collection_name)

    chunks = agentic_chunk(text)
    if not chunks:
        return 0

    # Template-wrap each chunk per its content_type, then embed
    wrapped_texts = [
        _template_wrap(c["text"], c.get("content_type", "")) for c in chunks
    ]
    vectors = embed_documents(wrapped_texts)

    points: list[PointStruct] = []
    for chunk, vector in zip(chunks, vectors):
        point_id = str(uuid.uuid4())
        payload = {
            "text": chunk["text"],
            "source": source,
            "muscle_groups": chunk.get("muscle_groups", []),
            "conditions": chunk.get("conditions", []),
            "exercises": chunk.get("exercises", []),
            "content_type": chunk.get("content_type", ""),
            "summary": chunk.get("summary", ""),
        }
        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

    client = get_client()
    for i in range(0, len(points), 100):
        client.upsert(collection_name=collection_name, points=points[i : i + 100])

    return len(chunks)
