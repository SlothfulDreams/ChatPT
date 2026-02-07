import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { messageRole } from "./schema";

// ---- Queries ----

export const getActiveConversation = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.optional(v.string()),
      isActive: v.boolean(),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true),
      )
      .unique();
  },
});

export const getMessages = query({
  args: { conversationId: v.id("conversations") },
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      conversationId: v.id("conversations"),
      role: messageRole,
      content: v.string(),
      actions: v.optional(v.array(v.any())),
      actionsApplied: v.optional(v.boolean()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
  },
});

export const getConversations = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("conversations"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.optional(v.string()),
      isActive: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("conversations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .collect();
  },
});

// ---- Mutations ----

export const createConversation = mutation({
  args: { userId: v.id("users") },
  returns: v.id("conversations"),
  handler: async (ctx, args) => {
    // Deactivate existing active conversations
    const existing = await ctx.db
      .query("conversations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true),
      )
      .collect();
    for (const conv of existing) {
      await ctx.db.patch(conv._id, { isActive: false });
    }
    return await ctx.db.insert("conversations", {
      userId: args.userId,
      title: "New Conversation",
      isActive: true,
      updatedAt: Date.now(),
    });
  },
});

export const addMessage = mutation({
  args: {
    conversationId: v.id("conversations"),
    role: messageRole,
    content: v.string(),
    actions: v.optional(v.array(v.any())),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { updatedAt: Date.now() });
    return await ctx.db.insert("messages", {
      conversationId: args.conversationId,
      role: args.role,
      content: args.content,
      actions: args.actions,
      actionsApplied: args.actions ? false : undefined,
    });
  },
});

export const markActionsApplied = mutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.messageId, { actionsApplied: true });
    return null;
  },
});

export const setConversationTitle = mutation({
  args: { conversationId: v.id("conversations"), title: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.conversationId, { title: args.title });
    return null;
  },
});

export const switchConversation = mutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Deactivate all active conversations for this user
    const active = await ctx.db
      .query("conversations")
      .withIndex("by_user_active", (q) =>
        q.eq("userId", args.userId).eq("isActive", true),
      )
      .collect();
    for (const conv of active) {
      await ctx.db.patch(conv._id, { isActive: false });
    }
    // Activate the target conversation
    await ctx.db.patch(args.conversationId, { isActive: true });
    return null;
  },
});

export const deleteConversation = mutation({
  args: { userId: v.id("users"), conversationId: v.id("conversations") },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Delete all messages in the conversation
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_conversation", (q) =>
        q.eq("conversationId", args.conversationId),
      )
      .collect();
    for (const msg of messages) {
      await ctx.db.delete(msg._id);
    }
    // Check if this was the active conversation
    const conv = await ctx.db.get(args.conversationId);
    const wasActive = conv?.isActive;
    // Delete the conversation
    await ctx.db.delete(args.conversationId);
    // If it was active, activate the most recent remaining conversation
    if (wasActive) {
      const remaining = await ctx.db
        .query("conversations")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .order("desc")
        .first();
      if (remaining) {
        await ctx.db.patch(remaining._id, { isActive: true });
      } else {
        await ctx.db.insert("conversations", {
          userId: args.userId,
          title: "New Conversation",
          isActive: true,
          updatedAt: Date.now(),
        });
      }
    }
    return null;
  },
});
