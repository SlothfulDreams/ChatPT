"""Tests for document parsing module."""

import tempfile
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


@pytest.fixture
def sample_text():
    return "# Shoulder Rehabilitation\n\nThis document covers rotator cuff exercises."


@pytest.fixture
def mock_converter(sample_text):
    """Mock DocumentConverter for testing without Docling installed."""
    mock_doc = MagicMock()
    mock_doc.export_to_markdown.return_value = sample_text
    mock_doc.tables = []

    mock_result = MagicMock()
    mock_result.document = mock_doc

    mock_conv = MagicMock()
    mock_conv.convert.return_value = mock_result
    return mock_conv


class TestExtractDocument:
    @patch("retrieval.ingestion_pipeline.parsing._get_converter")
    def test_extract_returns_markdown(self, mock_get_conv, mock_converter, sample_text):
        mock_get_conv.return_value = mock_converter

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"fake pdf")
            tmp_path = f.name

        from retrieval.ingestion_pipeline.parsing import extract_document

        result = extract_document(tmp_path)
        assert result == sample_text
        Path(tmp_path).unlink()

    @patch("retrieval.ingestion_pipeline.parsing._get_converter")
    def test_extract_writes_output(self, mock_get_conv, mock_converter, sample_text):
        mock_get_conv.return_value = mock_converter

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"fake pdf")
            tmp_path = f.name

        with tempfile.NamedTemporaryFile(suffix=".md", delete=False) as out:
            out_path = out.name

        from retrieval.ingestion_pipeline.parsing import extract_document

        extract_document(tmp_path, output_path=out_path)
        assert Path(out_path).read_text() == sample_text

        Path(tmp_path).unlink()
        Path(out_path).unlink()

    def test_extract_file_not_found(self):
        from retrieval.ingestion_pipeline.parsing import extract_document

        with pytest.raises(FileNotFoundError):
            extract_document("/nonexistent/file.pdf")


class TestExtractPdf:
    @patch("retrieval.ingestion_pipeline.parsing._get_converter")
    def test_backward_compat(self, mock_get_conv, mock_converter, sample_text):
        mock_get_conv.return_value = mock_converter

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"fake pdf")
            tmp_path = f.name

        from retrieval.ingestion_pipeline.parsing import extract_pdf

        result = extract_pdf(tmp_path, method="docling")
        assert result == sample_text
        Path(tmp_path).unlink()

    def test_unsupported_method(self):
        from retrieval.ingestion_pipeline.parsing import extract_pdf

        with pytest.raises(ValueError, match="Unsupported"):
            extract_pdf("/some/file.pdf", method="pymupdf")


class TestExtractTables:
    @patch("retrieval.ingestion_pipeline.parsing._get_converter")
    def test_extract_tables_empty(self, mock_get_conv, mock_converter):
        mock_get_conv.return_value = mock_converter

        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(b"fake pdf")
            tmp_path = f.name

        from retrieval.ingestion_pipeline.parsing import extract_tables

        tables = extract_tables(tmp_path)
        assert tables == []
        Path(tmp_path).unlink()
