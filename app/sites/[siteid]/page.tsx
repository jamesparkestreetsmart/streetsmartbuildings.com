// app/sites/[siteid]/page.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EquipmentTable from "./equipment-table";

export default async function SitePage(
  { params }: { params: { siteid: string } }
) {
  console.log("DEBUG RAW PARAMS:", params);

  const { siteid } = params;
  console.log("DEBUG SITEID:", siteid);

  if (!siteid) {
    return (
      <div className="p-6 text-red-600 text-xl">
        Invalid site: Missing site ID in URL
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
      <div className="p-6 text-xl text-red-600">
        Site not found or error loading site
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-white p-4 rounded-lg shadow border">
        <h1 className="text-2xl font-bold">{site.site_name}</h1>
        <p className="text-gray-700">{site.address}</p>
        {site.phone_number && (
          <p className="text-gray-700">Phone: {site.phone_number}</p>
        )}
      </div>

      <EquipmentTable siteid={siteid} />
    </div>
  );
}
