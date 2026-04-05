import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import TickerDetailPanel from "./TickerDetailPanel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getServiceProviderInfo(email: string): Promise<{ isSSB: boolean }> {
  const { data } = await supabase
    .from("a_users")
    .select("user_id")
    .eq("email", email)
    .single();

  if (!data) return { isSSB: false };

  const { data: memberships } = await supabase
    .from("a_orgs_users_memberships")
    .select(`
      org_id,
      a_organizations!inner (parent_org_id)
    `)
    .eq("user_id", data.user_id)
    .eq("status", "active")
    .is("a_organizations.parent_org_id", null);

  return { isSSB: (memberships?.length ?? 0) > 0 };
}

export default async function TickerPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const email = await getCurrentUserEmail();
  if (!email) redirect("/live");

  const { isSSB } = await getServiceProviderInfo(email);
  if (!isSSB) redirect("/live");

  const { ticker } = await params;
  const upperTicker = ticker.toUpperCase();

  // Fetch security metadata server-side
  const { data: security } = await supabase
    .from("zzz_securities")
    .select("id, ticker, company_name, exchange, index_membership, gics_sector, gics_sub_industry")
    .eq("ticker", upperTicker)
    .single();

  if (!security) {
    return (
      <div className="space-y-6">
        <a
          href="/admin/finance/securities"
          className="text-sm text-green-600 hover:underline inline-flex items-center gap-1"
        >
          ← Back to Securities
        </a>
        <div className="border rounded-lg bg-white p-12 text-center">
          <p className="text-lg font-semibold text-gray-800">Ticker not found</p>
          <p className="text-sm text-gray-500 mt-1">&quot;{upperTicker}&quot; is not in the database.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TickerDetailPanel security={security} />
    </div>
  );
}
