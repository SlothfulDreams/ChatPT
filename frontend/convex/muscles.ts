import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { muscleCondition } from "./schema";

export const getByBody = query({
  args: { bodyId: v.id("bodies") },
  returns: v.array(
    v.object({
      _id: v.id("muscles"),
      _creationTime: v.number(),
      bodyId: v.id("bodies"),
      meshId: v.string(),
      condition: muscleCondition,
      notes: v.optional(v.string()),
      summary: v.optional(v.string()),
      updatedAt: v.number(),
      pain: v.number(),
      strength: v.number(),
      mobility: v.number(),
      lastStrengthValue: v.optional(v.number()),
      lastStrengthUnit: v.optional(v.string()),
      lastRomDegrees: v.optional(v.number()),
      expectedRomDegrees: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("muscles")
      .withIndex("by_body", (q) => q.eq("bodyId", args.bodyId))
      .collect();
  },
});

export const upsert = mutation({
  args: {
    bodyId: v.id("bodies"),
    meshId: v.string(),
    condition: v.optional(muscleCondition),
    pain: v.optional(v.number()),
    strength: v.optional(v.number()),
    mobility: v.optional(v.number()),
    notes: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  returns: v.id("muscles"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("muscles")
      .withIndex("by_body_mesh", (q) =>
        q.eq("bodyId", args.bodyId).eq("meshId", args.meshId),
      )
      .unique();

    if (existing) {
      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      if (args.condition !== undefined) updates.condition = args.condition;
      if (args.pain !== undefined) updates.pain = args.pain;
      if (args.strength !== undefined) updates.strength = args.strength;
      if (args.mobility !== undefined) updates.mobility = args.mobility;
      if (args.notes !== undefined) updates.notes = args.notes;
      if (args.summary !== undefined) updates.summary = args.summary;

      await ctx.db.patch(existing._id, updates);
      return existing._id;
    }

    return await ctx.db.insert("muscles", {
      bodyId: args.bodyId,
      meshId: args.meshId,
      condition: args.condition ?? "healthy",
      pain: args.pain ?? 0,
      strength: args.strength ?? 1,
      mobility: args.mobility ?? 1,
      notes: args.notes,
      summary: args.summary,
      updatedAt: Date.now(),
    });
  },
});

export const applyWorkoutEffect = mutation({
  args: {
    bodyId: v.id("bodies"),
    meshIds: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const conditionsToRecover = new Set([
      "tight",
      "knotted",
      "strained",
      "inflamed",
      "weak",
      "fatigued",
    ]);

    for (const meshId of args.meshIds) {
      const existing = await ctx.db
        .query("muscles")
        .withIndex("by_body_mesh", (q) =>
          q.eq("bodyId", args.bodyId).eq("meshId", meshId),
        )
        .unique();

      if (!existing) continue;

      const updates: Record<string, unknown> = { updatedAt: Date.now() };
      updates.pain = Math.max(0, existing.pain - 2);
      updates.mobility = Math.min(1, existing.mobility + 0.05);

      if (conditionsToRecover.has(existing.condition)) {
        updates.condition = "recovering";
      }

      await ctx.db.patch(existing._id, updates);
    }

    return null;
  },
});

export const update = mutation({
  args: {
    muscleId: v.id("muscles"),
    condition: v.optional(muscleCondition),
    pain: v.optional(v.number()),
    strength: v.optional(v.number()),
    mobility: v.optional(v.number()),
    notes: v.optional(v.string()),
    summary: v.optional(v.string()),
    lastStrengthValue: v.optional(v.number()),
    lastStrengthUnit: v.optional(v.string()),
    lastRomDegrees: v.optional(v.number()),
    expectedRomDegrees: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { muscleId, ...fields } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };

    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }

    await ctx.db.patch(muscleId, updates);
    return null;
  },
});
