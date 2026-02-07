"use client";

import { useMutation, useQuery } from "convex/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

// ============================================
// Types
// ============================================

export interface UpdateMuscleAction {
  name: "update_muscle";
  params: {
    meshId: string;
    condition?: string;
    pain?: number;
    strength?: number;
    mobility?: number;
    summary?: string;
  };
}

export interface CreateAssessmentAction {
  name: "create_assessment";
  params: {
    summary: string;
    structuresAffected: string[];
  };
}

export interface SelectMusclesAction {
  name: "select_muscles";
  params: {
    meshIds: string[];
    reason: string;
  };
}

export type ChatAction =
  | UpdateMuscleAction
  | CreateAssessmentAction
  | SelectMusclesAction;

export interface AgentSubstep {
  tool: string;
  label: string;
  status: "running" | "complete";
}

export interface AgentStep {
  tool: string;
  label: string;
  status: "running" | "complete";
  substeps?: AgentSubstep[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  actionsApplied?: boolean;
  isStreaming?: boolean;
  steps?: AgentStep[];
}

interface MuscleContext {
  meshId: string;
  condition: string;
  pain: number;
  strength: number;
  mobility: number;
  notes?: string;
  summary?: string;
}

// ============================================
// Hook
// ============================================

export function useChat(
  allMeshIds?: string[],
  activeGroups?: Set<string>,
  onSelectMuscles?: (meshIds: string[]) => void,
) {
  const user = useQuery(api.users.current);
  const body = useQuery(
    api.body.getByUser,
    user ? { userId: user._id } : "skip",
  );
  const muscles = useQuery(
    api.muscles.getByBody,
    body ? { bodyId: body._id } : "skip",
  );

  // Convex conversation state
  const activeConversation = useQuery(
    api.chat.getActiveConversation,
    user ? { userId: user._id } : "skip",
  );
  const allConversations = useQuery(
    api.chat.getConversations,
    user ? { userId: user._id } : "skip",
  );
  const storedMessages = useQuery(
    api.chat.getMessages,
    activeConversation ? { conversationId: activeConversation._id } : "skip",
  );

  // Mutations
  const createConversation = useMutation(api.chat.createConversation);
  const addMessage = useMutation(api.chat.addMessage);
  const markActionsApplied = useMutation(api.chat.markActionsApplied);
  const upsertMuscle = useMutation(api.muscles.upsert);
  const setConversationTitle = useMutation(api.chat.setConversationTitle);
  const switchConversationMut = useMutation(api.chat.switchConversation);
  const deleteConversationMut = useMutation(api.chat.deleteConversation);

  // Local streaming state
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingSteps, setStreamingSteps] = useState<AgentStep[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build unified messages list: stored + streaming
  const messages: ChatMessage[] = useMemo(() => {
    const stored: ChatMessage[] = (storedMessages ?? []).map((m) => ({
      id: m._id as string,
      role: m.role as "user" | "assistant",
      content: m.content,
      actions: m.actions as ChatAction[] | undefined,
      actionsApplied: m.actionsApplied ?? undefined,
    }));

    if (isStreaming) {
      stored.push({
        id: "streaming",
        role: "assistant",
        content: streamingContent,
        isStreaming: true,
        steps: streamingSteps,
      });
    }

    return stored;
  }, [storedMessages, isStreaming, streamingContent, streamingSteps]);

  // Execute actions returned by the LLM
  const executeActions = useCallback(
    async (actions: ChatAction[], messageId: Id<"messages">) => {
      if (!body) return;

      // Process select_muscles first so the model highlights before updates
      const sorted = [...actions].sort((a, b) => {
        if (a.name === "select_muscles" && b.name !== "select_muscles")
          return -1;
        if (a.name !== "select_muscles" && b.name === "select_muscles")
          return 1;
        return 0;
      });

      for (const action of sorted) {
        switch (action.name) {
          case "select_muscles": {
            onSelectMuscles?.(action.params.meshIds);
            break;
          }
          case "update_muscle": {
            const p = action.params;
            await upsertMuscle({
              bodyId: body._id,
              meshId: p.meshId,
              condition: p.condition as
                | "healthy"
                | "tight"
                | "knotted"
                | "strained"
                | "torn"
                | "recovering"
                | "inflamed"
                | "weak"
                | "fatigued"
                | undefined,
              pain: p.pain,
              strength: p.strength,
              mobility: p.mobility,
              summary: p.summary,
            });
            break;
          }
          case "create_assessment": {
            // Assessment creation can be added later -- the data is persisted
            // on the message itself for now
            break;
          }
        }
      }

      await markActionsApplied({ messageId });
    },
    [body, muscles, upsertMuscle, markActionsApplied, onSelectMuscles],
  );

  // Send a message
  const sendMessage = useCallback(
    async (content: string, selectedMeshIds?: string[]) => {
      if (!user || !body || isStreaming) return;

      // Ensure conversation exists
      let conversationId = activeConversation?._id;
      if (!conversationId) {
        conversationId = await createConversation({ userId: user._id });
      }

      // Store user message
      await addMessage({
        conversationId,
        role: "user",
        content,
      });

      // Auto-title on first message
      if (!activeConversation?.title && (storedMessages?.length ?? 0) === 0) {
        const title =
          content.length > 50 ? `${content.slice(0, 47)}...` : content;
        await setConversationTitle({ conversationId, title });
      }

      // Build context for FastAPI
      const muscleStates: MuscleContext[] = (muscles ?? []).map((m) => ({
        meshId: m.meshId,
        condition: m.condition,
        pain: m.pain,
        strength: m.strength,
        mobility: m.mobility,
        notes: m.notes ?? undefined,
        summary: m.summary ?? undefined,
      }));

      // Build conversation history, expanding toolThread for agentic state
      const conversationHistory: {
        role: string;
        content: string;
        tool_calls?: unknown[];
        tool_call_id?: string;
      }[] = [];
      for (const m of storedMessages ?? []) {
        conversationHistory.push({ role: m.role, content: m.content });
        // Expand stored tool thread (intermediate assistant+tool messages from agentic loop)
        if (m.toolThread && Array.isArray(m.toolThread)) {
          for (const threadMsg of m.toolThread) {
            conversationHistory.push(
              threadMsg as {
                role: string;
                content: string;
                tool_calls?: unknown[];
                tool_call_id?: string;
              },
            );
          }
        }
      }

      const availableMeshIds =
        allMeshIds && allMeshIds.length > 0
          ? allMeshIds
          : (muscles ?? []).map((m) => m.meshId);

      // Start streaming
      setIsStreaming(true);
      setStreamingContent("");
      setStreamingSteps([]);
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/chat`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: content,
              conversationId,
              conversationHistory,
              muscleStates,
              body: body
                ? {
                    sex: body.sex,
                    weightKg: body.weightKg,
                    heightCm: body.heightCm,
                    birthDate: body.birthDate,
                  }
                : null,
              availableMeshIds,
              selectedMeshIds: selectedMeshIds ?? [],
              activeGroups: activeGroups ? Array.from(activeGroups) : [],
            }),
            signal: abort.signal,
          },
        );

        if (!response.ok) {
          throw new Error(`Backend returned ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let actions: ChatAction[] = [];
        let toolThread: unknown[] | undefined;

        if (reader) {
          let sseBuffer = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            sseBuffer += decoder.decode(value, { stream: true });

            // Extract only complete lines (terminated by \n)
            const lastNewline = sseBuffer.lastIndexOf("\n");
            if (lastNewline === -1) continue;

            const complete = sseBuffer.slice(0, lastNewline);
            sseBuffer = sseBuffer.slice(lastNewline + 1);

            const lines = complete.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text_delta") {
                  fullContent += data.text;
                  setStreamingContent(fullContent);
                } else if (data.type === "step") {
                  setStreamingSteps((prev) => [
                    ...prev,
                    {
                      tool: data.tool,
                      label: data.label,
                      status: "running" as const,
                    },
                  ]);
                } else if (data.type === "step_complete") {
                  setStreamingSteps((prev) =>
                    prev.map((s) =>
                      s.tool === data.tool
                        ? {
                            ...s,
                            label: data.label,
                            status: "complete" as const,
                          }
                        : s,
                    ),
                  );
                } else if (data.type === "substep") {
                  // Add substep under the currently running "research" step
                  setStreamingSteps((prev) =>
                    prev.map((s) =>
                      s.tool === "research"
                        ? {
                            ...s,
                            substeps: [
                              ...(s.substeps ?? []),
                              {
                                tool: data.tool,
                                label: data.label,
                                status: "running" as const,
                              },
                            ],
                          }
                        : s,
                    ),
                  );
                } else if (data.type === "substep_complete") {
                  setStreamingSteps((prev) =>
                    prev.map((s) =>
                      s.tool === "research"
                        ? {
                            ...s,
                            substeps: (s.substeps ?? []).map((sub) =>
                              sub.tool === data.tool
                                ? {
                                    ...sub,
                                    label: data.label,
                                    status: "complete" as const,
                                  }
                                : sub,
                            ),
                          }
                        : s,
                    ),
                  );
                } else if (data.type === "done") {
                  fullContent = data.content;
                  actions = data.actions ?? [];
                  toolThread = data.toolThread;
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          }
          // Flush any remaining buffer after stream closes
          if (sseBuffer.startsWith("data: ")) {
            try {
              const data = JSON.parse(sseBuffer.slice(6));
              if (data.type === "done") {
                fullContent = data.content;
                actions = data.actions ?? [];
                toolThread = data.toolThread;
              }
            } catch {
              /* ignore */
            }
          }
        }

        // Store assistant message in Convex
        const msgId = await addMessage({
          conversationId,
          role: "assistant",
          content: fullContent,
          actions: actions.length > 0 ? actions : undefined,
          toolThread:
            toolThread && toolThread.length > 0 ? toolThread : undefined,
        });

        // Execute any actions (update muscles, add knots, etc.)
        if (actions.length > 0) {
          await executeActions(actions, msgId);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Chat error:", err);
          await addMessage({
            conversationId,
            role: "assistant",
            content:
              "Something went wrong reaching the backend. Check that the API server is running.",
          });
        }
      } finally {
        setIsStreaming(false);
        setStreamingContent("");
        setStreamingSteps([]);
        abortRef.current = null;
      }
    },
    [
      user,
      body,
      muscles,
      allMeshIds,
      activeGroups,
      isStreaming,
      activeConversation,
      storedMessages,
      createConversation,
      addMessage,
      setConversationTitle,
      executeActions,
    ],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const newConversation = useCallback(async () => {
    if (!user) return;
    await createConversation({ userId: user._id });
  }, [user, createConversation]);

  const switchConversation = useCallback(
    async (conversationId: Id<"conversations">) => {
      if (!user) return;
      await switchConversationMut({ userId: user._id, conversationId });
    },
    [user, switchConversationMut],
  );

  const renameConversation = useCallback(
    async (title: string) => {
      if (!activeConversation) return;
      await setConversationTitle({
        conversationId: activeConversation._id,
        title,
      });
    },
    [activeConversation, setConversationTitle],
  );

  const deleteConversation = useCallback(
    async (conversationId: Id<"conversations">) => {
      if (!user) return;
      await deleteConversationMut({ userId: user._id, conversationId });
    },
    [user, deleteConversationMut],
  );

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    newConversation,
    switchConversation,
    renameConversation,
    deleteConversation,
    conversations: allConversations ?? [],
    activeConversationId: activeConversation?._id ?? null,
    conversationTitle: activeConversation?.title ?? null,
  };
}
