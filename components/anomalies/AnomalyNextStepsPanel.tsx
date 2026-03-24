// Right panel — always visible alongside tabs.
// Internal scroll if content overflows.

interface Props {
  nextSteps: {
    inspectNow: string[];
    monitor: string[];
    escalate: string[];
  };
}

const SECTIONS = [
  { key: "inspectNow", title: "Inspect Now", subtitle: "Immediate physical checks" },
  { key: "monitor", title: "Monitor", subtitle: "Watch over next 24–72 hours" },
  { key: "escalate", title: "Escalate", subtitle: "When to call a technician" },
] as const;

export default function AnomalyNextStepsPanel({ nextSteps }: Props) {
  return (
    <div className="border rounded-xl h-full flex flex-col overflow-hidden">
      <div className="shrink-0 px-4 py-3 border-b bg-gray-50/50">
        <h3 className="text-sm font-semibold text-gray-700">Next Steps</h3>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4">
        {SECTIONS.map(({ key, title, subtitle }) => (
          <div key={key}>
            <p className="text-xs font-medium text-gray-700 mb-0.5">{title}</p>
            <p className="text-[10px] text-gray-400 mb-2">{subtitle}</p>
            <ul className="space-y-1.5">
              {nextSteps[key].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-600 leading-relaxed">
                  <span className="mt-1 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
                  {step}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
