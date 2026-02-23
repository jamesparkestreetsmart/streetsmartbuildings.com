"use client";

const SEGMENT_COLORS = [
  "#2563eb", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#14b8a6", "#6366f1",
];

interface SpaceWeight {
  name: string;
  zone_weight: number | null;
  computed_temp: number | null;
}

interface Props {
  spaces: SpaceWeight[];
}

export default function ZoneWeightBar({ spaces }: Props) {
  const hasWeights = spaces.some((s) => s.zone_weight != null && s.zone_weight > 0);

  if (!hasWeights) {
    return (
      <div>
        <div className="h-6 rounded-full bg-gray-100 flex items-center justify-center">
          <span className="text-[10px] text-gray-400">No weights configured</span>
        </div>
      </div>
    );
  }

  const totalWeight = spaces.reduce((sum, s) => sum + (s.zone_weight || 0), 0);

  return (
    <div>
      <div className="flex h-6 rounded-full overflow-hidden bg-gray-100">
        {spaces.map((space, i) => {
          const w = space.zone_weight || 0;
          if (w <= 0) return null;
          const pct = totalWeight > 0 ? (w / totalWeight) * 100 : 0;
          return (
            <div
              key={space.name}
              className="flex items-center justify-center text-[10px] text-white font-medium truncate px-1"
              style={{
                width: `${pct}%`,
                backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                minWidth: pct > 0 ? "24px" : 0,
              }}
              title={`${space.name}: ${(w * 100).toFixed(0)}%`}
            >
              {pct >= 12 ? `${(w * 100).toFixed(0)}%` : ""}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
        {spaces.map((space, i) => (
          <div key={space.name} className="flex items-center gap-1.5 text-[11px]">
            <div
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
            />
            <span className="text-gray-700">{space.name}</span>
            <span className="text-gray-400">
              {space.zone_weight != null ? `${(space.zone_weight * 100).toFixed(0)}%` : "—"}
            </span>
            {space.computed_temp != null && (
              <span className="text-gray-500 font-mono">{space.computed_temp}°F</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
