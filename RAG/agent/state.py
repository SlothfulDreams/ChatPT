"""Agent state definitions for the PT clinical agent.

Defines the PatientProfile model and PTAgentState TypedDict
used by the LangGraph StateGraph.
"""

from typing import Annotated, Dict, List, Optional, TypedDict

from langchain_core.messages import BaseMessage
from langgraph.graph.message import add_messages
from pydantic import BaseModel, Field


class PatientProfile(BaseModel):
    """Patient context for clinical decision support."""

    name: str = ""
    age: Optional[int] = None
    sex: str = ""
    chief_complaint: str = ""
    diagnosis: str = ""
    relevant_history: List[str] = Field(default_factory=list)
    contraindications: List[str] = Field(default_factory=list)
    precautions: List[str] = Field(default_factory=list)
    goals: List[str] = Field(default_factory=list)


class PTAgentState(TypedDict):
    """State for the PT clinical decision support agent."""

    messages: Annotated[List[BaseMessage], add_messages]
    patient_profile: Optional[PatientProfile]
    retrieved_context: List[Dict]
    safety_flags: List[str]
