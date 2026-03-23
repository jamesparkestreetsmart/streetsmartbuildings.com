"use client";

import { useState } from "react";
import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

interface Props {
  technicalNotes: string[];
  definition: AnomalyDefinition;
}

export default function AnomalyTechnicalLogicAccordion({ technicalNotes, definition }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="border rounded-xl">
      <button
        onClick={() => setOpen(!open)}
        className="w-full px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 rounded-xl transition-colors"
      >
        <span className="text-sm font-medium text-gray-700">Technical Details</span>
        <span className="text-gray-400 text-xs">{open ? "\u25B2" : "\u25BC"}</span>
      </button>
      {open && (
        <div className="px-6 pb-6 space-y-4 border-t">
          {/* Formula / Computation */}
          <div className="pt-4">
            <h4 className="text-xs font-medium text-gray-500 mb-2">Computation Steps</h4>
            <div className="space-y-1">
              {definition.napkinMath.map((row, i) => (
                <p key={i} className="text-xs font-mono text-gray-600">
                  {i + 1}. {row.label} = {row.value}
                  {row.note && <span className="text-gray-400 ml-2">// {row.note}</span>}
                </p>
              ))}
            </div>
          </div>

          {/* Trigger Condition */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">Trigger Condition</h4>
            <p className="text-xs text-gray-600">
              Anomaly is flagged when observed value is{" "}
              <span className="font-semibold">
                {definition.thresholdDirection === "above" ? "above" : "below"}
              </span>{" "}
              the configured threshold ({definition.thresholdLabel}).
            </p>
          </div>

          {/* Required Inputs */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">Required Data Inputs</h4>
            <ul className="text-xs text-gray-600 space-y-0.5">
              {definition.requiredInputs.map((input, i) => (
                <li key={i}>\u2022 {input}</li>
              ))}
            </ul>
          </div>

          {/* Notes / Caveats */}
          {technicalNotes.length > 0 && (
            <div>
              <h4 className="text-xs font-medium text-gray-500 mb-2">Caveats & Limitations</h4>
              <ul className="text-xs text-gray-600 space-y-1">
                {technicalNotes.map((note, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="text-gray-400 shrink-0">\u2022</span>
                    {note}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
