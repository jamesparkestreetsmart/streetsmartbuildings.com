// app/sites/[siteid]/edit/page.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EditSiteForm from "@/components/sites/EditSiteForm";

export const dynamic = "force-dynamic";

export default async function EditSitePage(props: any) {
  const params = await props.params;
  const siteid = params?.siteid;   // ✅ Correct here (NOT await)

  if (!siteid) {
    return (
      <div className="p-6 text-red-600">
        Error: Missing site ID in URL
      </div>
    );
  }

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );

  const { data: site, error } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", siteid)
    .single();

  if (error || !site) {
    console.error("Site fetch error:", error);
    return (
      <div className="p-6 text-red-600">
        Error loading site details
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto p-6">
        <EditSiteForm site={site} />
      </div>
    </div>
  );
}
