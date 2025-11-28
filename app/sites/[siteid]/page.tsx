// app/sites/[siteid]/page.tsx
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import WeatherSummary from "./weather-summary";
import EquipmentTable from "./equipment-table";

export const dynamic = "force-dynamic";

export default async function SitePage({
  params,
}: {
  params: Promise<{ siteid: string }>;
}) {
  const { siteid } = await params;

  console.log("SERVER HIT /sites/[siteid] with:", siteid);

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

  // Fetch basic site details
  const { data: site, error: siteError } = await supabase
    .from("a_sites")
    .select("*")
    .eq("site_id", siteid)
    .single();

  if (siteError || !site) {
    console.error("Failed to load site:", siteError);
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">Site Not Found</h1>
        <p className="text-gray-500">Could not load site details.</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="bg-white shadow rounded-xl p-6 border">
        <h1 className="text-3xl font-bold mb-2">{site.site_name}</h1>

        <p className="text-gray-700">{site.address}</p>

        {site.phone_number && (
          <p className="text-gray-700 mt-1">
            <strong>Phone:</strong> {site.phone_number}
          </p>
        )}
      </div>

      {/* Weather */}
      <WeatherSummary site={site} />

      {/* Equipment table */}
      <EquipmentTable siteid={siteid} />
    </div>
  );
}
