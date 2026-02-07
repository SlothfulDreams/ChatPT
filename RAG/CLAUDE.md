# ChatPT RAG System

Agentic Physical Therapy clinical decision support system with RAG (Retrieval-Augmented Generation).

## Architecture

```
RAG/
├── retrieval/           # Vector search & document processing
│   ├── client.py        # Qdrant Cloud client
│   ├── retriever.py     # PTRetriever with ontology expansion
│   ├── reranker.py      # Cross-encoder reranker
│   ├── ontology/        # Muscle/anatomy query expansion
│   └── ingestion_pipeline/
│       ├── parsing.py   # Docling document extraction
│       ├── chunking.py  # Agentic chunking (Groq + Instructor)
│       ├── embedding.py # Nomic/BGE-M3 embeddings via FastEmbed
│       └── ingest.py    # End-to-end ingestion pipeline
├── agent/               # LangGraph clinical agent
│   ├── state.py         # PTAgentState, PatientProfile
│   ├── tools.py         # LangChain @tool functions
│   ├── prompts.py       # Clinical system prompt
│   └── graph.py         # StateGraph with safety checks
├── api/                 # FastAPI server
│   └── main.py          # REST endpoints
└── tests/               # Pytest suite
```

## Prerequisites

- Python 3.11+
- Qdrant Cloud account (no Docker needed)
- API keys: Anthropic, Groq

## Environment Setup

1. Copy `.env.example` to `.env` and fill in your keys:
   ```bash
   cp .env.example .env
   ```

2. Required env vars:
   - `QDRANT_URL` — Qdrant Cloud cluster URL
   - `QDRANT_API_KEY` — Qdrant Cloud API key
   - `GROQ_API_KEY` — For agentic chunking
   - `ANTHROPIC_API_KEY` — For the LangGraph agent
   - `EMBEDDING_MODEL` — `nomic` (768d, default) or `bge-m3` (1024d)

3. Install dependencies:
   ```bash
   cd RAG
   pip install -r requirements.txt
   ```

## Ontology Data Files

The ontology module (`retrieval/ontology/`) requires data files that must be provided separately:
- `muscle_graph.json` — Muscle relationship graph
- `query_expansion_map.json` — Query expansion mappings

Placeholder files are included so imports don't crash. Replace them with real data for production use.

## Ingestion Workflow

1. Parse documents (PDF, DOCX, etc.) with Docling:
   ```python
   from retrieval.ingestion_pipeline import ingest_pdf, ingest_directory

   # Single PDF
   ingest_pdf("path/to/document.pdf")

   # Entire directory
   ingest_directory("path/to/docs/")
   ```

2. The pipeline: parse → chunk (with metadata extraction) → embed → upsert to Qdrant

## Running the API

```bash
cd RAG
uvicorn api.main:app --reload --port 8000
```

### Endpoints

- `POST /chat` — Agent conversation (session-based)
- `POST /search` — Direct vector search
- `GET /collection/stats` — Qdrant collection info
- `POST /ingest` — Upload & ingest a file
- `DELETE /sessions/{session_id}` — Clear a session

## Running Tests

```bash
cd RAG
pytest tests/ -v
```

Tests use mocks for external services (Qdrant, Groq, Anthropic) so they run without API keys.

## Embedding Models

| Model | Dimensions | Prefix (doc) | Prefix (query) |
|-------|-----------|--------------|-----------------|
| nomic | 768 | `search_document: ` | `search_query: ` |
| bge-m3 | 1024 | (none) | (none) |

Set via `EMBEDDING_MODEL` env var. Changing models requires re-ingesting all documents.
