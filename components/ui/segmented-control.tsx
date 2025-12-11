"use client";

import { cn } from "@/lib/utils";

interface SegmentedControlOption {
  label: string;
  value: string;
}

interface SegmentedControlProps {
  value: string;
  onChange: (val: string) => void;
  options: SegmentedControlOption[];
  className?: string;
}

export function SegmentedControl({
  value,
  onChange,
  options,
  className,
}: SegmentedControlProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center p-1 rounded-xl bg-muted border shadow-sm",
        className
      )}
    >
      {options.map((opt) => {
        const isActive = value === opt.value;

        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-all",
              isActive
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
