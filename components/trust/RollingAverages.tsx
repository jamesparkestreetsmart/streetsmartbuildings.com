"use client";

interface RollingAvg {
  average: number;
  days_with_data: number;
  total_days: number;
  status: string;
}

interface Props {
  averages: {
    "7": RollingAvg | null;
    "30": RollingAvg | null;
    "90": RollingAvg | null;
  };
}

const STATUS_BG: Record<string, string> = {
  green: "border-green-200 bg-green-50",
  yellow: "border-yellow-200 bg-yellow-50",
  red: "border-red-200 bg-red-50",
  no_data: "border-gray-200 bg-gray-50",
};

const STATUS_TEXT: Record<string, string> = {
  green: "text-green-700",
  yellow: "text-yellow-700",
  red: "text-red-700",
  no_data: "text-gray-400",
};

export default function RollingAverages({ averages }: Props) {
  const periods: { key: "7" | "30" | "90"; label: string }[] = [
    { key: "7", label: "7-Day Avg" },
    { key: "30", label: "30-Day Avg" },
    { key: "90", label: "90-Day Avg" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {periods.map(({ key, label }) => {
        const avg = averages[key];
        const status = avg?.status || "no_data";
        const hasData = avg && avg.days_with_data > 0;

        return (
          <div
            key={key}
            className={`border rounded-lg p-3 text-center ${STATUS_BG[status]}`}
          >
            <div className="text-xs font-medium text-gray-500 mb-1">{label}</div>
            <div className={`text-2xl font-bold ${STATUS_TEXT[status]}`}>
              {hasData ? avg.average : "—"}
            </div>
            {hasData && (
              <div className="text-[10px] text-gray-400 mt-0.5">
                {avg.days_with_data}/{avg.total_days} days
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
