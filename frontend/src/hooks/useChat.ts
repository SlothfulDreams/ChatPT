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

export interface AddKnotAction {
  name: "add_knot";
  params: {
    meshId: string;
    severity: number;
    type: "trigger_point" | "adhesion" | "spasm";
  };
}

export interface CreateAssessmentAction {
  name: "create_assessment";
  params: {
    summary: string;
    structuresAffected: string[];
  };
}

export type ChatAction =
  | UpdateMuscleAction
  | AddKnotAction
  | CreateAssessmentAction;

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  actions?: ChatAction[];
  actionsApplied?: boolean;
  isStreaming?: boolean;
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

export function useChat() {
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
  const storedMessages = useQuery(
    api.chat.getMessages,
    activeConversation ? { conversationId: activeConversation._id } : "skip",
  );

  // Mutations
  const createConversation = useMutation(api.chat.createConversation);
  const addMessage = useMutation(api.chat.addMessage);
  const markActionsApplied = useMutation(api.chat.markActionsApplied);
  const upsertMuscle = useMutation(api.muscles.upsert);
  const addKnot = useMutation(api.knots.add);
  const setConversationTitle = useMutation(api.chat.setConversationTitle);

  // Local streaming state
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Build unified messages list: stored + streaming
  const messages: ChatMessage[] = useMemo(() => {
    const stored = (storedMessages ?? []).map((m) => ({
      id: m._id,
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
      });
    }

    return stored;
  }, [storedMessages, isStreaming, streamingContent]);

  // Execute actions returned by the LLM
  const executeActions = useCallback(
    async (actions: ChatAction[], messageId: Id<"messages">) => {
      if (!body) return;

      for (const action of actions) {
        switch (action.name) {
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
          case "add_knot": {
            const p = action.params;
            const muscle = muscles?.find((m) => m.meshId === p.meshId);
            if (muscle) {
              await addKnot({
                muscleId: muscle._id,
                positionX: 0,
                positionY: 0,
                positionZ: 0,
                severity: p.severity,
                type: p.type,
              });
            }
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
    [body, muscles, upsertMuscle, addKnot, markActionsApplied],
  );

  // Send a message
  const sendMessage = useCallback(
    async (content: string) => {
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

      const conversationHistory = (storedMessages ?? []).map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const availableMeshIds = (muscles ?? []).map((m) => m.meshId);

      // Start streaming
      setIsStreaming(true);
      setStreamingContent("");
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
            }),
            signal: abort.signal,
          },
        );

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = "";
        let actions: ChatAction[] = [];

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split("\n");

            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              try {
                const data = JSON.parse(line.slice(6));
                if (data.type === "text_delta") {
                  fullContent += data.text;
                  setStreamingContent(fullContent);
                } else if (data.type === "done") {
                  fullContent = data.content;
                  actions = data.actions ?? [];
                }
              } catch {
                // Skip malformed SSE lines
              }
            }
          }
        }

        // Store assistant message in Convex
        const msgId = await addMessage({
          conversationId,
          role: "assistant",
          content: fullContent,
          actions: actions.length > 0 ? actions : undefined,
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
        abortRef.current = null;
      }
    },
    [
      user,
      body,
      muscles,
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

  return {
    messages,
    isStreaming,
    sendMessage,
    stopStreaming,
    newConversation,
    conversationTitle: activeConversation?.title ?? null,
  };
}
