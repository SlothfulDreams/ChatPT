"""Document parsing via PyMuPDF with OCR fallback.

Uses pymupdf4llm for text-based PDFs. Falls back to pytesseract OCR
for scanned/image-based PDFs that yield no extractable text.
"""

from __future__ import annotations

from pathlib import Path

import pymupdf
import pymupdf4llm


def _ocr_pdf(path: Path) -> str:
    """Extract text from a scanned/image PDF using pytesseract OCR.

    Renders each page as a high-DPI image and runs tesseract on it.
    """
    from PIL import Image
    import pytesseract
    import io

    doc = pymupdf.open(str(path))
    pages_text: list[str] = []

    for page_num in range(len(doc)):
        page = doc[page_num]
        # Render at 300 DPI for good OCR accuracy
        pix = page.get_pixmap(dpi=300)
        img = Image.open(io.BytesIO(pix.tobytes("png")))
        text = pytesseract.image_to_string(img)
        if text.strip():
            pages_text.append(text.strip())

    doc.close()
    return "\n\n".join(pages_text)


def extract_document(path: str | Path, output_path: str | Path | None = None) -> str:
    """Extract text from a document as markdown using PyMuPDF,
    falling back to OCR for scanned/image-based PDFs.

    Args:
        path: Path to the document file.
        output_path: Optional path to write the extracted markdown.

    Returns:
        Extracted text as markdown string.
    """
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"Document not found: {path}")

    markdown = pymupdf4llm.to_markdown(str(path))

    # Fallback: if pymupdf extracted nothing useful, try OCR
    if len(markdown.strip()) < 50 and path.suffix.lower() == ".pdf":
        markdown = _ocr_pdf(path)

    if output_path:
        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(markdown, encoding="utf-8")

    return markdown


def extract_pdf(
    path: str | Path,
    method: str = "pymupdf",
    output_path: str | Path | None = None,
) -> str:
    """Backward-compatible wrapper for PDF extraction.

    Args:
        path: Path to the PDF file.
        method: Extraction method (ignored, always uses pymupdf).
        output_path: Optional path to write extracted markdown.

    Returns:
        Extracted text as markdown string.
    """
    return extract_document(path, output_path)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python -m retrieval.ingestion_pipeline.parsing <file_path>")
        sys.exit(1)

    text = extract_document(sys.argv[1])
    print(f"Extracted {len(text)} characters")
    print(text[:500])
