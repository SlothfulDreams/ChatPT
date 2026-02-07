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
│   ├── client.py          # Qdrant Cloud client (collection: physio-knowledge-base-v2)
│   ├── retriever.py       # PTRetriever with HyDE chunk dedup
│   ├── reranker.py        # Cross-encoder reranker
│   └── ingestion_pipeline/
│       ├── parsing.py     # Docling document extraction
│       ├── chunking.py    # Agentic chunking (Groq + Instructor) with HyDE
│       ├── embedding.py   # Nomic v1.5 embeddings via FastEmbed (768d)
│       └── ingest.py      # Parse -> chunk -> embed questions -> upsert
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

## Key Design: HyDE Ingestion

Each chunk generates 8-10 hypothetical questions via LLM. Those questions (not the chunk text) get embedded and stored. At query time, the user's question matches against these hypothetical question embeddings, then results are deduplicated by `chunk_id` to return chunk-level results. This closes the semantic gap between question-style queries and prose-style documents.
