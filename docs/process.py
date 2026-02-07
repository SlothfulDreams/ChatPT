#!/usr/bin/env python3
"""Document processing CLI -- parse, chunk, and optionally embed into Qdrant.

Usage:
    # Parse + chunk (observe outputs before embedding):
    python docs/process.py docs/raw/strength_and_conditioning.pdf

    # Parse + chunk + embed into Qdrant:
    python docs/process.py docs/raw/strength_and_conditioning.pdf --embed

    # Parse only (just extract markdown):
    python docs/process.py docs/raw/strength_and_conditioning.pdf --parse-only

    # Re-chunk from existing markdown (skip parsing):
    python docs/process.py docs/raw/strength_and_conditioning.pdf --chunk-only

Outputs land in docs/processed/<filename>/:
    parsed.md       -- full markdown extracted from the document
    chunks.json     -- all chunks with metadata
    manifest.json   -- pipeline stats (chunk count, content types, etc.)
"""

from __future__ import annotations

import argparse
import json
import sys
import time
import uuid
from pathlib import Path

# Ensure project root is importable
_project_root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_project_root))

from dotenv import load_dotenv

load_dotenv(_project_root / "backend" / ".env")


def _parse(pdf_path: Path, out_dir: Path) -> str:
    """Stage 1: PDF -> Markdown."""
    from backend.dedalus_tools.retrieval.ingestion_pipeline.parsing import (
        extract_document,
    )

    print(f"[parse] Extracting {pdf_path.name} ...")
    t0 = time.time()
    markdown = extract_document(pdf_path)
    elapsed = time.time() - t0

    md_path = out_dir / "parsed.md"
    md_path.write_text(markdown, encoding="utf-8")
    print(f"[parse] {len(markdown):,} chars -> {md_path}  ({elapsed:.1f}s)")
    return markdown


def _chunk(markdown: str, out_dir: Path) -> list[dict]:
    """Stage 2: Markdown -> Chunks with metadata."""
    from backend.dedalus_tools.retrieval.ingestion_pipeline.chunking import (
        agentic_chunk,
    )

    print("[chunk] Running agentic chunking ...")
    t0 = time.time()
    chunks = agentic_chunk(markdown)
    elapsed = time.time() - t0

    chunks_path = out_dir / "chunks.json"
    chunks_path.write_text(
        json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    muscle_groups_seen = set()
    content_types_seen = set()
    for c in chunks:
        muscle_groups_seen.update(c.get("muscle_groups", []))
        content_types_seen.add(c.get("content_type", ""))

    manifest = {
        "chunks": len(chunks),
        "muscle_groups_found": sorted(muscle_groups_seen),
        "content_types_found": sorted(content_types_seen),
        "chunking_time_s": round(elapsed, 1),
    }
    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"[chunk] {len(chunks)} chunks -> {chunks_path}  ({elapsed:.1f}s)")
    print(f"[chunk] Muscle groups: {', '.join(sorted(muscle_groups_seen)) or 'none'}")
    print(f"[chunk] Content types: {', '.join(sorted(content_types_seen)) or 'none'}")
    return chunks


def _embed(chunks: list[dict], source: str) -> None:
    """Stage 3: Template-wrap chunks per content_type, embed, upsert to Qdrant."""
    from qdrant_client.http.models import PointStruct

    from backend.dedalus_tools.retrieval.client import (
        COLLECTION_NAME,
        ensure_collection,
        get_client,
    )
    from backend.dedalus_tools.retrieval.ingestion_pipeline.embedding import (
        embed_documents,
    )
    from backend.dedalus_tools.retrieval.ingestion_pipeline.ingest import (
        _template_wrap,
    )

    print(f"[embed] Embedding into Qdrant collection '{COLLECTION_NAME}' ...")
    t0 = time.time()
    ensure_collection()

    # Template-wrap each chunk per its content_type, then embed
    wrapped_texts = [
        _template_wrap(c["text"], c.get("content_type", ""))
        for c in chunks
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
    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        client.upsert(collection_name=COLLECTION_NAME, points=batch)

    elapsed = time.time() - t0
    print(f"[embed] {len(points)} vectors from {len(chunks)} chunks upserted  ({elapsed:.1f}s)")


def main():
    parser = argparse.ArgumentParser(
        description="Process documents through the RAG pipeline with observability."
    )
    parser.add_argument("file", type=Path, help="Path to document (PDF, DOCX, etc.)")
    parser.add_argument("--embed", action="store_true", help="Also embed into Qdrant")
    parser.add_argument("--parse-only", action="store_true", help="Only extract markdown")
    parser.add_argument("--chunk-only", action="store_true", help="Re-chunk from existing parsed.md")
    args = parser.parse_args()

    pdf_path = args.file.resolve()
    if not pdf_path.exists():
        print(f"File not found: {pdf_path}")
        sys.exit(1)

    # Output directory: docs/processed/<stem>/
    out_dir = _project_root / "docs" / "processed" / pdf_path.stem
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.chunk_only:
        md_path = out_dir / "parsed.md"
        if not md_path.exists():
            print(f"No parsed.md found at {md_path}. Run without --chunk-only first.")
            sys.exit(1)
        markdown = md_path.read_text(encoding="utf-8")
        print(f"[chunk-only] Using existing {md_path} ({len(markdown):,} chars)")
    else:
        markdown = _parse(pdf_path, out_dir)

    if args.parse_only:
        print("[done] Parse-only mode. Review docs/processed/{}/parsed.md".format(pdf_path.stem))
        return

    chunks = _chunk(markdown, out_dir)

    if args.embed:
        _embed(chunks, source=pdf_path.name)
    else:
        print(f"\n[done] Review outputs in {out_dir}/")
        print("       Run with --embed to push to Qdrant when ready.")


if __name__ == "__main__":
    main()
