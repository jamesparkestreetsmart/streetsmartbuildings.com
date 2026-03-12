import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import SOPConfigsClient from "./SOPConfigsClient";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkSSBAdmin(email: string): Promise<boolean> {
  const { data } = await supabase
    .from("a_users")
    .select("user_id")
    .eq("email", email)
    .single();
  if (!data) return false;

  const { data: memberships } = await supabase
    .from("a_orgs_users_memberships")
    .select(`org_id, a_organizations!inner (parent_org_id)`)
    .eq("user_id", data.user_id)
    .eq("status", "active")
    .is("a_organizations.parent_org_id", null);

  return (memberships?.length ?? 0) > 0;
}

export default async function SOPConfigsPage() {
  const email = await getCurrentUserEmail();
  if (!email) redirect("/live");

  const isSSB = await checkSSBAdmin(email);
  if (!isSSB) redirect("/live");

  return <SOPConfigsClient />;
}
