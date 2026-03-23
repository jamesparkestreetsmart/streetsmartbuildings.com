interface Props {
  nextSteps: {
    inspectNow: string[];
    monitor: string[];
    escalate: string[];
  };
}

const SECTIONS = [
  { key: "inspectNow", title: "Inspect Now", subtitle: "Immediate physical checks" },
  { key: "monitor", title: "Monitor", subtitle: "Watch over next 24\u201372 hours" },
  { key: "escalate", title: "Escalate", subtitle: "When to call a technician" },
] as const;

export default function AnomalyNextSteps({ nextSteps }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Next Steps</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {SECTIONS.map(({ key, title, subtitle }) => (
          <div key={key} className="border rounded-xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-0.5">{title}</p>
            <p className="text-[10px] text-gray-400 mb-3">{subtitle}</p>
            <ul className="space-y-2">
              {nextSteps[key].map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-300 shrink-0" />
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
