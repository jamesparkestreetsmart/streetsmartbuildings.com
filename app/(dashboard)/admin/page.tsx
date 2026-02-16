import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import MarketingAdminCard from "@/components/MarketingAdminCard";
import OrganizationsAdminCard from "@/components/OrganizationsAdminCard";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function isServiceProvider(email: string): Promise<boolean> {
  // Check if user belongs to a root org (parent_org_id IS NULL)
  const { data } = await supabase
    .from("a_users")
    .select("user_id")
    .eq("email", email)
    .single();

  if (!data) return false;

  const { data: memberships } = await supabase
    .from("a_orgs_users_memberships")
    .select(`
      org_id,
      a_organizations!inner (parent_org_id)
    `)
    .eq("user_id", data.user_id)
    .eq("status", "active")
    .is("a_organizations.parent_org_id", null);

  return (memberships?.length ?? 0) > 0;
}

export default async function AdminPage() {
  const email = await getCurrentUserEmail();

  if (!email || !(await isServiceProvider(email))) {
    redirect("/live");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Admin</h1>
        <p className="text-sm text-gray-500">
          Manage marketing, leads, and platform settings
        </p>
      </div>

      <MarketingAdminCard userEmail={email} />
      <OrganizationsAdminCard />
    </div>
  );
}
