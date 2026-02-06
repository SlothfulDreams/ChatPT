import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// ============================================
// Queries
// ============================================

export const getPlans = query({
  args: { userId: v.id("users") },
  returns: v.array(
    v.object({
      _id: v.id("workoutPlans"),
      _creationTime: v.number(),
      userId: v.id("users"),
      title: v.string(),
      notes: v.optional(v.string()),
      isActive: v.boolean(),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workoutPlans")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const getExercises = query({
  args: { planId: v.id("workoutPlans") },
  returns: v.array(
    v.object({
      _id: v.id("workoutExercises"),
      _creationTime: v.number(),
      planId: v.id("workoutPlans"),
      name: v.string(),
      sets: v.optional(v.number()),
      reps: v.optional(v.number()),
      durationSecs: v.optional(v.number()),
      weight: v.optional(v.number()),
      weightUnit: v.optional(v.string()),
      notes: v.optional(v.string()),
      targetMeshIds: v.array(v.string()),
      order: v.number(),
      completed: v.boolean(),
      completedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("workoutExercises")
      .withIndex("by_plan_order", (q) => q.eq("planId", args.planId))
      .collect();
  },
});

// ============================================
// Plan Mutations
// ============================================

export const createPlan = mutation({
  args: {
    userId: v.id("users"),
    title: v.string(),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
  },
  returns: v.id("workoutPlans"),
  handler: async (ctx, args) => {
    if (args.isActive) {
      const existing = await ctx.db
        .query("workoutPlans")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", args.userId).eq("isActive", true),
        )
        .collect();
      for (const plan of existing) {
        await ctx.db.patch(plan._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
    }
    return await ctx.db.insert("workoutPlans", {
      userId: args.userId,
      title: args.title,
      notes: args.notes,
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
  },
});

export const updatePlan = mutation({
  args: {
    planId: v.id("workoutPlans"),
    title: v.optional(v.string()),
    notes: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { planId, ...fields } = args;
    const plan = await ctx.db.get(planId);
    if (!plan) return null;

    // If activating this plan, deactivate others
    if (fields.isActive === true && !plan.isActive) {
      const existing = await ctx.db
        .query("workoutPlans")
        .withIndex("by_user_active", (q) =>
          q.eq("userId", plan.userId).eq("isActive", true),
        )
        .collect();
      for (const other of existing) {
        await ctx.db.patch(other._id, {
          isActive: false,
          updatedAt: Date.now(),
        });
      }
    }

    const updates: Record<string, unknown> = { updatedAt: Date.now() };
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(planId, updates);
    return null;
  },
});

export const deletePlan = mutation({
  args: { planId: v.id("workoutPlans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const exercises = await ctx.db
      .query("workoutExercises")
      .withIndex("by_plan", (q) => q.eq("planId", args.planId))
      .collect();
    for (const ex of exercises) {
      await ctx.db.delete(ex._id);
    }
    await ctx.db.delete(args.planId);
    return null;
  },
});

// ============================================
// Exercise Mutations
// ============================================

export const addExercise = mutation({
  args: {
    planId: v.id("workoutPlans"),
    name: v.string(),
    sets: v.optional(v.number()),
    reps: v.optional(v.number()),
    durationSecs: v.optional(v.number()),
    weight: v.optional(v.number()),
    weightUnit: v.optional(v.string()),
    notes: v.optional(v.string()),
    targetMeshIds: v.array(v.string()),
  },
  returns: v.id("workoutExercises"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("workoutExercises")
      .withIndex("by_plan_order", (q) => q.eq("planId", args.planId))
      .collect();
    const maxOrder = existing.reduce((max, e) => Math.max(max, e.order), -1);

    await ctx.db.patch(args.planId, { updatedAt: Date.now() });

    return await ctx.db.insert("workoutExercises", {
      planId: args.planId,
      name: args.name,
      sets: args.sets,
      reps: args.reps,
      durationSecs: args.durationSecs,
      weight: args.weight,
      weightUnit: args.weightUnit,
      notes: args.notes,
      targetMeshIds: args.targetMeshIds,
      order: maxOrder + 1,
      completed: false,
    });
  },
});

export const updateExercise = mutation({
  args: {
    exerciseId: v.id("workoutExercises"),
    name: v.optional(v.string()),
    sets: v.optional(v.number()),
    reps: v.optional(v.number()),
    durationSecs: v.optional(v.number()),
    weight: v.optional(v.number()),
    weightUnit: v.optional(v.string()),
    notes: v.optional(v.string()),
    targetMeshIds: v.optional(v.array(v.string())),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { exerciseId, ...fields } = args;
    const exercise = await ctx.db.get(exerciseId);
    if (!exercise) return null;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(fields)) {
      if (value !== undefined) updates[key] = value;
    }
    await ctx.db.patch(exerciseId, updates);
    await ctx.db.patch(exercise.planId, { updatedAt: Date.now() });
    return null;
  },
});

export const deleteExercise = mutation({
  args: { exerciseId: v.id("workoutExercises") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const exercise = await ctx.db.get(args.exerciseId);
    if (!exercise) return null;
    await ctx.db.delete(args.exerciseId);
    await ctx.db.patch(exercise.planId, { updatedAt: Date.now() });
    return null;
  },
});

export const toggleExerciseComplete = mutation({
  args: { exerciseId: v.id("workoutExercises") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ex = await ctx.db.get(args.exerciseId);
    if (!ex) return null;
    await ctx.db.patch(args.exerciseId, {
      completed: !ex.completed,
      completedAt: !ex.completed ? Date.now() : undefined,
    });
    await ctx.db.patch(ex.planId, { updatedAt: Date.now() });
    return null;
  },
});
