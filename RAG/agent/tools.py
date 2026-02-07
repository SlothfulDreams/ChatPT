"""LangChain @tool functions wrapping PTRetriever for the clinical agent."""

from __future__ import annotations

from langchain_core.tools import tool

from ..retrieval.ontology import get_muscle_synonyms
from ..retrieval.retriever import PTRetriever

_retriever = PTRetriever()

# Module-level patient profile storage (per-process; API manages sessions)
_patient_context: dict | None = None


@tool
def search_knowledge_base(query: str) -> str:
    """Search the physical therapy knowledge base for clinical evidence.

    Use this tool for general clinical questions about treatments,
    exercises, protocols, or evidence.

    Args:
        query: Natural language search query.
    """
    results = _retriever.search(query, top_k=5)
    if not results:
        return "No relevant results found in the knowledge base."

    output = []
    for i, r in enumerate(results, 1):
        source = r.get("source", "unknown")
        score = r.get("score", 0)
        text = r.get("text", "")
        output.append(f"[{i}] (score: {score:.3f}, source: {source})\n{text}\n")

    return "\n".join(output)


@tool
def search_by_muscle(muscle: str) -> str:
    """Search for content related to a specific muscle or muscle group.

    Use this when the question targets a specific muscle (e.g., "rotator cuff",
    "quadriceps", "hamstrings").

    Args:
        muscle: Name of the muscle or muscle group.
    """
    results = _retriever.search_by_muscle(muscle, top_k=5)
    if not results:
        return f"No results found for muscle: {muscle}"

    output = [f"Results for '{muscle}':"]
    for i, r in enumerate(results, 1):
        text = r.get("text", "")
        output.append(f"[{i}] {text[:500]}")

    return "\n\n".join(output)


@tool
def search_by_condition(condition: str) -> str:
    """Search for evidence related to a specific clinical condition.

    Use this for condition-specific protocols, rehabilitation guidelines,
    or treatment evidence (e.g., "ACL reconstruction", "frozen shoulder").

    Args:
        condition: Clinical condition or diagnosis.
    """
    results = _retriever.search_by_condition(condition, top_k=5)
    if not results:
        return f"No results found for condition: {condition}"

    output = [f"Evidence for '{condition}':"]
    for i, r in enumerate(results, 1):
        text = r.get("text", "")
        source = r.get("source", "unknown")
        output.append(f"[{i}] (source: {source})\n{text[:500]}")

    return "\n\n".join(output)


@tool
def check_contraindications(condition: str, intervention: str) -> str:
    """Check for contraindications for a given condition and intervention.

    Use this to verify safety before recommending treatments.

    Args:
        condition: Patient's condition or diagnosis.
        intervention: Proposed intervention or treatment.
    """
    query = f"contraindications {intervention} {condition}"
    results = _retriever.search(query, top_k=5)

    if not results:
        return (
            f"No specific contraindication data found for {intervention} "
            f"with {condition}. Exercise clinical judgment."
        )

    output = [f"Contraindication check: {intervention} for {condition}"]
    for i, r in enumerate(results, 1):
        text = r.get("text", "")
        output.append(f"[{i}] {text[:500]}")

    return "\n\n".join(output)


@tool
def set_patient_context(
    name: str = "",
    age: int | None = None,
    diagnosis: str = "",
    contraindications: str = "",
    goals: str = "",
) -> str:
    """Set patient context for the current session.

    Store patient information to tailor clinical recommendations.

    Args:
        name: Patient name or identifier.
        age: Patient age.
        diagnosis: Primary diagnosis.
        contraindications: Comma-separated list of contraindications.
        goals: Comma-separated list of treatment goals.
    """
    global _patient_context
    _patient_context = {
        "name": name,
        "age": age,
        "diagnosis": diagnosis,
        "contraindications": [c.strip() for c in contraindications.split(",") if c.strip()],
        "goals": [g.strip() for g in goals.split(",") if g.strip()],
    }

    parts = ["Patient context updated:"]
    if name:
        parts.append(f"  Name: {name}")
    if age:
        parts.append(f"  Age: {age}")
    if diagnosis:
        parts.append(f"  Diagnosis: {diagnosis}")
    if _patient_context["contraindications"]:
        parts.append(f"  Contraindications: {', '.join(_patient_context['contraindications'])}")
    if _patient_context["goals"]:
        parts.append(f"  Goals: {', '.join(_patient_context['goals'])}")

    return "\n".join(parts)


@tool
def get_related_structures(muscle: str) -> str:
    """Get anatomically related structures for a muscle or muscle group.

    Use this to understand anatomical relationships, synergists,
    antagonists, and components of a muscle group.

    Args:
        muscle: Name of the muscle or muscle group.
    """
    synonyms = get_muscle_synonyms(muscle)

    if len(synonyms) <= 1:
        return f"No additional anatomical data found for '{muscle}'."

    output = [f"Related structures for '{muscle}':"]
    output.append(f"  Related terms: {', '.join(synonyms)}")

    # Also search for contextual information
    results = _retriever.search(
        f"{muscle} anatomy attachments actions", top_k=3
    )
    if results:
        output.append("\nRelevant knowledge base entries:")
        for i, r in enumerate(results, 1):
            text = r.get("text", "")
            output.append(f"[{i}] {text[:300]}")

    return "\n".join(output)


def get_all_tools() -> list:
    """Return all agent tools."""
    return [
        search_knowledge_base,
        search_by_muscle,
        search_by_condition,
        check_contraindications,
        set_patient_context,
        get_related_structures,
    ]
