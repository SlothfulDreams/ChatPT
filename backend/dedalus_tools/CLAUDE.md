# Dedalus Tools -- RAG Clinical Decision Support

RAG pipeline + Dedalus SDK tool functions for physical therapy knowledge retrieval.

## Architecture

```
backend/dedalus_tools/
├── tools.py               # 6 plain Python tool functions for DedalusRunner
├── runner.py              # DedalusRunner agent entry point
├── api.py                 # FastAPI router (mounted at /rag in backend)
├── convex_client.py       # Singleton Convex client for patient data
├── retrieval/
│   ├── client.py          # Qdrant Cloud client (collection: physio-knowledge-base-v3)
│   ├── retriever.py       # PTRetriever (1:1 point:chunk, no dedup needed)
│   ├── reranker.py        # Cross-encoder reranker
│   └── ingestion_pipeline/
│       ├── parsing.py     # PyMuPDF document extraction (via pymupdf4llm)
│       ├── chunking.py    # Agentic chunking (Groq + Instructor)
│       ├── embedding.py   # Nomic v1.5 embeddings via FastEmbed (768d)
│       └── ingest.py      # Parse -> chunk -> template-wrap -> embed -> upsert
└── tests/                 # (removed -- mock tests deleted)
```

## Tools (for DedalusRunner)

```python
from backend.dedalus_tools.tools import ALL_TOOLS
# search_knowledge_base, search_by_muscle_group, search_by_condition,
# search_by_content_type, search_by_exercise, get_patient_muscle_context
```

## Runner

```python
from backend.dedalus_tools.runner import run_pt_agent
result = await run_pt_agent("What exercises help with rotator cuff impingement?")
```

## API Endpoints (mounted at /rag)

- `POST /rag/search` -- vector search with filters
- `GET /rag/collection/stats` -- Qdrant collection info
- `POST /rag/ingest` -- upload + ingest a document

## Env Vars

- `QDRANT_URL` / `QDRANT_API_KEY` -- Qdrant Cloud
- `GROQ_API_KEY` -- agentic chunking (Llama 3.1 8B)
- `DEDALUS_MODEL` -- model for runner (default: openai/gpt-5.2)
- `EMBEDDING_MODEL` -- `nomic` (default) or `bge-m3`

## Tests

```bash
python3 -m pytest backend/dedalus_tools/tests/ -v
```

## Key Design: Template-Wrapped Chunk Embedding

Each chunk's text is wrapped in a content_type-specific template before embedding (e.g. an exercise_technique chunk gets prefixed with "Exercise technique and execution. Proper form, posture, and movement cues."). The vector captures the semantic role of the content. Raw text (without template) is stored in the payload. 1 vector per chunk, no deduplication needed. At query time, normal `embed_query()` with Nomic's `search_query:` prefix.
