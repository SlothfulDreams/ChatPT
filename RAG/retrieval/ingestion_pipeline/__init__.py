from .parsing import extract_document, extract_pdf, extract_tables
from .chunking import agentic_chunk
from .embedding import embed_documents, embed_query, get_embedding_dim

# ingest imports are deferred to avoid circular import with retrieval.client
# Use: from retrieval.ingestion_pipeline.ingest import ingest_pdf, ingest_document, ingest_directory
