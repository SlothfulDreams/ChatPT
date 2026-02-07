"""LangGraph StateGraph for the PT clinical agent.

Implements: reasoning_node → tool_node (loop) → safety_check_node → END
# Uses ChatAnthropic with Claude claude-sonnet-4-20250514 as the reasoning model.
"""

import os

# from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import ToolNode

from .prompts import SYSTEM_PROMPT
from .state import PTAgentState
from .tools import get_all_tools

# Red flags that require safety warnings
RED_FLAGS = [
    "dvt",
    "deep vein thrombosis",
    "cauda equina",
    "cardiac",
    "chest pain",
    "fracture",
    "dislocation",
    "neurological deterioration",
    "infection",
    "septic",
    "pulmonary embolism",
    "stroke",
    "tia",
]


# def _get_model():
#     """Create the ChatAnthropic model."""
#     return ChatAnthropic(
#         model="claude-sonnet-4-20250514",
#         api_key=os.getenv("ANTHROPIC_API_KEY"),
#         temperature=0,
#         max_tokens=4096,
#     )


def reasoning_node(state: PTAgentState) -> dict:
    """Main reasoning node: invokes the LLM with tools bound."""
    model = _get_model()
    tools = get_all_tools()
    model_with_tools = model.bind_tools(tools)

    messages = state["messages"]

    # Prepend system message if not already present
    if not messages or not isinstance(messages[0], SystemMessage):
        messages = [SystemMessage(content=SYSTEM_PROMPT)] + list(messages)

    response = model_with_tools.invoke(messages)
    return {"messages": [response]}


def safety_check_node(state: PTAgentState) -> dict:
    """Check for unaddressed safety red flags in the conversation."""
    messages = state["messages"]
    safety_flags = []

    # Scan the last user message and retrieved context for red flags
    conversation_text = ""
    for msg in messages:
        if hasattr(msg, "content") and isinstance(msg.content, str):
            conversation_text += " " + msg.content.lower()

    for flag in RED_FLAGS:
        if flag in conversation_text:
            # Check if the flag was already addressed in an AI response
            ai_addressed = False
            for msg in messages:
                if isinstance(msg, AIMessage) and isinstance(msg.content, str):
                    if flag in msg.content.lower() and (
                        "refer" in msg.content.lower()
                        or "caution" in msg.content.lower()
                        or "contraindicated" in msg.content.lower()
                        or "red flag" in msg.content.lower()
                        or "emergency" in msg.content.lower()
                    ):
                        ai_addressed = True
                        break

            if not ai_addressed:
                safety_flags.append(flag)

    if safety_flags:
        warning = (
            "⚠️ SAFETY ALERT: The following red flags were detected "
            "but may not have been fully addressed: "
            + ", ".join(safety_flags)
            + ". Please ensure appropriate referral or precautions are discussed."
        )
        return {
            "safety_flags": safety_flags,
            "messages": [AIMessage(content=warning)],
        }

    return {"safety_flags": []}


def should_continue(state: PTAgentState) -> str:
    """Route: if last message has tool calls → tools, else → safety_check."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    return "safety_check"


def build_graph() -> StateGraph:
    """Build the PT agent StateGraph.

    Flow: reasoning → [tool_calls?] → tools → reasoning (loop)
                    → [no tool_calls] → safety_check → END
    """
    tools = get_all_tools()
    tool_node = ToolNode(tools)

    graph = StateGraph(PTAgentState)

    graph.add_node("reasoning", reasoning_node)
    graph.add_node("tools", tool_node)
    graph.add_node("safety_check", safety_check_node)

    graph.set_entry_point("reasoning")

    graph.add_conditional_edges(
        "reasoning",
        should_continue,
        {"tools": "tools", "safety_check": "safety_check"},
    )
    graph.add_edge("tools", "reasoning")
    graph.add_edge("safety_check", END)

    return graph


def run_agent(
    messages: list,
    patient_profile=None,
) -> dict:
    """Run the PT agent on a list of messages.

    Args:
        messages: List of LangChain message objects.
        patient_profile: Optional PatientProfile instance.

    Returns:
        Final state dict with messages, safety_flags, etc.
    """
    graph = build_graph()
    app = graph.compile()

    initial_state: PTAgentState = {
        "messages": messages,
        "patient_profile": patient_profile,
        "retrieved_context": [],
        "safety_flags": [],
    }

    result = app.invoke(initial_state)
    return result
