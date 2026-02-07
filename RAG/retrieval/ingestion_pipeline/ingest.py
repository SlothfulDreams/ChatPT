"""End-to-end ingestion pipeline.

Parse → Chunk → Embed → Upsert to Qdrant.
"""

from __future__ import annotations

import uuid
from pathlib import Path

from qdrant_client.http.models import PointStruct

from ..client import COLLECTION_NAME, ensure_collection, get_client
from .chunking import agentic_chunk
from .embedding import embed_documents
from .parsing import extract_document, extract_pdf


def ingest_pdf(
    path: str | Path,
    parse_method: str = "docling",
    collection_name: str = COLLECTION_NAME,
) -> int:
    """Ingest a PDF: parse, chunk, embed, and upsert to Qdrant.

    Args:
        path: Path to the PDF file.
        parse_method: Parsing method (only "docling" supported).
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
    """Core ingestion: chunk, embed, and upsert text to Qdrant.

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

    texts = [c["text"] for c in chunks]
    vectors = embed_documents(texts)

    points = []
    for chunk, vector in zip(chunks, vectors):
        point_id = str(uuid.uuid4())
        payload = {
            "text": chunk["text"],
            "source": source,
            "muscles": chunk.get("muscles", []),
            "regions": chunk.get("regions", []),
            "conditions": chunk.get("conditions", []),
            "summary": chunk.get("summary", ""),
        }
        points.append(PointStruct(id=point_id, vector=vector, payload=payload))

    client = get_client()
    # Upsert in batches of 100
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=collection_name, points=batch)

    return len(points)
