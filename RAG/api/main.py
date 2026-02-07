"""FastAPI server for the PT clinical decision support system.

Endpoints:
- POST /chat — agent conversation with session management
- POST /search — direct retriever search
- GET /collection/stats — Qdrant collection info
- POST /ingest — file upload + ingestion
- DELETE /sessions/{session_id} — clear session
"""

import os
import tempfile
import uuid
from typing import Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field

load_dotenv()

# from agent.graph import run_agent  # commented out — requires Anthropic
from agent.state import PatientProfile
from retrieval.client import COLLECTION_NAME, get_client
from retrieval.ingestion_pipeline.ingest import ingest_document, ingest_pdf
from retrieval.retriever import PTRetriever

app = FastAPI(
    title="ChatPT RAG API",
    description="Physical therapy clinical decision support with RAG",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory session storage
_sessions: Dict[str, Dict] = {}


# --- Request/Response models ---


class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    patient_profile: Optional[PatientProfile] = None


class ChatResponse(BaseModel):
    response: str
    session_id: str
    safety_flags: List[str] = Field(default_factory=list)


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: Optional[Dict] = None
    search_type: str = "general"
    muscle: Optional[str] = None
    condition: Optional[str] = None
    region: Optional[str] = None


class SearchResponse(BaseModel):
    results: List[Dict]
    query: str
    num_results: int


class CollectionStats(BaseModel):
    name: str
    points_count: int
    vectors_count: int
    status: str


# --- Endpoints ---


# @app.post("/chat", response_model=ChatResponse)
# async def chat(request: ChatRequest):
#     """Run the PT clinical agent on a user message."""
#     session_id = request.session_id or str(uuid.uuid4())
#
#     # Get or create session
#     if session_id not in _sessions:
#         _sessions[session_id] = {"messages": [], "patient_profile": None}
#
#     session = _sessions[session_id]
#
#     # Update patient profile if provided
#     if request.patient_profile:
#         session["patient_profile"] = request.patient_profile
#
#     # Add user message
#     session["messages"].append(HumanMessage(content=request.message))
#
#     try:
#         result = run_agent(
#             messages=session["messages"],
#             patient_profile=session["patient_profile"],
#         )
#
#         # Extract the last AI response
#         response_text = ""
#         for msg in reversed(result["messages"]):
#             if isinstance(msg, AIMessage) and isinstance(msg.content, str) and msg.content:
#                 response_text = msg.content
#                 break
#
#         # Update session with full message history
#         session["messages"] = result["messages"]
#         safety_flags = result.get("safety_flags", [])
#
#         return ChatResponse(
#             response=response_text,
#             session_id=session_id,
#             safety_flags=safety_flags,
#         )
#     except Exception as e:
#         raise HTTPException(status_code=500, detail=str(e))


@app.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Direct retriever search without the agent."""
    retriever = PTRetriever()

    try:
        if request.search_type == "muscle" and request.muscle:
            results = retriever.search_by_muscle(request.muscle, top_k=request.top_k)
        elif request.search_type == "condition" and request.condition:
            results = retriever.search_by_condition(
                request.condition, top_k=request.top_k
            )
        elif request.search_type == "region" and request.region:
            results = retriever.search_by_region(request.region, top_k=request.top_k)
        else:
            results = retriever.search(
                request.query, top_k=request.top_k, filters=request.filters
            )

        return SearchResponse(
            results=results,
            query=request.query,
            num_results=len(results),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/collection/stats", response_model=CollectionStats)
async def collection_stats():
    """Get Qdrant collection statistics."""
    try:
        client = get_client()
        info = client.get_collection(COLLECTION_NAME)
        return CollectionStats(
            name=COLLECTION_NAME,
            points_count=info.points_count or 0,
            vectors_count=getattr(info, "vectors_count", info.points_count) or 0,
            status=str(info.status),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/ingest")
async def ingest(file: UploadFile = File(...)):
    """Upload and ingest a document file."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    suffix = os.path.splitext(file.filename)[1].lower()
    allowed = {".pdf", ".docx", ".pptx", ".html", ".md", ".txt"}
    if suffix not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {suffix}. Allowed: {allowed}",
        )

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        if suffix == ".pdf":
            count = ingest_pdf(tmp_path)
        else:
            count = ingest_document(tmp_path)

        os.unlink(tmp_path)

        return {
            "filename": file.filename,
            "chunks_ingested": count,
            "status": "success",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    """Clear a chat session."""
    if session_id in _sessions:
        del _sessions[session_id]
        return {"status": "deleted", "session_id": session_id}
    raise HTTPException(status_code=404, detail="Session not found")
