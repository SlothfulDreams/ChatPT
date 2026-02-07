#!/usr/bin/env python3
"""Interactive RAG test pipeline.

Test retrieval quality and LLM output against local chunks or live Qdrant.

Usage:
    # Local mode (search against chunks.json files, no Qdrant needed):
    python docs/test_rag.py

    # Live mode (search against Qdrant collection):
    python docs/test_rag.py --live

    # Single query (non-interactive):
    python docs/test_rag.py -q "how to rehab a torn ACL"

    # Adjust retrieval params:
    python docs/test_rag.py --top-k 10 --rerank-k 5
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path
from typing import Optional

os.environ["TOKENIZERS_PARALLELISM"] = "false"

_project_root = Path(__file__).resolve().parents[1]
if str(_project_root) not in sys.path:
    sys.path.insert(0, str(_project_root))

from dotenv import load_dotenv

load_dotenv(_project_root / "backend" / ".env")

import numpy as np

# ---------------------------------------------------------------------------
# Local chunk index (no Qdrant needed)
# ---------------------------------------------------------------------------

_PROCESSED_DIR = _project_root / "docs" / "processed"
_CACHE_DIR = _project_root / "docs" / ".vector_cache"


def _load_all_chunks() -> list[dict]:
    """Load all chunks from processed directories."""
    chunks = []
    for chunks_file in _PROCESSED_DIR.rglob("chunks.json"):
        source = chunks_file.parent.name
        file_chunks = json.loads(chunks_file.read_text(encoding="utf-8"))
        for c in file_chunks:
            c["source"] = c.get("source", source)
        chunks.extend(file_chunks)
    return chunks


def _embed_and_cache(chunks: list[dict]) -> np.ndarray:
    """Embed all chunks and cache vectors to disk. Returns (n, dim) array."""
    from backend.dedalus_tools.retrieval.ingestion_pipeline.embedding import (
        embed_documents,
    )
    from backend.dedalus_tools.retrieval.ingestion_pipeline.ingest import (
        _template_wrap,
    )

    _CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = _CACHE_DIR / "chunk_vectors.npy"
    meta_file = _CACHE_DIR / "chunk_count.txt"

    # Check if cache is valid
    if cache_file.exists() and meta_file.exists():
        cached_count = int(meta_file.read_text().strip())
        if cached_count == len(chunks):
            print(f"  Loading cached vectors ({cached_count} chunks)")
            return np.load(str(cache_file))

    print(f"  Embedding {len(chunks)} chunks (first run, will cache)...")
    t0 = time.time()

    # Template-wrap before embedding (matches ingestion pipeline)
    wrapped = [_template_wrap(c["text"], c.get("content_type", "")) for c in chunks]

    # Batch embed
    batch_size = 64
    all_vectors = []
    for i in range(0, len(wrapped), batch_size):
        batch = wrapped[i : i + batch_size]
        vecs = embed_documents(batch)
        all_vectors.extend(vecs)
        done = min(i + batch_size, len(wrapped))
        print(f"    {done}/{len(wrapped)} embedded", end="\r")

    vectors = np.array(all_vectors, dtype=np.float32)
    np.save(str(cache_file), vectors)
    meta_file.write_text(str(len(chunks)))

    elapsed = time.time() - t0
    print(f"  Embedded {len(chunks)} chunks in {elapsed:.1f}s (cached to {cache_file.name})")
    return vectors


def _cosine_search(
    query_vec: np.ndarray,
    chunk_vectors: np.ndarray,
    chunks: list[dict],
    top_k: int = 10,
    filters: Optional[dict] = None,
) -> list[dict]:
    """Cosine similarity search over local vectors."""
    # Normalize
    q_norm = query_vec / (np.linalg.norm(query_vec) + 1e-9)
    c_norms = chunk_vectors / (
        np.linalg.norm(chunk_vectors, axis=1, keepdims=True) + 1e-9
    )
    scores = c_norms @ q_norm

    # Apply filters
    if filters:
        mask = np.ones(len(chunks), dtype=bool)
        for field, values in filters.items():
            if isinstance(values, str):
                values = [values]
            for i, c in enumerate(chunks):
                chunk_vals = c.get(field, [])
                if isinstance(chunk_vals, str):
                    chunk_vals = [chunk_vals]
                if not any(v in chunk_vals for v in values):
                    mask[i] = False
        scores = np.where(mask, scores, -1.0)

    top_indices = np.argsort(scores)[::-1][:top_k]
    results = []
    for idx in top_indices:
        if scores[idx] < 0:
            continue
        c = chunks[idx]
        results.append(
            {
                "id": str(idx),
                "score": float(scores[idx]),
                "text": c["text"],
                "source": c.get("source", ""),
                "muscle_groups": c.get("muscle_groups", []),
                "conditions": c.get("conditions", []),
                "exercises": c.get("exercises", []),
                "content_type": c.get("content_type", ""),
                "summary": c.get("summary", ""),
            }
        )
    return results


# ---------------------------------------------------------------------------
# LLM generation
# ---------------------------------------------------------------------------

_RAG_SYSTEM_PROMPT = """\
You are a physical therapy clinical decision support assistant.

You answer questions using ONLY the provided context chunks from the knowledge base.
If the context doesn't contain enough information, say so clearly.

Guidelines:
- Be specific about muscle groups, conditions, and exercises
- Reference which source documents support your answer
- Distinguish between evidence-based info and general guidance
- Keep answers concise and actionable
- Do NOT diagnose or prescribe"""


def _generate_answer(query: str, context_chunks: list[dict]) -> str:
    """Generate an LLM answer given retrieved context."""
    from groq import Groq
    import os

    context_parts = []
    for i, c in enumerate(context_chunks, 1):
        meta = []
        if c.get("content_type"):
            meta.append(f"type={c['content_type']}")
        if c.get("muscle_groups"):
            meta.append(f"muscles={','.join(c['muscle_groups'])}")
        if c.get("conditions"):
            meta.append(f"conditions={','.join(c['conditions'][:3])}")
        if c.get("source"):
            meta.append(f"source={c['source']}")
        meta_str = " | ".join(meta)

        score_str = ""
        if "rerank_score" in c:
            score_str = f" [rerank={c['rerank_score']:.3f}]"
        elif "score" in c:
            score_str = f" [score={c['score']:.3f}]"

        context_parts.append(
            f"[Chunk {i}] ({meta_str}){score_str}\n{c['text']}"
        )

    context_block = "\n\n---\n\n".join(context_parts)

    client = Groq(api_key=os.getenv("GROQ_API_KEY"))
    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _RAG_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"CONTEXT:\n{context_block}\n\nQUESTION: {query}",
            },
        ],
        temperature=0.2,
        max_tokens=1500,
    )
    return response.choices[0].message.content


# ---------------------------------------------------------------------------
# Display
# ---------------------------------------------------------------------------


def _print_divider(char: str = "-", width: int = 70):
    print(char * width)


def _print_results(results: list[dict], label: str = "RETRIEVAL"):
    print(f"\n  {label} ({len(results)} results)")
    _print_divider()
    for i, r in enumerate(results, 1):
        score_parts = []
        if "rerank_score" in r:
            score_parts.append(f"rerank={r['rerank_score']:.3f}")
        if "score" in r:
            score_parts.append(f"vector={r['score']:.3f}")
        score_str = " | ".join(score_parts)

        meta_parts = []
        if r.get("content_type"):
            meta_parts.append(r["content_type"])
        if r.get("muscle_groups"):
            meta_parts.append(", ".join(r["muscle_groups"]))
        if r.get("conditions"):
            meta_parts.append(f"cond: {', '.join(r['conditions'][:3])}")
        meta_str = " | ".join(meta_parts)

        print(f"  [{i}] ({score_str}) {r.get('source', '?')}")
        if meta_str:
            print(f"      {meta_str}")
        print(f"      {r.get('summary', r['text'][:120])}")
        print()


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------


class RAGTestPipeline:
    def __init__(self, live: bool = False, top_k: int = 10, rerank_k: int = 5):
        self.live = live
        self.top_k = top_k
        self.rerank_k = rerank_k

        if live:
            print("Loading live Qdrant retriever...")
            from backend.dedalus_tools.retrieval.retriever import PTRetriever

            self.retriever = PTRetriever(top_k=top_k)
            self.chunks = None
            self.chunk_vectors = None
        else:
            print("Loading local chunks...")
            self.chunks = _load_all_chunks()
            print(f"  {len(self.chunks)} chunks loaded")
            self.chunk_vectors = _embed_and_cache(self.chunks)
            self.retriever = None

        # Pre-load reranker
        print("Loading reranker...")
        from backend.dedalus_tools.retrieval.reranker import rerank

        self._rerank = rerank

        # Pre-load embedding
        from backend.dedalus_tools.retrieval.ingestion_pipeline.embedding import (
            embed_query,
        )

        self._embed_query = embed_query

        print("Ready.\n")

    def query(
        self,
        question: str,
        search_type: str = "general",
        filter_value: str | None = None,
        show_chunks: bool = True,
        generate: bool = True,
    ) -> dict:
        """Run a full RAG query: retrieve -> rerank -> generate.

        Returns dict with keys: question, results, reranked, answer, timings.
        """
        timings = {}

        # 1. Retrieve
        t0 = time.time()
        if self.live:
            if search_type == "muscle_group" and filter_value:
                results = self.retriever.search_by_muscle_group(
                    filter_value, top_k=self.top_k
                )
            elif search_type == "condition" and filter_value:
                results = self.retriever.search_by_condition(
                    filter_value, top_k=self.top_k
                )
            elif search_type == "content_type" and filter_value:
                results = self.retriever.search_by_content_type(
                    filter_value, question, top_k=self.top_k
                )
            elif search_type == "exercise" and filter_value:
                results = self.retriever.search_by_exercise(
                    filter_value, top_k=self.top_k
                )
            else:
                results = self.retriever.search(question, top_k=self.top_k)
        else:
            query_vec = np.array(self._embed_query(question), dtype=np.float32)
            filters = None
            if filter_value:
                if search_type == "muscle_group":
                    filters = {"muscle_groups": filter_value}
                elif search_type == "condition":
                    filters = {"conditions": filter_value}
                elif search_type == "content_type":
                    filters = {"content_type": filter_value}
                elif search_type == "exercise":
                    filters = {"exercises": filter_value}
            results = _cosine_search(
                query_vec, self.chunk_vectors, self.chunks, self.top_k, filters
            )
        timings["retrieve_ms"] = int((time.time() - t0) * 1000)

        if show_chunks:
            _print_results(results, "RETRIEVAL")

        # 2. Rerank
        t0 = time.time()
        reranked = self._rerank(question, results, top_k=self.rerank_k)
        timings["rerank_ms"] = int((time.time() - t0) * 1000)

        if show_chunks:
            _print_results(reranked, "RERANKED")

        # 3. Generate
        answer = ""
        if generate:
            t0 = time.time()
            answer = _generate_answer(question, reranked)
            timings["generate_ms"] = int((time.time() - t0) * 1000)

            _print_divider("=")
            print(f"  ANSWER")
            _print_divider("=")
            print(f"\n{answer}\n")

        # Timing summary
        total = sum(timings.values())
        parts = " | ".join(f"{k}={v}ms" for k, v in timings.items())
        print(f"  [{parts} | total={total}ms]")

        return {
            "question": question,
            "results": results,
            "reranked": reranked,
            "answer": answer,
            "timings": timings,
        }


def _parse_command(raw: str) -> tuple[str, str, str | None]:
    """Parse input for optional /commands.

    Supported:
        /muscle <group> <question>
        /condition <condition> <question>
        /type <content_type> <question>
        /exercise <exercise> <question>
        /nogen <question>         (skip LLM generation, retrieval only)
        <question>                (general search)

    Returns (search_type, question, filter_value).
    """
    raw = raw.strip()
    if raw.startswith("/muscle "):
        parts = raw[8:].split(" ", 1)
        return "muscle_group", parts[1] if len(parts) > 1 else parts[0], parts[0]
    elif raw.startswith("/condition "):
        parts = raw[11:].split(" ", 1)
        return "condition", parts[1] if len(parts) > 1 else parts[0], parts[0]
    elif raw.startswith("/type "):
        parts = raw[6:].split(" ", 1)
        return "content_type", parts[1] if len(parts) > 1 else parts[0], parts[0]
    elif raw.startswith("/exercise "):
        parts = raw[10:].split(" ", 1)
        return "exercise", parts[1] if len(parts) > 1 else parts[0], parts[0]
    elif raw.startswith("/nogen "):
        return "general", raw[7:], None
    return "general", raw, None


def _print_help():
    print("""
  Commands:
    <question>                          General search + answer
    /muscle <group> <question>          Filter by muscle group
    /condition <condition> <question>   Filter by condition
    /type <content_type> <question>     Filter by content type
    /exercise <exercise> <question>     Filter by exercise
    /nogen <question>                   Retrieval only, no LLM
    /help                               Show this help
    /quit                               Exit
""")


def main():
    parser = argparse.ArgumentParser(description="Interactive RAG test pipeline")
    parser.add_argument("--live", action="store_true", help="Use live Qdrant")
    parser.add_argument("-q", "--query", help="Single query (non-interactive)")
    parser.add_argument("--top-k", type=int, default=10, help="Retrieval top-k")
    parser.add_argument("--rerank-k", type=int, default=5, help="Rerank top-k")
    args = parser.parse_args()

    pipeline = RAGTestPipeline(
        live=args.live, top_k=args.top_k, rerank_k=args.rerank_k
    )

    if args.query:
        pipeline.query(args.query)
        return

    # Interactive REPL
    print("RAG Test Pipeline (type /help for commands, /quit to exit)")
    _print_divider("=")

    history: list[dict] = []

    while True:
        try:
            raw = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not raw:
            continue
        if raw == "/quit":
            break
        if raw == "/help":
            _print_help()
            continue

        search_type, question, filter_value = _parse_command(raw)
        generate = not raw.startswith("/nogen")

        result = pipeline.query(
            question,
            search_type=search_type,
            filter_value=filter_value,
            generate=generate,
        )
        history.append(result)

    # Save session
    if history:
        session_dir = _project_root / "docs" / "test_sessions"
        session_dir.mkdir(parents=True, exist_ok=True)
        session_file = session_dir / f"session_{int(time.time())}.json"

        serializable = []
        for h in history:
            serializable.append(
                {
                    "question": h["question"],
                    "answer": h["answer"],
                    "timings": h["timings"],
                    "num_results": len(h["results"]),
                    "reranked_summaries": [
                        {
                            "summary": r.get("summary", ""),
                            "source": r.get("source", ""),
                            "score": r.get("score", 0),
                            "rerank_score": r.get("rerank_score", 0),
                            "content_type": r.get("content_type", ""),
                        }
                        for r in h["reranked"]
                    ],
                }
            )
        session_file.write_text(
            json.dumps(serializable, indent=2, ensure_ascii=False), encoding="utf-8"
        )
        print(f"Session saved to {session_file}")


if __name__ == "__main__":
    main()
