import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { knotType } from "./schema";

export const getByMuscle = query({
  args: { muscleId: v.id("muscles") },
  returns: v.array(
    v.object({
      _id: v.id("knots"),
      _creationTime: v.number(),
      muscleId: v.id("muscles"),
      positionX: v.number(),
      positionY: v.number(),
      positionZ: v.number(),
      severity: v.number(),
      type: knotType,
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("knots")
      .withIndex("by_muscle", (q) => q.eq("muscleId", args.muscleId))
      .collect();
  },
});

export const getByBody = query({
  args: { bodyId: v.id("bodies") },
  returns: v.array(
    v.object({
      _id: v.id("knots"),
      _creationTime: v.number(),
      muscleId: v.id("muscles"),
      positionX: v.number(),
      positionY: v.number(),
      positionZ: v.number(),
      severity: v.number(),
      type: knotType,
    }),
  ),
  handler: async (ctx, args) => {
    // Get all muscles for this body, then all knots for those muscles
    const muscles = await ctx.db
      .query("muscles")
      .withIndex("by_body", (q) => q.eq("bodyId", args.bodyId))
      .collect();

    const knots = await Promise.all(
      muscles.map((m) =>
        ctx.db
          .query("knots")
          .withIndex("by_muscle", (q) => q.eq("muscleId", m._id))
          .collect(),
      ),
    );

    return knots.flat();
  },
});

export const add = mutation({
  args: {
    muscleId: v.id("muscles"),
    positionX: v.number(),
    positionY: v.number(),
    positionZ: v.number(),
    severity: v.optional(v.number()),
    type: v.optional(knotType),
  },
  returns: v.id("knots"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("knots", {
      muscleId: args.muscleId,
      positionX: args.positionX,
      positionY: args.positionY,
      positionZ: args.positionZ,
      severity: args.severity ?? 0.5,
      type: args.type ?? "trigger_point",
    });
  },
});

export const remove = mutation({
  args: { knotId: v.id("knots") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.knotId);
    return null;
  },
});
