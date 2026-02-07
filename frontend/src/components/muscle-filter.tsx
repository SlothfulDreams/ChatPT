"use client";

import type { MuscleDepth } from "@/types/muscle-depth";
import { MUSCLE_GROUP_LABELS, type MuscleGroup } from "@/types/muscle-groups";

const ALL_GROUPS: MuscleGroup[] = [
  "neck",
  "upper_back",
  "lower_back",
  "chest",
  "shoulders",
  "rotator_cuff",
  "biceps",
  "triceps",
  "forearms",
  "core",
  "hip_flexors",
  "glutes",
  "quads",
  "adductors",
  "hamstrings",
  "calves",
  "shins",
];

const ALL_DEPTHS: { key: MuscleDepth; label: string }[] = [
  { key: "superficial", label: "Surface" },
  { key: "intermediate", label: "Mid" },
  { key: "deep", label: "Deep" },
];

interface MuscleFilterProps {
  activeGroups: Set<MuscleGroup>;
  onToggleGroup: (group: MuscleGroup) => void;
  onClearGroups: () => void;
  selectedDepths: Set<MuscleDepth>;
  onToggleDepth: (depth: MuscleDepth) => void;
  selectedGroup: MuscleGroup | null;
  onSelectGroup: (group: MuscleGroup | null) => void;
}

export function MuscleFilter({
  activeGroups,
  onToggleGroup,
  onClearGroups,
  selectedDepths,
  onToggleDepth,
  selectedGroup,
  onSelectGroup,
}: MuscleFilterProps) {
  return (
    <div className="pointer-events-auto mosaic-panel flex w-full shrink flex-col gap-3 overflow-y-auto p-4">
      {/* Group Filters */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-white/80">
            Muscle Groups
          </span>
          {activeGroups.size > 0 && (
            <button
              type="button"
              onClick={onClearGroups}
              className="text-xs text-white/40 hover:text-white"
            >
              Clear
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_GROUPS.map((group) => {
            const isActive = activeGroups.has(group);
            const isFocused = selectedGroup === group;
            return (
              <button
                key={group}
                type="button"
                onClick={() => onToggleGroup(group)}
                onDoubleClick={() => onSelectGroup(isFocused ? null : group)}
                className={`rounded-full px-2.5 py-1 text-xs transition-all ${
                  isFocused
                    ? "mosaic-chip-focus"
                    : isActive
                      ? "mosaic-chip-active"
                      : "mosaic-chip"
                }`}
              >
                {MUSCLE_GROUP_LABELS[group]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Depth Filters */}
      <div>
        <span className="mb-2 block text-xs font-semibold text-white/80">
          Depth Layer
        </span>
        <div className="flex gap-1.5">
          {ALL_DEPTHS.map(({ key, label }) => {
            const isActive = selectedDepths.has(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => onToggleDepth(key)}
                className={`flex-1 rounded-lg px-2 py-1.5 text-xs transition-all ${
                  isActive ? "mosaic-chip-active" : "mosaic-chip"
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
