"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type ChatAction, type ChatMessage, useChat } from "@/hooks/useChat";
import { formatMuscleName } from "@/lib/muscle-utils";

interface ChatPanelProps {
  onClose: () => void;
  onHighlightMuscles?: (meshIds: string[]) => void;
}

export function ChatPanel({ onClose, onHighlightMuscles }: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    newConversation,
    conversationTitle,
  } = useChat();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    sendMessage(text);
  }, [input, isStreaming, sendMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="pointer-events-auto mosaic-panel flex h-[70vh] w-96 flex-col text-white">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <h3 className="flex-1 truncate text-sm font-semibold">
          {conversationTitle ?? "New Conversation"}
        </h3>
        <button
          type="button"
          onClick={newConversation}
          className="rounded px-2 py-0.5 text-xs text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
          title="New conversation"
        >
          +
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-white/40 transition-colors hover:text-white"
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="max-w-[240px] text-center text-xs text-white/30">
              Describe your pain, tightness, or injury and I'll help assess it.
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <MessageBubble
            key={msg.id}
            message={msg}
            onHighlightMuscles={onHighlightMuscles}
          />
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-white/10 p-3">
        <div className="flex gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your issue..."
            rows={1}
            className="flex-1 resize-none rounded-lg bg-white/10 px-3 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-white/20"
          />
          {isStreaming ? (
            <button
              type="button"
              onClick={stopStreaming}
              className="shrink-0 rounded-lg bg-red-500/20 px-3 py-2 text-xs font-medium text-red-300 transition-colors hover:bg-red-500/30"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim()}
              className="mosaic-btn-primary shrink-0 px-3 py-2 text-xs font-medium"
            >
              Send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// Message Bubble
// ============================================

function MessageBubble({
  message,
  onHighlightMuscles,
}: {
  message: ChatMessage;
  onHighlightMuscles?: (meshIds: string[]) => void;
}) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
          isUser ? "mosaic-tag text-white/90" : "bg-white/5 text-white/80"
        } ${message.isStreaming ? "animate-pulse" : ""}`}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>

        {message.actions && message.actions.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1 border-t border-white/10 pt-2">
            {message.actions.map((action, i) => (
              <ActionChip
                key={`${action.name}-${i}`}
                action={action}
                applied={message.actionsApplied ?? false}
                onHighlight={onHighlightMuscles}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// Action Chip
// ============================================

function ActionChip({
  action,
  applied,
  onHighlight,
}: {
  action: ChatAction;
  applied: boolean;
  onHighlight?: (meshIds: string[]) => void;
}) {
  const label = (() => {
    switch (action.name) {
      case "update_muscle":
        return `Updated ${formatMuscleName(action.params.meshId)}`;
      case "add_knot":
        return `Added ${action.params.type.replace("_", " ")} to ${formatMuscleName(action.params.meshId)}`;
      case "create_assessment":
        return "Assessment created";
    }
  })();

  const meshIds = (() => {
    switch (action.name) {
      case "update_muscle":
      case "add_knot":
        return [action.params.meshId];
      case "create_assessment":
        return action.params.structuresAffected;
    }
  })();

  return (
    <span
      className={`inline-flex cursor-pointer items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${
        applied
          ? "bg-emerald-500/20 text-emerald-300"
          : "bg-yellow-500/20 text-yellow-300"
      }`}
      onMouseEnter={() => onHighlight?.(meshIds)}
      onMouseLeave={() => onHighlight?.([])}
    >
      {applied ? "OK" : "..."} {label}
    </span>
  );
}
