interface Props {
  whyItMatters: {
    operationalRisk: string;
    businessImpact: string;
    recommendedAction: string;
  };
}

const CARDS = [
  { key: "operationalRisk", title: "Operational Risk", color: "border-l-amber-400" },
  { key: "businessImpact", title: "Cost / Business Impact", color: "border-l-blue-400" },
  { key: "recommendedAction", title: "Recommended Action", color: "border-l-green-400" },
] as const;

export default function AnomalyWhyItMatters({ whyItMatters }: Props) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Why It Matters</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {CARDS.map(({ key, title, color }) => (
          <div key={key} className={`border rounded-xl p-4 border-l-4 ${color}`}>
            <p className="text-xs font-medium text-gray-500 mb-2">{title}</p>
            <p className="text-sm text-gray-700 leading-relaxed">{whyItMatters[key]}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
