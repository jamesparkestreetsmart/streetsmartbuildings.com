// app/sites/[siteid]/page.tsx

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import EquipmentTable from "./equipment-table";

export const dynamic = "force-dynamic";

export default async function SitePage(props: any) {
  console.log("RAW PROPS FROM SERVER:", props);

  // 🚀 FIX: params may be a Promise on Vercel but not in dev
  const resolved = await props.params;
  console.log("RESOLVED PARAMS:", resolved);

  const siteid = resolved?.siteid;

  if (!siteid) {
    console.error("Missing siteid param");
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Invalid site: Missing site ID in URL
        </h1>
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
      <div className="p-6">
        <h1 className="text-xl font-semibold text-red-600">
          Site not found or error loading site
        </h1>
      </div>
    );
  }

  // 👉 Build formatted address safely
  const fullAddress =
    [
      site.address_line1,
      site.address_line2,
      site.city,
      site.state,
      site.postal_code,
      site.country,
    ]
      .filter((x) => x && x.trim() !== "")
      .join(", ") || "—";

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* HEADER */}
      <div className="bg-white shadow p-6 rounded-xl border border-gray-200">
        <h1 className="text-3xl font-bold mb-2">{site.site_name}</h1>

        {/* Address */}
        <p className="text-gray-700">
          <span className="font-semibold">Address:</span> {fullAddress}
        </p>

        {/* Phone */}
        {site.phone_number && site.phone_number.trim() !== "" && (
          <p className="text-gray-700 mt-1">
            <span className="font-semibold">Phone:</span> {site.phone_number}
          </p>
        )}
      </div>

      {/* EQUIPMENT TABLE */}
      <EquipmentTable siteid={siteid} />
    </div>
  );
}
