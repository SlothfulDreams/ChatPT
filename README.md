# ChatPT

**AI physiotherapist on a 3D anatomical model.**

[![Demo](https://img.youtube.com/vi/fElr_EC7hRs/maxresdefault.jpg)](https://www.youtube.com/watch?v=fElr_EC7hRs)

## What it does

ChatPT lets you click where it hurts on an interactive 3D body, describe your symptoms, and receive a clinical assessment from an AI physiotherapist agent. The agent reasons over a RAG pipeline of medical textbooks, diagnoses the affected muscles, and generates a personalized rehab/workout plan -- all visualized in real time on a color-coded anatomical model.

## Features

- **Interactive 3D anatomical model** -- 200+ individually selectable muscles, color-coded by condition and severity
- **AI physiotherapist agent** -- multi-step reasoning with tool calling (Dedalus SDK)
- **RAG over clinical knowledge base** -- Qdrant vector search with Nomic embeddings
- **Workout generation** -- targeted rehab plans for affected muscle groups
- **Per-muscle condition tracking** -- severity levels with history timeline
- **Voice input** -- Whisper transcription for hands-free symptom description
- **Real-time state sync** -- Convex reactive database keeps the 3D model and chat in lockstep

## Tech stack

| Frontend | Backend |
|---|---|
| Next.js 16 | FastAPI |
| React 19 | Dedalus SDK |
| Tailwind v4 | Qdrant |
| React Three Fiber + drei | Groq |
| Convex | Whisper |
| Clerk (auth) | LangChain |

## Getting started

### Prerequisites

- [Bun](https://bun.sh) (package manager)
- Python 3.12+
- A [Convex](https://convex.dev) account
- A [Clerk](https://clerk.com) account

### Frontend

```bash
cd frontend
bun install
npx convex dev   # generates types + starts Convex backend
bun run dev      # starts Next.js on localhost:3000
```

### Backend

```bash
cd backend
pip install -e .
cp .env.example .env   # fill in your keys
python main.py
```

### Environment variables

See `backend/.env.example` for the full list:

| Variable | Description |
|---|---|
| `DEDALUS_API_KEY` | Dedalus Labs API key |
| `CONVEX_URL` | Your Convex deployment URL |
| `QDRANT_URL` | Qdrant instance URL |
| `QDRANT_API_KEY` | Qdrant API key |
| `GROQ_API_KEY` | Groq API key |
| `EMBEDDING_MODEL` | Embedding model name (default: `nomic`) |

## Built at

[TartanHacks 2026](https://tartanhacks.com)
