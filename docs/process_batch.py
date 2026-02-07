#!/usr/bin/env python3
"""Batch-process a directory of documents through parse + chunk pipeline.

Usage:
    python docs/process_batch.py docs/raw/andrews_sports_medicine/
    python docs/process_batch.py docs/raw/andrews_sports_medicine/ --embed
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

_project_root = Path(__file__).resolve().parents[0].parent
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from dotenv import load_dotenv

load_dotenv(_project_root / "backend" / ".env")

SUPPORTED_EXTENSIONS = {".pdf", ".docx", ".pptx", ".html", ".md", ".txt"}


def process_one(file_path: Path, out_dir: Path, do_embed: bool) -> dict:
    """Process a single file: parse -> chunk -> (optionally embed)."""
    from backend.dedalus_tools.retrieval.ingestion_pipeline.parsing import extract_document
    from backend.dedalus_tools.retrieval.ingestion_pipeline.chunking import agentic_chunk

    # Parse
    t0 = time.time()
    try:
        markdown = extract_document(file_path)
    except Exception as e:
        return {"file": file_path.name, "error": f"parse failed: {e}", "chunks": 0}
    parse_time = time.time() - t0

    md_path = out_dir / "parsed.md"
    md_path.write_text(markdown, encoding="utf-8")

    if len(markdown.strip()) < 50:
        return {"file": file_path.name, "error": "too short after parsing", "chunks": 0}

    # Chunk
    t1 = time.time()
    try:
        chunks = agentic_chunk(markdown)
    except Exception as e:
        return {"file": file_path.name, "error": f"chunk failed: {e}", "chunks": 0}
    chunk_time = time.time() - t1

    chunks_path = out_dir / "chunks.json"
    chunks_path.write_text(json.dumps(chunks, indent=2, ensure_ascii=False), encoding="utf-8")

    muscle_groups_seen = set()
    content_types_seen = set()
    conditions_seen = set()
    for c in chunks:
        muscle_groups_seen.update(c.get("muscle_groups", []))
        content_types_seen.add(c.get("content_type", ""))
        conditions_seen.update(c.get("conditions", []))

    manifest = {
        "file": file_path.name,
        "chars": len(markdown),
        "chunks": len(chunks),
        "muscle_groups": sorted(muscle_groups_seen),
        "content_types": sorted(content_types_seen),
        "conditions": sorted(conditions_seen),
        "parse_time_s": round(parse_time, 1),
        "chunk_time_s": round(chunk_time, 1),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    # Embed (optional)
    if do_embed and chunks:
        import uuid
        from qdrant_client.http.models import PointStruct
        from backend.dedalus_tools.retrieval.client import COLLECTION_NAME, ensure_collection, get_client
        from backend.dedalus_tools.retrieval.ingestion_pipeline.embedding import embed_documents
        from backend.dedalus_tools.retrieval.ingestion_pipeline.ingest import _template_wrap

        ensure_collection()
        wrapped = [_template_wrap(c["text"], c.get("content_type", "")) for c in chunks]
        vectors = embed_documents(wrapped)
        points = []
        for chunk, vector in zip(chunks, vectors):
            points.append(PointStruct(
                id=str(uuid.uuid4()),
                vector=vector,
                payload={
                    "text": chunk["text"],
                    "source": file_path.name,
                    "muscle_groups": chunk.get("muscle_groups", []),
                    "conditions": chunk.get("conditions", []),
                    "exercises": chunk.get("exercises", []),
                    "content_type": chunk.get("content_type", ""),
                    "summary": chunk.get("summary", ""),
                },
            ))
        client = get_client()
        for i in range(0, len(points), 100):
            client.upsert(collection_name=COLLECTION_NAME, points=points[i:i+100])
        manifest["embedded"] = True

    return manifest


def main():
    parser = argparse.ArgumentParser(description="Batch process documents through RAG pipeline.")
    parser.add_argument("directory", type=Path, help="Directory of documents to process")
    parser.add_argument("--embed", action="store_true", help="Also embed into Qdrant")
    args = parser.parse_args()

    src_dir = args.directory.resolve()
    if not src_dir.is_dir():
        print(f"Not a directory: {src_dir}")
        sys.exit(1)

    files = sorted(f for f in src_dir.iterdir() if f.suffix.lower() in SUPPORTED_EXTENSIONS)
    print(f"Found {len(files)} documents in {src_dir.name}")

    results = []
    total_chunks = 0
    errors = 0
    t_start = time.time()

    for i, file_path in enumerate(files, 1):
        stem = file_path.stem
        out_dir = _project_root / "docs" / "processed" / "andrews_sports_medicine" / stem
        out_dir.mkdir(parents=True, exist_ok=True)

        print(f"[{i}/{len(files)}] {file_path.name} ...", end=" ", flush=True)
        result = process_one(file_path, out_dir, args.embed)
        results.append(result)

        if "error" in result:
            print(f"ERROR: {result['error']}")
            errors += 1
        else:
            total_chunks += result["chunks"]
            print(f"{result['chunks']} chunks ({result['chunk_time_s']}s)")

    elapsed = time.time() - t_start

    # Write batch summary
    summary_dir = _project_root / "docs" / "processed" / "andrews_sports_medicine"
    summary = {
        "total_files": len(files),
        "total_chunks": total_chunks,
        "errors": errors,
        "total_time_s": round(elapsed, 1),
        "all_muscle_groups": sorted(set(mg for r in results for mg in r.get("muscle_groups", []))),
        "all_content_types": sorted(set(ct for r in results for ct in r.get("content_types", []))),
        "all_conditions": sorted(set(c for r in results for c in r.get("conditions", []))),
        "per_file": results,
    }
    (summary_dir / "batch_summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")

    print(f"\n{'='*60}")
    print(f"Done: {len(files)} files -> {total_chunks} chunks in {elapsed:.0f}s ({errors} errors)")
    print(f"Muscle groups: {len(summary['all_muscle_groups'])}")
    print(f"Content types: {len(summary['all_content_types'])}")
    print(f"Conditions: {len(summary['all_conditions'])}")
    print(f"Summary: docs/processed/andrews_sports_medicine/batch_summary.json")


if __name__ == "__main__":
    main()
