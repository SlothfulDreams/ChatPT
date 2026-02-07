"""Tests for the PT clinical agent."""

from unittest.mock import MagicMock, patch

import pytest

# Import stub message classes from conftest
from langchain_core.messages import AIMessage, HumanMessage


class TestPatientProfile:
    def test_default_values(self):
        from agent.state import PatientProfile

        profile = PatientProfile()
        assert profile.name == ""
        assert profile.age is None
        assert profile.contraindications == []
        assert profile.goals == []

    def test_with_values(self):
        from agent.state import PatientProfile

        profile = PatientProfile(
            name="John",
            age=45,
            diagnosis="ACL tear",
            contraindications=["weight bearing"],
            goals=["return to sport"],
        )
        assert profile.name == "John"
        assert profile.age == 45
        assert len(profile.goals) == 1


class TestPTAgentState:
    def test_state_structure(self):
        from agent.state import PTAgentState

        annotations = PTAgentState.__annotations__
        assert "messages" in annotations
        assert "patient_profile" in annotations
        assert "retrieved_context" in annotations
        assert "safety_flags" in annotations


class TestSafetyCheck:
    def test_detects_dvt_flag(self):
        from agent.graph import safety_check_node

        state = {
            "messages": [
                HumanMessage(content="Patient has calf swelling and DVT symptoms"),
                AIMessage(content="Let me look into that."),
            ],
            "patient_profile": None,
            "retrieved_context": [],
            "safety_flags": [],
        }

        result = safety_check_node(state)
        flags = result.get("safety_flags", [])
        assert "dvt" in flags or "deep vein thrombosis" in flags

    def test_no_flags_for_normal_query(self):
        from agent.graph import safety_check_node

        state = {
            "messages": [
                HumanMessage(content="What exercises help with knee extension?"),
                AIMessage(content="Here are some exercises for knee extension."),
            ],
            "patient_profile": None,
            "retrieved_context": [],
            "safety_flags": [],
        }

        result = safety_check_node(state)
        assert result.get("safety_flags", []) == []

    def test_addressed_flag_not_repeated(self):
        from agent.graph import safety_check_node

        state = {
            "messages": [
                HumanMessage(content="Patient may have DVT symptoms"),
                AIMessage(
                    content="DVT is a red flag. I recommend immediate referral "
                    "to rule out deep vein thrombosis."
                ),
            ],
            "patient_profile": None,
            "retrieved_context": [],
            "safety_flags": [],
        }

        result = safety_check_node(state)
        assert "dvt" not in result.get("safety_flags", [])


class TestGraphBuild:
    def test_graph_builds(self):
        from agent.graph import build_graph

        graph = build_graph()
        assert graph is not None

    def test_graph_compiles(self):
        from agent.graph import build_graph

        graph = build_graph()
        app = graph.compile()
        assert app is not None


class TestTools:
    @patch("agent.tools._retriever")
    def test_search_knowledge_base(self, mock_retriever):
        mock_retriever.search.return_value = [
            {"text": "Shoulder exercises", "source": "doc.pdf", "score": 0.9},
        ]

        from agent.tools import search_knowledge_base

        result = search_knowledge_base.invoke({"query": "shoulder exercises"})
        assert "Shoulder exercises" in result

    @patch("agent.tools._retriever")
    def test_search_no_results(self, mock_retriever):
        mock_retriever.search.return_value = []

        from agent.tools import search_knowledge_base

        result = search_knowledge_base.invoke({"query": "nonexistent"})
        assert "No relevant results" in result

    def test_set_patient_context(self):
        from agent.tools import set_patient_context

        result = set_patient_context.invoke({
            "name": "Jane",
            "age": 30,
            "diagnosis": "ACL tear",
            "contraindications": "weight bearing, jumping",
            "goals": "return to sport",
        })
        assert "Jane" in result
        assert "ACL tear" in result
        assert "weight bearing" in result

    @patch("agent.tools.get_muscle_synonyms")
    @patch("agent.tools._retriever")
    def test_get_related_structures(self, mock_retriever, mock_synonyms):
        mock_synonyms.return_value = [
            "rotator cuff", "supraspinatus", "infraspinatus",
            "teres minor", "subscapularis",
        ]
        mock_retriever.search.return_value = []

        from agent.tools import get_related_structures

        result = get_related_structures.invoke({"muscle": "rotator cuff"})
        assert "supraspinatus" in result
