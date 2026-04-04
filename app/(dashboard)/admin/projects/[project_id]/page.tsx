import { redirect } from "next/navigation";
import { getCurrentUserEmail } from "@/lib/auth";
import { createClient } from "@supabase/supabase-js";
import ProjectDetailPage from "@/components/admin/hardware/ProjectDetailPage";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getServiceProviderInfo(email: string): Promise<{ isSSB: boolean }> {
  const { data } = await supabase.from("a_users").select("user_id").eq("email", email).single();
  if (!data) return { isSSB: false };
  const { data: memberships } = await supabase
    .from("a_orgs_users_memberships")
    .select("org_id, a_organizations!inner(parent_org_id)")
    .eq("user_id", data.user_id)
    .eq("status", "active")
    .is("a_organizations.parent_org_id", null);
  return { isSSB: (memberships?.length ?? 0) > 0 };
}

export default async function ProjectDetailRoute({
  params,
}: {
  params: { project_id: string };
}) {
  const email = await getCurrentUserEmail();
  if (!email) redirect("/live");
  const { isSSB } = await getServiceProviderInfo(email);
  if (!isSSB) redirect("/live");
  return <ProjectDetailPage projectId={params.project_id} />;
}
