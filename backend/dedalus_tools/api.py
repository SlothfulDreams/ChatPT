"""FastAPI router for RAG search, ingestion, and collection management.

Mount this router in the main backend app:
    from backend.dedalus_tools.api import router as rag_router
    app.include_router(rag_router, prefix="/rag")
"""

from __future__ import annotations

import os
import tempfile
from typing import Dict, List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
from pydantic import BaseModel

from .retrieval.client import COLLECTION_NAME, get_client
from .retrieval.ingestion_pipeline.ingest import ingest_document, ingest_pdf
from .retrieval.retriever import PTRetriever

router = APIRouter(tags=["rag"])


# --- Request/Response models ---


class SearchRequest(BaseModel):
    query: str
    top_k: int = 10
    filters: Optional[Dict] = None
    search_type: str = (
        "general"  # general, muscle_group, condition, content_type, exercise
    )
    muscle_group: Optional[str] = None
    condition: Optional[str] = None
    content_type: Optional[str] = None
    exercise: Optional[str] = None


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


@router.post("/search", response_model=SearchResponse)
async def search(request: SearchRequest):
    """Direct retriever search."""
    retriever = PTRetriever()

    try:
        if request.search_type == "muscle_group" and request.muscle_group:
            results = retriever.search_by_muscle_group(
                request.muscle_group, top_k=request.top_k
            )
        elif request.search_type == "condition" and request.condition:
            results = retriever.search_by_condition(
                request.condition, top_k=request.top_k
            )
        elif request.search_type == "content_type" and request.content_type:
            results = retriever.search_by_content_type(
                request.content_type, request.query, top_k=request.top_k
            )
        elif request.search_type == "exercise" and request.exercise:
            results = retriever.search_by_exercise(
                request.exercise, top_k=request.top_k
            )
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


@router.get("/collection/stats", response_model=CollectionStats)
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


@router.post("/ingest")
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
