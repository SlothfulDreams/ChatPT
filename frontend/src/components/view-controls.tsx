"use client";

interface ViewControlsProps {
  isFrontView: boolean;
  onToggleView: () => void;
}

export function ViewControls({ isFrontView, onToggleView }: ViewControlsProps) {
  return (
    <div className="pointer-events-auto flex gap-2">
      <button
        type="button"
        onClick={onToggleView}
        className="mosaic-btn px-4 py-2 text-xs font-medium text-white transition-colors"
      >
        {isFrontView ? "Back View" : "Front View"}
      </button>
    </div>
  );
}
