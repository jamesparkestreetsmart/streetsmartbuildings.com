// app/sites/[siteid]/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import WeatherSummary from "./weather-summary";
import EquipmentTable from "./equipment-table";

export default async function SitePage(props: {
  params: Promise<{ siteid: string }>
}) {
  const { siteid } = await props.params;

  console.log("SERVER HIT /sites/[siteid]:", siteid);

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
      <div className="p-6 text-red-600 text-xl">
        Site not found or error loading site
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-white shadow p-6 rounded-xl border">
        <h1 className="text-3xl font-bold mb-2">{site.site_name}</h1>
        <p className="text-gray-700">{site.address}</p>
        {site.phone_number && (
          <p className="text-gray-700 mt-1">
            <strong>Phone:</strong> {site.phone_number}
          </p>
        )}
      </div>

      <WeatherSummary />

      <EquipmentTable siteid={siteid} />
    </div>
  );
}
