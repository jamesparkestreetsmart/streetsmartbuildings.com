"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DailyHealthRow } from "@/lib/daily-health";

interface Props {
  month: string; // YYYY-MM
  rows: DailyHealthRow[];
  onDayClick: (date: string) => void;
  selectedDate: string | null;
  onMonthChange: (month: string) => void;
}

const STATUS_COLORS: Record<string, string> = {
  green: "bg-green-500 text-white",
  yellow: "bg-yellow-400 text-gray-900",
  red: "bg-red-500 text-white",
  no_data: "bg-gray-100 text-gray-400",
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function TrustCalendar({ month, rows, onDayClick, selectedDate, onMonthChange }: Props) {
  const [yearStr, monthStr] = month.split("-");
  const year = parseInt(yearStr, 10);
  const mon = parseInt(monthStr, 10); // 1-based

  const firstDay = new Date(year, mon - 1, 1).getDay();
  const daysInMonth = new Date(year, mon, 0).getDate();

  // Build lookup: date string → row
  const rowMap = new Map<string, DailyHealthRow>();
  for (const r of rows) {
    rowMap.set(r.date, r);
  }

  // Aggregate scores per day across sites
  const dayAgg = new Map<string, { score: number; status: string; count: number }>();
  for (const r of rows) {
    const existing = dayAgg.get(r.date);
    if (existing) {
      existing.score += r.score;
      existing.count += 1;
      // Worst status wins
      if (r.overall_status === "red") existing.status = "red";
      else if (r.overall_status === "yellow" && existing.status !== "red") existing.status = "yellow";
    } else {
      dayAgg.set(r.date, { score: r.score, status: r.overall_status, count: 1 });
    }
  }

  const prevMonth = () => {
    const d = new Date(year, mon - 2, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const nextMonth = () => {
    const d = new Date(year, mon, 1);
    onMonthChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const monthLabel = new Date(year, mon - 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="border rounded-lg bg-white shadow-sm p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={prevMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronLeft className="w-5 h-5 text-gray-600" />
        </button>
        <h3 className="text-sm font-semibold text-gray-800">{monthLabel}</h3>
        <button onClick={nextMonth} className="p-1 hover:bg-gray-100 rounded">
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>

      {/* Day labels */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-gray-400 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Day tiles */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = `${month}-${String(day).padStart(2, "0")}`;
          const agg = dayAgg.get(dateStr);
          const status = agg?.status || "no_data";
          const avgScore = agg ? Math.round(agg.score / agg.count) : null;
          const isSelected = selectedDate === dateStr;

          return (
            <button
              key={dateStr}
              onClick={() => onDayClick(dateStr)}
              className={`relative rounded-md p-1 text-center transition-all h-12 flex flex-col items-center justify-center ${
                STATUS_COLORS[status]
              } ${isSelected ? "ring-2 ring-blue-500 ring-offset-1" : "hover:opacity-80"}`}
            >
              <span className="text-xs font-medium leading-none">{day}</span>
              {avgScore !== null && (
                <span className="text-[10px] leading-none mt-0.5 opacity-80">{avgScore}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
