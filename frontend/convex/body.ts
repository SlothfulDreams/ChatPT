import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
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
