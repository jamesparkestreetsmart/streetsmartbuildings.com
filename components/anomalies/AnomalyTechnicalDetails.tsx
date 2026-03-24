// Technical Details tab content — same content as V1 accordion but
// displayed directly (no accordion needed since it's inside a tab).

import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

interface Props {
  technicalNotes: string[];
  definition: AnomalyDefinition;
}

export default function AnomalyTechnicalDetails({ technicalNotes, definition }: Props) {
  return (
    <div className="space-y-5">
      {/* Computation Steps */}
      <div>
        <h4 className="text-sm font-medium text-gray-600 mb-2">Computation Steps</h4>
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
        <h4 className="text-sm font-medium text-gray-600 mb-2">Trigger Condition</h4>
        <p className="text-sm text-gray-600">
          Anomaly is flagged when observed value is{" "}
          <span className="font-semibold">
            {definition.thresholdDirection === "above" ? "above" : "below"}
          </span>{" "}
          the configured threshold ({definition.thresholdLabel}).
        </p>
      </div>

      {/* Required Data Inputs */}
      <div>
        <h4 className="text-sm font-medium text-gray-600 mb-2">Required Data Inputs</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          {definition.requiredInputs.map((input, i) => (
            <li key={i}>• {input}</li>
          ))}
        </ul>
      </div>

      {/* Caveats & Limitations */}
      {technicalNotes.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-gray-600 mb-2">Caveats & Limitations</h4>
          <ul className="text-sm text-gray-600 space-y-1.5">
            {technicalNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-gray-400 shrink-0">•</span>
                {note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
