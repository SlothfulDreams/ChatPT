"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { type ChatAction, type ChatMessage, useChat } from "@/hooks/useChat";
import { formatMuscleName, getOtherSide } from "@/lib/muscle-utils";

const markdownComponents: Components = {
  p: ({ children }) => (
    <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white/95">{children}</strong>
  ),
  em: ({ children }) => <em className="text-white/60">{children}</em>,
  h1: ({ children }) => <h1 className="mb-1 text-sm font-bold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-1 text-xs font-bold">{children}</h2>,
  h3: ({ children }) => (
    <h3 className="mb-1 text-xs font-semibold">{children}</h3>
  ),
  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-0.5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-0.5 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li>{children}</li>,
  code: ({ className, children }) => {
    const isBlock = className?.includes("language-");
    if (isBlock) {
      return <code className="text-blue-300/80 text-[11px]">{children}</code>;
    }
    return (
      <code className="rounded bg-white/10 px-1 text-blue-300/80">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-lg bg-white/5 p-2.5 last:mb-0">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-white/20 pl-2 text-white/50 last:mb-0">
      {children}
    </blockquote>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-blue-400 underline hover:text-blue-300"
    >
      {children}
    </a>
  ),
};

interface ChatPanelProps {
  onClose: () => void;
  onHighlightMuscles?: (meshIds: string[]) => void;
  selectedMuscles?: Set<string>;
  onDeselectMuscle?: (meshId: string) => void;
}

export function ChatPanel({
  onClose,
  onHighlightMuscles,
  selectedMuscles,
  onDeselectMuscle,
}: ChatPanelProps) {
  const {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    conversations,
    activeConversationId,
    conversationTitle,
  } = useChat();
  const [input, setInput] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build display entries from selectedMuscles
  const selectionEntries = (() => {
    if (!selectedMuscles || selectedMuscles.size === 0) return [];
    const seen = new Set<string>();
    const entries: { label: string; meshIds: string[] }[] = [];
    for (const meshId of selectedMuscles) {
      if (seen.has(meshId)) continue;
      const other = getOtherSide(meshId);
      const hasBoth = selectedMuscles.has(other) && other !== meshId;
      const name = formatMuscleName(meshId);
      if (hasBoth) {
        seen.add(meshId);
        seen.add(other);
        entries.push({ label: `${name} (Both)`, meshIds: [meshId, other] });
      } else {
        seen.add(meshId);
        const side = meshId.endsWith("r")
          ? "R"
          : meshId.endsWith("l")
            ? "L"
            : "";
        entries.push({
          label: side ? `${name} (${side})` : name,
          meshIds: [meshId],
        });
      }
    }
    return entries;
  })();

  // Auto-scroll on new messages
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [messages]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!isDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isDropdownOpen]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    setInput("");
    const meshIds = selectedMuscles ? Array.from(selectedMuscles) : undefined;
    sendMessage(text, meshIds);
  }, [input, isStreaming, sendMessage, selectedMuscles]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleStartRename = useCallback(() => {
    setTitleDraft(conversationTitle ?? "");
    setIsEditingTitle(true);
  }, [conversationTitle]);

  const handleFinishRename = useCallback(() => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== conversationTitle) {
      renameConversation(trimmed);
    }
    setIsEditingTitle(false);
  }, [titleDraft, conversationTitle, renameConversation]);

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleFinishRename();
      } else if (e.key === "Escape") {
        setIsEditingTitle(false);
      }
    },
    [handleFinishRename],
  );

  const handleNewConversation = useCallback(() => {
    newConversation();
  }, [newConversation]);

  const handleDeleteConversation = useCallback(
    (e: React.MouseEvent, conversationId: string) => {
      e.stopPropagation();
      deleteConversation(
        conversationId as Parameters<typeof deleteConversation>[0],
      );
    },
    [deleteConversation],
  );

  return (
    <div className="pointer-events-auto mosaic-panel flex min-h-0 w-96 flex-1 flex-col text-white">
      {/* Header */}
      <div
        className="relative flex shrink-0 items-center gap-1.5 border-b border-white/10 px-3 py-2.5"
        style={{ zIndex: 10 }}
      >
        {/* New conversation button */}
        <button
          type="button"
          onClick={handleNewConversation}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          title="New conversation"
        >
          +
        </button>

        {/* Title dropdown */}
        {isEditingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={handleFinishRename}
            onKeyDown={handleTitleKeyDown}
            className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-xs font-semibold text-white outline-none focus:ring-1 focus:ring-white/20"
          />
        ) : (
          <div className="relative min-w-0 flex-1" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen((v) => !v)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setIsDropdownOpen(false);
                handleStartRename();
              }}
              className="flex w-full items-center gap-1.5 text-xs font-semibold text-white hover:text-white/70"
              title="Double-click to rename"
            >
              <span className="truncate">
                {conversationTitle ?? "New Conversation"}
              </span>
              <span className="shrink-0 text-[9px] text-white/30">
                {isDropdownOpen ? "▲" : "▼"}
              </span>
            </button>

            {isDropdownOpen &&
              (() => {
                const pastConversations = conversations.filter(
                  (c) => c._id !== activeConversationId,
                );
                return (
                  <div className="mosaic-panel absolute left-0 top-full z-50 mt-1.5 w-72 overflow-hidden">
                    <div className="max-h-64 overflow-y-auto">
                      {pastConversations.length === 0 && (
                        <p className="px-4 py-3 text-xs text-white/30">
                          No past conversations
                        </p>
                      )}
                      {pastConversations.map((conv) => (
                        <div
                          key={conv._id}
                          className="group flex items-center border-b border-white/[0.04] text-white/60 transition-colors last:border-b-0 hover:bg-white/5 hover:text-white"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              switchConversation(conv._id);
                              setIsDropdownOpen(false);
                            }}
                            className="flex min-w-0 flex-1 flex-col gap-0.5 px-4 py-2.5 text-left"
                          >
                            <span className="truncate text-xs font-medium">
                              {conv.title ?? "Untitled"}
                            </span>
                            <span className="text-[10px] text-white/25">
                              {new Date(conv.updatedAt).toLocaleDateString(
                                undefined,
                                { month: "short", day: "numeric" },
                              )}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) =>
                              handleDeleteConversation(e, conv._id)
                            }
                            className="mr-2 flex h-6 w-6 shrink-0 items-center justify-center rounded text-white/0 transition-all hover:bg-white/10 hover:text-red-400 group-hover:text-white/20"
                            title="Delete conversation"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
          </div>
        )}

        {/* Close panel button */}
        <button
          type="button"
          onClick={onClose}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          ×
        </button>
      </div>

      {/* Focus context bar */}
      {selectionEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-4 py-2">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">
            Focus
          </span>
          {selectionEntries.map((entry) => (
            <span
              key={entry.meshIds.join(",")}
              className="inline-flex items-center gap-1 rounded-full bg-blue-500/20 px-2 py-0.5 text-[10px] text-blue-300"
            >
              {entry.label}
              {onDeselectMuscle && (
                <button
                  type="button"
                  onClick={() =>
                    entry.meshIds.forEach((id) => onDeselectMuscle(id))
                  }
                  className="ml-0.5 text-blue-300/60 hover:text-blue-300"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            {/* Gradient icon */}
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-teal-500/15">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="url(#emptyGrad)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <defs>
                  <linearGradient
                    id="emptyGrad"
                    x1="0"
                    y1="0"
                    x2="24"
                    y2="24"
                    gradientUnits="userSpaceOnUse"
                  >
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#14b8a6" />
                  </linearGradient>
                </defs>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-white/50">How can I help?</p>
            <p className="max-w-[220px] text-center text-xs text-white/30">
              Describe pain, tightness, or an injury and I'll assess it.
            </p>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              {[
                "My shoulder hurts",
                "Assess my lower back",
                "I pulled a hamstring",
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    const meshIds = selectedMuscles
                      ? Array.from(selectedMuscles)
                      : undefined;
                    sendMessage(suggestion, meshIds);
                  }}
                  className="mosaic-chip cursor-pointer rounded-full px-2.5 py-1 text-[11px]"
                >
                  {suggestion}
                </button>
              ))}
            </div>
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
            <>
              {selectionEntries.length > 0 && !input.trim() && (
                <button
                  type="button"
                  onClick={() => {
                    const muscleNames = selectionEntries
                      .map((e) => e.label)
                      .join(", ");
                    const prompt = `Please assess the following muscles I've selected: ${muscleNames}. What's your initial evaluation? Ask me any relevant questions about symptoms.`;
                    const meshIds = Array.from(selectedMuscles ?? []);
                    sendMessage(prompt, meshIds);
                  }}
                  className="shrink-0 rounded-lg bg-blue-500/20 px-3 py-2 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/30"
                >
                  Diagnose
                </button>
              )}
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className="mosaic-btn-primary shrink-0 px-3 py-2 text-xs font-medium"
              >
                Send
              </button>
            </>
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
        {isUser ? (
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
            {message.content}
          </Markdown>
        )}

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
