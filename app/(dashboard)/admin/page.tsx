import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import MarketingAdminCard from "@/components/MarketingAdminCard";
import OrganizationsAdminCard from "@/components/OrganizationsAdminCard";
import InternalTrackingPanel from "@/components/admin/InternalTrackingPanel";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getServiceProviderInfo(email: string): Promise<{ isSSB: boolean; userId: string | null }> {
  const { data } = await supabase
    .from("a_users")
    .select("user_id")
    .eq("email", email)
    .single();

  if (!data) return { isSSB: false, userId: null };

  const { data: memberships } = await supabase
    .from("a_orgs_users_memberships")
    .select(`
      org_id,
      a_organizations!inner (parent_org_id)
    `)
    .eq("user_id", data.user_id)
    .eq("status", "active")
    .is("a_organizations.parent_org_id", null);

  return { isSSB: (memberships?.length ?? 0) > 0, userId: data.user_id };
}

export default async function AdminPage() {
  const email = await getCurrentUserEmail();

  if (!email) redirect("/live");

  const { isSSB, userId } = await getServiceProviderInfo(email);
  if (!isSSB) redirect("/live");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-gray-500">
          Manage marketing, leads, and platform settings
        </p>
      </div>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/trust?tab=sop-standards"
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
        >
          SOP Standards
        </Link>
        <Link
          href="/admin/ha-automations"
          className="px-4 py-2 rounded-lg border border-gray-200 bg-white shadow-sm hover:bg-gray-50 text-sm font-medium text-gray-700 transition-colors"
        >
          HA Automations
        </Link>
      </div>

      <MarketingAdminCard userEmail={email} />
      <OrganizationsAdminCard />
      <InternalTrackingPanel userEmail={email} userId={userId!} />
    </div>
  );
}
