import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { bodySex } from "./schema";

export const getByUser = query({
  args: { userId: v.id("users") },
  returns: v.union(
    v.object({
      _id: v.id("bodies"),
      _creationTime: v.number(),
      userId: v.id("users"),
      sex: bodySex,
      modelType: v.string(),
      weightKg: v.optional(v.number()),
      heightCm: v.optional(v.number()),
      birthDate: v.optional(v.number()),
      equipment: v.optional(v.array(v.string())),
      fitnessGoals: v.optional(v.string()),
      defaultWorkoutDurationMinutes: v.optional(v.number()),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("bodies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();
  },
});

export const ensure = mutation({
  args: {
    userId: v.id("users"),
    sex: v.optional(bodySex),
  },
  returns: v.id("bodies"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("bodies")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .unique();

    if (existing) return existing._id;

    return await ctx.db.insert("bodies", {
      userId: args.userId,
      sex: args.sex ?? "male",
      modelType: "anatomical_body",
      updatedAt: Date.now(),
    });
  },
});

export const update = mutation({
  args: {
    bodyId: v.id("bodies"),
    sex: v.optional(bodySex),
    weightKg: v.optional(v.number()),
    heightCm: v.optional(v.number()),
    birthDate: v.optional(v.number()),
    equipment: v.optional(v.array(v.string())),
    fitnessGoals: v.optional(v.string()),
    defaultWorkoutDurationMinutes: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { bodyId, ...fields } = args;
    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(bodyId, updates);
    return null;
  },
});
