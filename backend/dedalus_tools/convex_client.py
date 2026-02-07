"""Singleton Convex client for querying patient data."""

from __future__ import annotations

import os

from convex import ConvexClient

_client: ConvexClient | None = None


def get_convex_client() -> ConvexClient:
    """Get or create the Convex client.

    Uses CONVEX_URL env var (e.g., https://patient-possum-187.convex.cloud).
    """
    global _client
    if _client is None:
        url = os.getenv("CONVEX_URL")
        if not url:
            raise ValueError(
                "CONVEX_URL must be set (e.g., https://patient-possum-187.convex.cloud)"
            )
        _client = ConvexClient(url)
    return _client
