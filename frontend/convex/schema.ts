import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

// ============================================
// Enum Validators
// ============================================

export const bodySex = v.union(v.literal("male"), v.literal("female"));

export const muscleCondition = v.union(
  v.literal("healthy"),
  v.literal("tight"),
  v.literal("knotted"),
  v.literal("strained"),
  v.literal("torn"),
  v.literal("recovering"),
  v.literal("inflamed"),
  v.literal("weak"),
  v.literal("fatigued"),
);

export const tendonCondition = v.union(
  v.literal("healthy"),
  v.literal("inflamed"),
  v.literal("strained"),
  v.literal("torn"),
  v.literal("degenerated"),
  v.literal("recovering"),
);

export const boneCondition = v.union(
  v.literal("healthy"),
  v.literal("fractured"),
  v.literal("stress_fractured"),
  v.literal("bruised"),
  v.literal("healing"),
);

export const historyEventType = v.union(
  v.literal("pain_reported"),
  v.literal("condition_changed"),
  v.literal("treatment_applied"),
  v.literal("exercise_completed"),
  v.literal("assessment_completed"),
  v.literal("note_added"),
  v.literal("severity_updated"),
);

export const assessmentType = v.union(
  v.literal("pain_report"),
  v.literal("strength_test"),
  v.literal("rom_measurement"),
  v.literal("observation"),
  v.literal("ai_inference"),
  v.literal("palpation"),
  v.literal("functional_test"),
);

export const assessmentSource = v.union(
  v.literal("user"),
  v.literal("clinician"),
  v.literal("ai_agent"),
  v.literal("device"),
);

export const messageRole = v.union(
  v.literal("user"),
  v.literal("assistant"),
  v.literal("tool"),
);

// ============================================
// Schema
// ============================================

export default defineSchema({
  // ---- Users (synced from Clerk) ----
  users: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    image: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_email", ["email"]),

  // ---- Body Model ----
  bodies: defineTable({
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
  }).index("by_user", ["userId"]),

  // ---- Muscles ----
  muscles: defineTable({
    bodyId: v.id("bodies"),
    meshId: v.string(),
    condition: muscleCondition,
    notes: v.optional(v.string()),
    summary: v.optional(v.string()),
    updatedAt: v.number(),
    // Computed values derived from assessments
    pain: v.number(), // 0-10
    strength: v.number(), // 0-1 ratio
    mobility: v.number(), // 0-1 ratio
    // Raw values that produced the ratios
    lastStrengthValue: v.optional(v.number()),
    lastStrengthUnit: v.optional(v.string()),
    lastRomDegrees: v.optional(v.number()),
    expectedRomDegrees: v.optional(v.number()),
  })
    .index("by_body", ["bodyId"])
    .index("by_body_mesh", ["bodyId", "meshId"]),

  // ---- Tendons ----
  tendons: defineTable({
    bodyId: v.id("bodies"),
    meshId: v.string(),
    condition: tendonCondition,
    severity: v.number(),
    painLevel: v.number(),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_body", ["bodyId"])
    .index("by_body_mesh", ["bodyId", "meshId"]),

  // ---- Bones ----
  bones: defineTable({
    bodyId: v.id("bodies"),
    meshId: v.string(),
    condition: boneCondition,
    severity: v.number(),
    painLevel: v.number(),
    notes: v.optional(v.string()),
    updatedAt: v.number(),
    updatedBy: v.string(),
  })
    .index("by_body", ["bodyId"])
    .index("by_body_mesh", ["bodyId", "meshId"]),

  // ---- History: Muscles ----
  muscleHistory: defineTable({
    muscleId: v.id("muscles"),
    eventType: historyEventType,
    condition: v.optional(muscleCondition),
    severity: v.optional(v.number()),
    painLevel: v.optional(v.number()),
    source: v.string(),
    notes: v.optional(v.string()),
    metadata: v.optional(v.any()),
  }).index("by_muscle", ["muscleId"]),

  // ---- History: Tendons ----
  tendonHistory: defineTable({
    tendonId: v.id("tendons"),
    condition: tendonCondition,
    severity: v.number(),
    painLevel: v.number(),
    source: v.string(),
    notes: v.optional(v.string()),
  }).index("by_tendon", ["tendonId"]),

  // ---- History: Bones ----
  boneHistory: defineTable({
    boneId: v.id("bones"),
    condition: boneCondition,
    severity: v.number(),
    painLevel: v.number(),
    source: v.string(),
    notes: v.optional(v.string()),
  }).index("by_bone", ["boneId"]),

  // ---- Assessments ----
  assessments: defineTable({
    bodyId: v.id("bodies"),
    summary: v.optional(v.string()),
    rawConversation: v.optional(v.any()),
    structuresAffected: v.array(v.string()),
  }).index("by_body", ["bodyId"]),

  // ---- Chat Conversations ----
  conversations: defineTable({
    userId: v.id("users"),
    title: v.optional(v.string()),
    isActive: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"]),

  // ---- Chat Messages ----
  messages: defineTable({
    conversationId: v.id("conversations"),
    role: messageRole,
    content: v.string(),
    actions: v.optional(v.array(v.any())),
    actionsApplied: v.optional(v.boolean()),
    // Tool thread: intermediate tool_call + tool_result messages from agentic loop
    toolThread: v.optional(v.array(v.any())),
  }).index("by_conversation", ["conversationId"]),

  // ---- Muscle Assessments (Evidence Chain) ----
  muscleAssessments: defineTable({
    muscleId: v.id("muscles"),
    type: assessmentType,
    value: v.number(),
    unit: v.string(),
    testName: v.optional(v.string()),
    bodyweightAtTest: v.optional(v.number()),
    expectedValue: v.optional(v.number()),
    reasoning: v.string(),
    source: assessmentSource,
    confidence: v.optional(v.number()),
    derivedFromIds: v.array(v.string()),
    createdBy: v.optional(v.string()),
  }).index("by_muscle", ["muscleId"]),

  // ---- Workout Plans ----
  workoutPlans: defineTable({
    userId: v.id("users"),
    title: v.string(),
    notes: v.optional(v.string()),
    isActive: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_active", ["userId", "isActive"]),

  // ---- Workout Exercises (todo items within a plan) ----
  workoutExercises: defineTable({
    planId: v.id("workoutPlans"),
    name: v.string(),
    sets: v.optional(v.number()),
    reps: v.optional(v.number()),
    durationSecs: v.optional(v.number()),
    weight: v.optional(v.number()),
    weightUnit: v.optional(v.string()),
    notes: v.optional(v.string()),
    targetMeshIds: v.array(v.string()), // which muscles this targets
    order: v.number(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  })
    .index("by_plan", ["planId"])
    .index("by_plan_order", ["planId", "order"]),

  // ---- Reference: Strength Norms ----
  strengthNorms: defineTable({
    testName: v.string(),
    muscleGroup: v.string(),
    sex: bodySex,
    ageMin: v.number(),
    ageMax: v.number(),
    coefficient: v.number(),
  }).index("by_test_sex", ["testName", "sex"]),

  // ---- Reference: ROM Norms ----
  romNorms: defineTable({
    jointName: v.string(),
    movement: v.string(),
    normalMin: v.number(),
    normalMax: v.number(),
  }).index("by_joint_movement", ["jointName", "movement"]),
});
