export type Tier = "SSB" | "ORG" | "SITE";

const TIER_STYLES: Record<Tier, string> = {
  SSB: "bg-indigo-100 text-indigo-700 border-indigo-200",
  ORG: "bg-green-100 text-green-700 border-green-200",
  SITE: "bg-gray-100 text-gray-600 border-gray-200",
};

export default function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded border ${TIER_STYLES[tier]}`}>
      {tier}
    </span>
  );
}
