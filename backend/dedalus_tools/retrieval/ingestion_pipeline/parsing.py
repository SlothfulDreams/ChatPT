"""Document parsing via Docling.

Provides unified extraction for PDFs, DOCX, and other document formats
using a singleton DocumentConverter.
"""

from __future__ import annotations

from pathlib import Path

from docling.document_converter import DocumentConverter

_converter: DocumentConverter | None = None


def _get_converter() -> DocumentConverter:
    """Get or create the singleton DocumentConverter."""
    global _converter
    if _converter is None:
        _converter = DocumentConverter()
    return _converter


def extract_document(path: str | Path, output_path: str | Path | None = None) -> str:
    """Extract text from a document using Docling.

    Supports PDF, DOCX, PPTX, HTML, and other formats via Docling.

    Args:
        path: Path to the document file.
        output_path: Optional path to write the extracted markdown.

    Returns:
        Extracted text as markdown string.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    converter = _get_converter()
    result = converter.convert(str(path))
    markdown = result.document.export_to_markdown()

    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(markdown, encoding="utf-8")

    return markdown


def extract_pdf(
    path: str | Path,
    method: str = "docling",
    output_path: str | Path | None = None,
) -> str:
    """Extract text from a PDF (backward-compatible wrapper).

    Args:
        path: Path to the PDF file.
        method: Extraction method. Only "docling" is supported.
        output_path: Optional path to write extracted markdown.

    Returns:
        Extracted text as markdown string.
    """
    if method != "docling":
        raise ValueError(f"Unsupported extraction method: {method}. Use 'docling'.")
    return extract_document(path, output_path)


def extract_tables(path: str | Path) -> list[dict]:
    """Extract structured tables from a document.

    Args:
        path: Path to the document file.

    Returns:
        List of table dicts with 'headers' and 'rows' keys.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    converter = _get_converter()
    result = converter.convert(str(path))

    tables = []
    for table in result.document.tables:
        table_data = table.export_to_dataframe()
        tables.append({
            "headers": list(table_data.columns),
            "rows": table_data.values.tolist(),
        })

    return tables


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m retrieval.ingestion_pipeline.parsing <file_path>")
        sys.exit(1)

    text = extract_document(sys.argv[1])
    print(f"Extracted {len(text)} characters")
    print(text[:500])
