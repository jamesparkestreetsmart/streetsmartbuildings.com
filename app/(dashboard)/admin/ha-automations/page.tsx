import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import HAAutomationsPanel from "@/components/admin/HAAutomationsPanel";

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

export default async function HAAutomationsPage() {
  const email = await getCurrentUserEmail();
  if (!email) redirect("/live");

  const { isSSB } = await getServiceProviderInfo(email);
  if (!isSSB) redirect("/live");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">HA Automations</h1>
        <p className="text-sm text-gray-500">
          Manage automation templates, deployments, and drift status across sites
        </p>
      </div>
      <HAAutomationsPanel />
    </div>
  );
}
