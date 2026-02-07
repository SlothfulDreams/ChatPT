from __future__ import annotations

import os
from typing import Any

from dedalus_labs import AsyncDedalus, Dedalus
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage
from langchain_core.outputs import ChatGeneration, ChatResult


def _message_to_dict(msg: BaseMessage) -> dict[str, str]:
    role_map = {
        "human": "user",
        "ai": "assistant",
        "system": "system",
    }
    return {
        "role": role_map.get(msg.type, msg.type),
        "content": msg.content if isinstance(msg.content, str) else str(msg.content),
    }


class DedalusChatModel(BaseChatModel):
    """LangChain ChatModel wrapping Dedalus Labs' OpenAI-compatible API."""

    model_name: str = ""
    temperature: float = 0.7
    max_tokens: int = 4096

    def __init__(self, **kwargs: Any) -> None:
        if not kwargs.get("model_name"):
            kwargs["model_name"] = os.getenv("DEDALUS_MODEL", "openai/gpt-5.2")
        super().__init__(**kwargs)

    @property
    def _llm_type(self) -> str:
        return "dedalus"

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        client = Dedalus()
        response = client.chat.completions.create(
            model=self.model_name,
            messages=[_message_to_dict(m) for m in messages],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stop=stop,
        )
        content = response.choices[0].message.content or ""
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=content))]
        )

    async def _agenerate(
        self,
        messages: list[BaseMessage],
        stop: list[str] | None = None,
        **kwargs: Any,
    ) -> ChatResult:
        client = AsyncDedalus()
        response = await client.chat.completions.create(
            model=self.model_name,
            messages=[_message_to_dict(m) for m in messages],
            temperature=self.temperature,
            max_tokens=self.max_tokens,
            stop=stop,
        )
        content = response.choices[0].message.content or ""
        return ChatResult(
            generations=[ChatGeneration(message=AIMessage(content=content))]
        )
