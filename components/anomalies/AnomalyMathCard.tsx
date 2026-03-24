import type { AnomalyDefinition } from "@/lib/anomalies/anomaly-definitions";

interface Props {
  definition: AnomalyDefinition;
  observedValue: { value: number | null; isPlaceholder: boolean };
  threshold: { value: number | null; unit: string };
}

export default function AnomalyMathCard({ definition, observedValue, threshold }: Props) {
  const hasRealData = !observedValue.isPlaceholder && observedValue.value != null;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Left: Napkin Math */}
        <div>
          <h3 className="text-sm font-medium text-gray-600 mb-3">Napkin Math</h3>
          <div className="space-y-2">
            {definition.napkinMath.map((row, i) => (
              <div key={i} className="flex items-start gap-3">
                <span className="text-xs font-mono text-gray-400 mt-0.5 w-4 shrink-0">{i + 1}.</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-gray-700">{row.label}</span>
                    <span className="text-sm font-mono font-semibold text-gray-900">{row.value}</span>
                    {!hasRealData && (
                      <span className="text-[10px] text-amber-500 font-medium">(example)</span>
                    )}
                  </div>
                  {row.note && (
                    <p className="text-[10px] text-gray-400 mt-0.5">{row.note}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
          {threshold.value != null && hasRealData && (
            <div className="mt-4 p-3 rounded-lg bg-gray-50">
              <p className="text-xs text-gray-500">
                With your data: observed <span className="font-mono font-semibold">{observedValue.value}{threshold.unit}</span>
                {" "}{definition.thresholdDirection === "above" ? ">" : "<"}{" "}
                threshold <span className="font-mono font-semibold">{threshold.value}{threshold.unit}</span>
              </p>
            </div>
          )}
        </div>

        {/* Right: Data Inputs */}
        <div>
          <h3 className="text-sm font-medium text-gray-600 mb-3">Data Inputs Used</h3>
          <ul className="space-y-2">
            {definition.requiredInputs.map((input, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                {input}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
