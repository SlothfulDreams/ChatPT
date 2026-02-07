"use client";

import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBodyState } from "@/hooks/useBodyState";
import { api } from "../../convex/_generated/api";

const EQUIPMENT_OPTIONS = [
  "dumbbells",
  "barbell",
  "kettlebell",
  "bands",
  "machine",
  "pull-up bar",
  "bench",
  "foam roller",
] as const;

const EQUIPMENT_ICONS: Record<string, string> = {
  dumbbells: "\u2742",
  barbell: "\u2505",
  kettlebell: "\u25C9",
  bands: "\u223F",
  machine: "\u2699",
  "pull-up bar": "\u2502",
  bench: "\u25AC",
  "foam roller": "\u25CB",
};

const GOAL_OPTIONS = [
  "rehabilitation",
  "flexibility",
  "strength",
  "endurance",
  "general fitness",
] as const;

const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120] as const;

interface SettingsModalProps {
  onClose: () => void;
}

export function SettingsModal({ onClose }: SettingsModalProps) {
  const { body } = useBodyState();
  const updateBody = useMutation(api.body.update);

  // Local state seeded from body
  const [sex, setSex] = useState<"male" | "female">(body?.sex ?? "male");
  const [weightKg, setWeightKg] = useState(body?.weightKg?.toString() ?? "");
  const [heightCm, setHeightCm] = useState(body?.heightCm?.toString() ?? "");
  const [equipment, setEquipment] = useState<string[]>(body?.equipment ?? []);
  const [fitnessGoals, setFitnessGoals] = useState(body?.fitnessGoals ?? "");
  const [durationMinutes, setDurationMinutes] = useState(
    body?.defaultWorkoutDurationMinutes ?? 45,
  );

  // Sync local state when body loads (it may be null initially)
  const seeded = useRef(false);
  useEffect(() => {
    if (body && !seeded.current) {
      seeded.current = true;
      setSex(body.sex);
      setWeightKg(body.weightKg?.toString() ?? "");
      setHeightCm(body.heightCm?.toString() ?? "");
      setEquipment(body.equipment ?? []);
      setFitnessGoals(body.fitnessGoals ?? "");
      setDurationMinutes(body.defaultWorkoutDurationMinutes ?? 45);
    }
  }, [body]);

  // Debounced auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const save = useCallback(
    (
      overrides?: Partial<{
        sex: "male" | "female";
        weightKg: string;
        heightCm: string;
        equipment: string[];
        fitnessGoals: string;
        durationMinutes: number;
      }>,
    ) => {
      if (!body) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const s = overrides?.sex ?? sex;
        const w = overrides?.weightKg ?? weightKg;
        const h = overrides?.heightCm ?? heightCm;
        const e = overrides?.equipment ?? equipment;
        const g = overrides?.fitnessGoals ?? fitnessGoals;
        const d = overrides?.durationMinutes ?? durationMinutes;
        updateBody({
          bodyId: body._id,
          sex: s,
          weightKg: w ? Number(w) : undefined,
          heightCm: h ? Number(h) : undefined,
          equipment: e,
          fitnessGoals: g || undefined,
          defaultWorkoutDurationMinutes: d,
        });
      }, 400);
    },
    [
      body,
      sex,
      weightKg,
      heightCm,
      equipment,
      fitnessGoals,
      durationMinutes,
      updateBody,
    ],
  );

  const handleSexChange = (v: "male" | "female") => {
    setSex(v);
    save({ sex: v });
  };

  const handleWeightChange = (v: string) => {
    setWeightKg(v);
    save({ weightKg: v });
  };

  const handleHeightChange = (v: string) => {
    setHeightCm(v);
    save({ heightCm: v });
  };

  const handleToggleEquipment = (item: string) => {
    const next = equipment.includes(item)
      ? equipment.filter((e) => e !== item)
      : [...equipment, item];
    setEquipment(next);
    save({ equipment: next });
  };

  const handleGoalChange = (goal: string) => {
    const next = fitnessGoals === goal ? "" : goal;
    setFitnessGoals(next);
    save({ fitnessGoals: next });
  };

  const handleDurationChange = (mins: number) => {
    setDurationMinutes(mins);
    save({ durationMinutes: mins });
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        onKeyDown={(e) => e.key === "Escape" && onClose()}
      />

      {/* Panel */}
      <div className="mosaic-panel animate-fade-up relative z-10 flex max-h-[80vh] w-[380px] flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-sm text-white/40 transition-colors hover:bg-white/10 hover:text-white"
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="flex flex-col gap-5">
            {/* ---- Body ---- */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "0ms" }}
            >
              <div className="mosaic-section-label">Body</div>

              {/* Sex toggle */}
              <div className="mb-3 flex gap-1.5">
                {(["male", "female"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSexChange(s)}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium capitalize ${
                      sex === s ? "mosaic-chip-active" : "mosaic-chip"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Weight + Height */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="mb-1 block text-xs text-white/50">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={weightKg}
                    onChange={(e) => handleWeightChange(e.target.value)}
                    placeholder="75"
                    min="0"
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-white/50">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={heightCm}
                    onChange={(e) => handleHeightChange(e.target.value)}
                    placeholder="175"
                    min="0"
                    className="w-full rounded bg-white/10 px-2 py-1.5 text-xs text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-white/20"
                  />
                </div>
              </div>
            </div>

            {/* ---- Equipment ---- */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "60ms" }}
            >
              <div className="mosaic-section-label">Equipment</div>
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_OPTIONS.map((item) => {
                  const isSelected = equipment.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleToggleEquipment(item)}
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        isSelected ? "mosaic-chip-active" : "mosaic-chip"
                      }`}
                    >
                      <span className="mr-1 opacity-60">
                        {EQUIPMENT_ICONS[item]}
                      </span>
                      {item}
                    </button>
                  );
                })}
              </div>
              {equipment.length === 0 && (
                <span className="mt-1.5 inline-block rounded-full bg-white/5 px-2.5 py-1 text-[10px] text-white/30">
                  Bodyweight only
                </span>
              )}
            </div>

            {/* ---- Training ---- */}
            <div
              className="mosaic-section animate-fade-up"
              style={{ animationDelay: "120ms" }}
            >
              <div className="mosaic-section-label">Training</div>

              {/* Goal */}
              <div className="mb-3">
                <label className="mb-1.5 block text-xs text-white/50">
                  Fitness Goal
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {GOAL_OPTIONS.map((goal) => (
                    <button
                      key={goal}
                      type="button"
                      onClick={() => handleGoalChange(goal)}
                      className={`rounded-full px-2.5 py-1 text-xs ${
                        fitnessGoals === goal
                          ? "mosaic-chip-active"
                          : "mosaic-chip"
                      }`}
                    >
                      {goal}
                    </button>
                  ))}
                </div>
              </div>

              {/* Default duration */}
              <div>
                <label className="mb-1.5 block text-xs text-white/50">
                  Default Workout Duration
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {DURATION_OPTIONS.map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleDurationChange(mins)}
                      className={`text-center ${
                        durationMinutes === mins
                          ? "mosaic-chip-active"
                          : "mosaic-chip"
                      }`}
                    >
                      {mins >= 60
                        ? `${mins % 60 === 0 ? mins / 60 : (mins / 60).toFixed(1)}hr`
                        : `${mins}m`}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
