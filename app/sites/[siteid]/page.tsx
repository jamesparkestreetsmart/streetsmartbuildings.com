// app/sites/[siteid]/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import EquipmentTable from "./equipment-table";

type SitePageProps = {
  params: { siteid: string };
};

export default async function SitePage({ params }: SitePageProps) {
  const { siteid } = params;

  // --- Supabase (server-side) ---
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
    .select(
      "site_id, site_name, address, city, state, postal_code, phone_number"
    )
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

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* HEADER CARD */}
      <div className="rounded-2xl shadow bg-white border border-slate-200 overflow-hidden">
        {/* green → gold accent bar */}
        <div className="h-1 bg-gradient-to-r from-emerald-500 via-lime-400 to-amber-400" />
        <div className="p-6 md:p-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-emerald-600 to-amber-500 bg-clip-text text-transparent">
            {site.site_name}
          </h1>

          {/* Phone */}
          <p className="text-gray-700 mb-1">
            <span className="font-semibold">Phone:</span>{" "}
            {site.phone_number || "—"}
          </p>

          {/* Address */}
          <p className="text-gray-700">
            <span className="font-semibold">Address:</span>{" "}
            {site.address}
            {site.city && `, ${site.city}`}
            {site.state && `, ${site.state}`}
            {site.postal_code && ` ${site.postal_code}`}
          </p>
        </div>
      </div>

      {/* EQUIPMENT TABLE */}
      <EquipmentTable siteid={siteid} />
    </div>
  );
}
