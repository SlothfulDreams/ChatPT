from __future__ import annotations

import asyncio
import logging
import os

from dedalus_labs import AsyncDedalus

logger = logging.getLogger(__name__)

IMAGE_MODEL = os.getenv("DEDALUS_IMAGE_MODEL", "openai/dall-e-3")


async def generate_exercise_image(exercise_name: str) -> str | None:
    """Generate a simple illustration for an exercise via DALL-E 3.

    Returns an image URL string, or None on failure.
    """
    try:
        client = AsyncDedalus()
        response = await client.images.generate(
            prompt=(
                f"A simple, clean illustration showing proper form for the exercise: "
                f"{exercise_name}. Show a figure performing the exercise with good posture. "
                f"Minimal background, fitness style."
            ),
            model=IMAGE_MODEL,
            size="1024x1024",
            n=1,
        )
        url = response.data[0].url
        if url:
            return url
        logger.warning("No image URL in response for %s", exercise_name)
        return None
    except Exception:
        logger.warning("Image generation failed for %s", exercise_name, exc_info=True)
        return None


async def generate_all_exercise_images(
    exercises: list[dict],
) -> list[dict]:
    """Generate images for all exercises in parallel.

    Mutates each exercise dict by setting imageUrl. Returns the list.
    """
    tasks = [generate_exercise_image(ex["name"]) for ex in exercises]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for ex, result in zip(exercises, results):
        if isinstance(result, str):
            ex["imageUrl"] = result
        else:
            ex["imageUrl"] = None

    return exercises
