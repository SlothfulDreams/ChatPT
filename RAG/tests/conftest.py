"""Pytest configuration — mocks unavailable third-party modules."""

import sys
import types
from unittest.mock import MagicMock

# Modules that may not be installed in the test environment.
# We create lightweight stubs so our modules can be imported.
_STUB_MODULES = [
    "docling",
    "docling.document_converter",
    "fastembed",
    "qdrant_client",
    "qdrant_client.http",
    "qdrant_client.http.models",
    "sentence_transformers",
    "semantic_text_splitter",
    "langchain_core",
    "langchain_core.messages",
    "langchain_core.tools",
    # "langchain_anthropic",
    "langgraph",
    "langgraph.graph",
    "langgraph.graph.message",
    "langgraph.prebuilt",
]

for mod_name in _STUB_MODULES:
    if mod_name not in sys.modules:
        sys.modules[mod_name] = MagicMock()

# Provide concrete sentinel classes so isinstance / type checks work

# --- langchain_core.messages ---
_lc_messages = types.ModuleType("langchain_core.messages")


class BaseMessage:
    def __init__(self, content="", **kwargs):
        self.content = content
        self.tool_calls = kwargs.get("tool_calls", [])


class HumanMessage(BaseMessage):
    pass


class AIMessage(BaseMessage):
    pass


class SystemMessage(BaseMessage):
    pass


_lc_messages.BaseMessage = BaseMessage
_lc_messages.HumanMessage = HumanMessage
_lc_messages.AIMessage = AIMessage
_lc_messages.SystemMessage = SystemMessage
sys.modules["langchain_core.messages"] = _lc_messages

# --- langchain_core.tools ---
_lc_tools = types.ModuleType("langchain_core.tools")


def _tool_decorator(func=None, **kwargs):
    """Minimal @tool decorator that preserves the function and adds .invoke."""
    def wrap(fn):
        fn.invoke = lambda args: fn(**args)
        return fn
    if func is not None:
        return wrap(func)
    return wrap


_lc_tools.tool = _tool_decorator
sys.modules["langchain_core.tools"] = _lc_tools

# --- langgraph.graph.message ---
_lg_message = types.ModuleType("langgraph.graph.message")


def add_messages(left, right):
    if left is None:
        left = []
    return list(left) + list(right)


_lg_message.add_messages = add_messages
sys.modules["langgraph.graph.message"] = _lg_message

# --- langgraph.graph ---
_lg_graph = types.ModuleType("langgraph.graph")
_lg_graph.END = "__end__"


class _StateGraph:
    def __init__(self, state_type):
        self.state_type = state_type
        self._nodes = {}
        self._edges = {}
        self._conditional_edges = {}
        self._entry = None

    def add_node(self, name, func):
        self._nodes[name] = func

    def add_edge(self, src, dst):
        self._edges[src] = dst

    def add_conditional_edges(self, src, router, mapping):
        self._conditional_edges[src] = (router, mapping)

    def set_entry_point(self, name):
        self._entry = name

    def compile(self):
        return MagicMock()


_lg_graph.StateGraph = _StateGraph
sys.modules["langgraph.graph"] = _lg_graph

# --- qdrant_client.http.models ---
_qd_models = types.ModuleType("qdrant_client.http.models")


class _Distance:
    COSINE = "Cosine"


class _VectorParams:
    def __init__(self, size=0, distance=None):
        self.size = size
        self.distance = distance


class _PayloadSchemaType:
    KEYWORD = "keyword"


class _Filter:
    def __init__(self, must=None, should=None):
        self.must = must or []
        self.should = should or []


class _FieldCondition:
    def __init__(self, key="", match=None):
        self.key = key
        self.match = match


class _MatchAny:
    def __init__(self, any=None):
        self.any = any or []


class _PointStruct:
    def __init__(self, id="", vector=None, payload=None):
        self.id = id
        self.vector = vector
        self.payload = payload


_qd_models.Distance = _Distance
_qd_models.VectorParams = _VectorParams
_qd_models.PayloadSchemaType = _PayloadSchemaType
_qd_models.Filter = _Filter
_qd_models.FieldCondition = _FieldCondition
_qd_models.MatchAny = _MatchAny
_qd_models.PointStruct = _PointStruct
sys.modules["qdrant_client.http.models"] = _qd_models

# Ensure RAG/ is on sys.path
import os

rag_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if rag_dir not in sys.path:
    sys.path.insert(0, rag_dir)
